import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PricingDatabaseManager,
  SUPPORTED_REGIONS,
  REGION_MULTIPLIERS,
  PRICING_MODEL_FACTORS,
  VALID_PRICING_MODELS,
  UPDATE_INTERVAL_MS,
  computeRegionalPricing,
  buildPricingKey,
  serializePricingRecord,
  deserializePricingRecord,
} from "./pricingDatabaseManager";
import { PRICING_TABLE, type PricingEntry } from "./costAnalyzer";
import type { ResourceConfig } from "@aws-intel/shared";

// --- Mock dynamodb ---
vi.mock("../../lib/dynamodb", () => ({
  put: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue([]),
  del: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
}));

import * as dynamodb from "../../lib/dynamodb";

// ============================================================
// Helper function tests
// ============================================================

describe("computeRegionalPricing", () => {
  const baseEntry: PricingEntry = {
    hourlyRate: 0.10,
    freeTierEligible: false,
    description: "Test resource",
  };

  it("returns base pricing for us-east-1 On-Demand", () => {
    const result = computeRegionalPricing(baseEntry, "us-east-1", "On-Demand");
    expect(result.hourlyRate).toBe(0.10);
    expect(result.dailyCost).toBe(2.4);
    expect(result.monthlyCost).toBe(73);
    expect(result.pricingModel).toBe("On-Demand");
  });

  it("applies regional multiplier for ap-northeast-1", () => {
    const result = computeRegionalPricing(baseEntry, "ap-northeast-1", "On-Demand");
    expect(result.hourlyRate).toBe(0.118);
    expect(result.pricingModel).toBe("On-Demand");
  });

  it("applies Reserved discount factor", () => {
    const result = computeRegionalPricing(baseEntry, "us-east-1", "Reserved");
    expect(result.hourlyRate).toBe(0.06);
    expect(result.pricingModel).toBe("Reserved");
  });

  it("applies Spot discount factor", () => {
    const result = computeRegionalPricing(baseEntry, "us-east-1", "Spot");
    expect(result.hourlyRate).toBe(0.03);
    expect(result.pricingModel).toBe("Spot");
  });

  it("combines regional multiplier and pricing model factor", () => {
    // sa-east-1 multiplier = 1.25, Reserved factor = 0.6
    const result = computeRegionalPricing(baseEntry, "sa-east-1", "Reserved");
    expect(result.hourlyRate).toBe(0.075);
  });

  it("defaults to 1.0 multiplier for unknown region", () => {
    const result = computeRegionalPricing(baseEntry, "unknown-region", "On-Demand");
    expect(result.hourlyRate).toBe(0.10);
  });

  it("returns zero pricing for zero hourly rate", () => {
    const freeEntry: PricingEntry = {
      hourlyRate: 0.0,
      freeTierEligible: true,
      description: "Free resource",
    };
    const result = computeRegionalPricing(freeEntry, "us-east-1", "On-Demand");
    expect(result.hourlyRate).toBe(0);
    expect(result.dailyCost).toBe(0);
    expect(result.monthlyCost).toBe(0);
  });
});

describe("buildPricingKey", () => {
  it("returns resource type when no instance type", () => {
    expect(buildPricingKey("EC2")).toBe("EC2");
  });

  it("returns composite key with instance type", () => {
    expect(buildPricingKey("EC2", "t3.micro")).toBe("EC2:t3.micro");
  });
});

describe("serializePricingRecord", () => {
  it("creates a valid pricing record", () => {
    const pricing = { hourlyRate: 0.10, dailyCost: 2.4, monthlyCost: 73, pricingModel: "On-Demand" };
    const entry: PricingEntry = {
      hourlyRate: 0.10,
      freeTierEligible: true,
      freeTierLimit: "750 hrs/month",
      description: "Test EC2",
    };
    const now = new Date("2025-01-15T00:00:00Z");

    const record = serializePricingRecord("EC2", "us-east-1", pricing, entry, now);

    expect(record.serviceCode).toBe("EC2");
    expect(record.region).toBe("us-east-1");
    expect(record.hourlyRate).toBe(0.10);
    expect(record.dailyCost).toBe(2.4);
    expect(record.monthlyCost).toBe(73);
    expect(record.pricingModel).toBe("On-Demand");
    expect(record.freeTierEligible).toBe(true);
    expect(record.freeTierLimit).toBe("750 hrs/month");
    expect(record.description).toBe("Test EC2");
    expect(record.updatedAt).toBe("2025-01-15T00:00:00.000Z");
  });

  it("handles entry without freeTierLimit", () => {
    const pricing = { hourlyRate: 0.05, dailyCost: 1.2, monthlyCost: 36.5, pricingModel: "Reserved" };
    const entry: PricingEntry = {
      hourlyRate: 0.05,
      freeTierEligible: false,
      description: "NAT Gateway",
    };
    const record = serializePricingRecord("NAT Gateway", "eu-west-1", pricing, entry, new Date());

    expect(record.freeTierEligible).toBe(false);
    expect(record.freeTierLimit).toBeUndefined();
  });
});

describe("deserializePricingRecord", () => {
  it("deserializes a DynamoDB record to ResourcePricing", () => {
    const record = {
      serviceCode: "EC2",
      region: "us-east-1",
      hourlyRate: 0.0104,
      dailyCost: 0.2496,
      monthlyCost: 7.592,
      pricingModel: "On-Demand",
      freeTierEligible: true,
    };

    const pricing = deserializePricingRecord(record);

    expect(pricing.hourlyRate).toBe(0.0104);
    expect(pricing.dailyCost).toBe(0.2496);
    expect(pricing.monthlyCost).toBe(7.592);
    expect(pricing.pricingModel).toBe("On-Demand");
  });

  it("defaults missing fields to zero/On-Demand", () => {
    const pricing = deserializePricingRecord({});

    expect(pricing.hourlyRate).toBe(0);
    expect(pricing.dailyCost).toBe(0);
    expect(pricing.monthlyCost).toBe(0);
    expect(pricing.pricingModel).toBe("On-Demand");
  });
});

// ============================================================
// Constants tests
// ============================================================

describe("SUPPORTED_REGIONS", () => {
  it("includes all major AWS regions", () => {
    expect(SUPPORTED_REGIONS).toContain("us-east-1");
    expect(SUPPORTED_REGIONS).toContain("eu-west-1");
    expect(SUPPORTED_REGIONS).toContain("ap-northeast-1");
    expect(SUPPORTED_REGIONS).toContain("sa-east-1");
    expect(SUPPORTED_REGIONS.length).toBeGreaterThanOrEqual(15);
  });
});

describe("REGION_MULTIPLIERS", () => {
  it("has a multiplier for every supported region", () => {
    for (const region of SUPPORTED_REGIONS) {
      expect(REGION_MULTIPLIERS[region]).toBeDefined();
      expect(REGION_MULTIPLIERS[region]).toBeGreaterThan(0);
    }
  });

  it("us-east-1 has multiplier of 1.0", () => {
    expect(REGION_MULTIPLIERS["us-east-1"]).toBe(1.0);
  });
});

describe("PRICING_MODEL_FACTORS", () => {
  it("On-Demand is 1.0", () => {
    expect(PRICING_MODEL_FACTORS["On-Demand"]).toBe(1.0);
  });

  it("Reserved is less than On-Demand", () => {
    expect(PRICING_MODEL_FACTORS["Reserved"]).toBeLessThan(1.0);
  });

  it("Spot is less than Reserved", () => {
    expect(PRICING_MODEL_FACTORS["Spot"]).toBeLessThan(PRICING_MODEL_FACTORS["Reserved"]);
  });
});

// ============================================================
// PricingDatabaseManager class tests
// ============================================================

describe("PricingDatabaseManager", () => {
  let manager: PricingDatabaseManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new PricingDatabaseManager();
  });

  describe("updatePricing", () => {
    it("writes pricing records to DynamoDB for all resource/region/model combos", async () => {
      await manager.updatePricing();

      const pricingEntryCount = Object.keys(PRICING_TABLE).length;
      const regionCount = SUPPORTED_REGIONS.length;
      const modelCount = VALID_PRICING_MODELS.length;
      // +1 for the METADATA record
      const expectedCalls = pricingEntryCount * regionCount * modelCount + 1;

      expect(dynamodb.put).toHaveBeenCalledTimes(expectedCalls);
    });

    it("stores a METADATA record with the update timestamp", async () => {
      await manager.updatePricing();

      const calls = vi.mocked(dynamodb.put).mock.calls;
      const metadataCall = calls.find(
        (c) => (c[0].Item as Record<string, unknown>).serviceCode === "METADATA"
      );

      expect(metadataCall).toBeDefined();
      expect((metadataCall![0].Item as Record<string, unknown>).region).toBe("LAST_UPDATE");
      expect((metadataCall![0].Item as Record<string, unknown>).updatedAt).toBeDefined();
    });

    it("uses PricingData table", async () => {
      await manager.updatePricing();

      const firstCall = vi.mocked(dynamodb.put).mock.calls[0];
      expect(firstCall[0].TableName).toBe("PricingData");
    });

    it("generates On-Demand, Reserved, and Spot pricing", async () => {
      await manager.updatePricing();

      const calls = vi.mocked(dynamodb.put).mock.calls;
      const ec2Calls = calls.filter((c) => {
        const item = c[0].Item as Record<string, unknown>;
        const sc = item.serviceCode as string;
        return (sc === "EC2" || sc === "EC2#Reserved" || sc === "EC2#Spot") &&
          item.region === "us-east-1";
      });

      expect(ec2Calls.length).toBe(3);

      const onDemand = ec2Calls.find(
        (c) => (c[0].Item as Record<string, unknown>).serviceCode === "EC2"
      );
      const reserved = ec2Calls.find(
        (c) => (c[0].Item as Record<string, unknown>).serviceCode === "EC2#Reserved"
      );
      const spot = ec2Calls.find(
        (c) => (c[0].Item as Record<string, unknown>).serviceCode === "EC2#Spot"
      );

      expect(onDemand).toBeDefined();
      expect(reserved).toBeDefined();
      expect(spot).toBeDefined();

      const onDemandRate = (onDemand![0].Item as Record<string, unknown>).hourlyRate as number;
      const reservedRate = (reserved![0].Item as Record<string, unknown>).hourlyRate as number;
      const spotRate = (spot![0].Item as Record<string, unknown>).hourlyRate as number;

      expect(reservedRate).toBeLessThan(onDemandRate);
      expect(spotRate).toBeLessThan(reservedRate);
    });

    it("updates lastUpdateDate after successful update", async () => {
      const before = await manager.getLastUpdate();
      expect(before).toBeNull();

      await manager.updatePricing();

      // getLastUpdate should now return the in-memory cached date
      const after = await manager.getLastUpdate();
      expect(after).toBeInstanceOf(Date);
    });
  });

  describe("getPricing", () => {
    it("returns cached pricing from DynamoDB when available", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        serviceCode: "EC2",
        region: "us-east-1",
        hourlyRate: 0.0116,
        dailyCost: 0.2784,
        monthlyCost: 8.468,
        pricingModel: "On-Demand",
      });

      const config: ResourceConfig = { region: "us-east-1", instanceType: "t2.micro" };
      const pricing = await manager.getPricing("EC2", "us-east-1", config);

      expect(pricing.hourlyRate).toBe(0.0116);
      expect(pricing.pricingModel).toBe("On-Demand");
      expect(dynamodb.get).toHaveBeenCalledWith({
        TableName: "PricingData",
        Key: { serviceCode: "EC2:t2.micro", region: "us-east-1" },
      });
    });

    it("falls back to local pricing table when DynamoDB cache misses", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config: ResourceConfig = { region: "us-east-1" };
      const pricing = await manager.getPricing("EC2", "us-east-1", config);

      expect(pricing.hourlyRate).toBe(PRICING_TABLE["EC2"].hourlyRate);
      expect(pricing.pricingModel).toBe("On-Demand");
    });

    it("applies regional multiplier in fallback mode", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config: ResourceConfig = { region: "ap-northeast-1" };
      const pricing = await manager.getPricing("EC2", "ap-northeast-1", config);

      const expected = Math.round(
        PRICING_TABLE["EC2"].hourlyRate * REGION_MULTIPLIERS["ap-northeast-1"] * 10000
      ) / 10000;
      expect(pricing.hourlyRate).toBe(expected);
    });

    it("handles Reserved pricing model from config", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config: ResourceConfig = { region: "us-east-1", pricingModel: "Reserved" } as ResourceConfig;
      const pricing = await manager.getPricing("EC2", "us-east-1", config);

      expect(pricing.hourlyRate).toBeLessThan(PRICING_TABLE["EC2"].hourlyRate);
      expect(pricing.pricingModel).toBe("Reserved");
    });

    it("handles Spot pricing model from config", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config: ResourceConfig = { region: "us-east-1", pricingModel: "Spot" } as ResourceConfig;
      const pricing = await manager.getPricing("EC2", "us-east-1", config);

      expect(pricing.pricingModel).toBe("Spot");
      expect(pricing.hourlyRate).toBeLessThan(PRICING_TABLE["EC2"].hourlyRate * 0.6 + 0.001);
    });

    it("uses composite DynamoDB key for non-On-Demand models", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config: ResourceConfig = { region: "us-east-1", pricingModel: "Reserved" } as ResourceConfig;
      await manager.getPricing("RDS", "us-east-1", config);

      expect(dynamodb.get).toHaveBeenCalledWith({
        TableName: "PricingData",
        Key: { serviceCode: "RDS#Reserved", region: "us-east-1" },
      });
    });

    it("returns zero pricing for unknown resource type", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config: ResourceConfig = { region: "us-east-1" };
      const pricing = await manager.getPricing("UnknownService", "us-east-1", config);

      expect(pricing.hourlyRate).toBe(0);
      expect(pricing.dailyCost).toBe(0);
      expect(pricing.monthlyCost).toBe(0);
    });

    it("looks up specific instance type pricing", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const config: ResourceConfig = { region: "us-east-1", instanceType: "t3.large" };
      const pricing = await manager.getPricing("EC2", "us-east-1", config);

      expect(pricing.hourlyRate).toBe(PRICING_TABLE["EC2:t3.large"].hourlyRate);
    });
  });

  describe("getLastUpdate", () => {
    it("returns null when no update has been performed", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const result = await manager.getLastUpdate();

      expect(result).toBeNull();
    });

    it("returns date from DynamoDB when available", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        serviceCode: "METADATA",
        region: "LAST_UPDATE",
        updatedAt: "2025-01-15T00:00:00.000Z",
      });

      const result = await manager.getLastUpdate();

      expect(result).toBeInstanceOf(Date);
      expect(result!.toISOString()).toBe("2025-01-15T00:00:00.000Z");
    });

    it("caches the last update date in memory", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        serviceCode: "METADATA",
        region: "LAST_UPDATE",
        updatedAt: "2025-01-15T00:00:00.000Z",
      });

      await manager.getLastUpdate();
      await manager.getLastUpdate();

      // Should only call DynamoDB once due to caching
      expect(dynamodb.get).toHaveBeenCalledTimes(1);
    });

    it("queries the correct DynamoDB key", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      await manager.getLastUpdate();

      expect(dynamodb.get).toHaveBeenCalledWith({
        TableName: "PricingData",
        Key: { serviceCode: "METADATA", region: "LAST_UPDATE" },
      });
    });
  });

  describe("needsUpdate", () => {
    it("returns true when no update has ever been performed", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const result = await manager.needsUpdate();

      expect(result).toBe(true);
    });

    it("returns false when last update is recent", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        serviceCode: "METADATA",
        region: "LAST_UPDATE",
        updatedAt: new Date().toISOString(),
      });

      const result = await manager.needsUpdate();

      expect(result).toBe(false);
    });

    it("returns true when last update is older than 30 days", async () => {
      const oldDate = new Date(Date.now() - UPDATE_INTERVAL_MS - 1000);
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        serviceCode: "METADATA",
        region: "LAST_UPDATE",
        updatedAt: oldDate.toISOString(),
      });

      const result = await manager.needsUpdate();

      expect(result).toBe(true);
    });
  });
});

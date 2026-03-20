import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TutorialCostDatabase,
  COST_THRESHOLDS,
  UPDATE_INTERVAL_MS,
  determineCostBadge,
  getCostBadgeDisplay,
  serializeTutorialCostRecord,
  deserializeTutorialCostRecord,
  needsRefresh,
  type TutorialType,
} from "./tutorialCostDatabase";
import { CostRange, type CostAnalysis, type UserCostReport } from "@aws-intel/shared";

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

// --- Test fixtures ---

function createMockCostAnalysis(monthlyCost: number): CostAnalysis {
  return {
    totalCosts: {
      hourlyRate: monthlyCost / 730,
      dailyCost: (monthlyCost / 730) * 24,
      monthlyCost,
      scenarios: [],
    },
    resources: [],
    hiddenCosts: [],
    freeTierEligible: monthlyCost === 0,
    warnings: [],
    generatedAt: new Date("2025-01-15T00:00:00Z"),
  };
}


// ============================================================
// Helper function tests
// ============================================================

describe("determineCostBadge", () => {
  it("returns FREE for zero cost", () => {
    expect(determineCostBadge(0)).toBe(CostRange.FREE);
  });

  it("returns FREE for negative cost (edge case)", () => {
    expect(determineCostBadge(-1)).toBe(CostRange.FREE);
  });

  it("returns LOW for cost between $0 and $10", () => {
    expect(determineCostBadge(5)).toBe(CostRange.LOW);
    expect(determineCostBadge(10)).toBe(CostRange.LOW);
  });

  it("returns MEDIUM for cost between $10 and $50", () => {
    expect(determineCostBadge(10.01)).toBe(CostRange.MEDIUM);
    expect(determineCostBadge(25)).toBe(CostRange.MEDIUM);
    expect(determineCostBadge(50)).toBe(CostRange.MEDIUM);
  });

  it("returns HIGH for cost above $50", () => {
    expect(determineCostBadge(50.01)).toBe(CostRange.HIGH);
    expect(determineCostBadge(100)).toBe(CostRange.HIGH);
    expect(determineCostBadge(500)).toBe(CostRange.HIGH);
  });

  it("handles boundary values correctly", () => {
    expect(determineCostBadge(COST_THRESHOLDS.FREE)).toBe(CostRange.FREE);
    expect(determineCostBadge(COST_THRESHOLDS.LOW)).toBe(CostRange.LOW);
    expect(determineCostBadge(COST_THRESHOLDS.MEDIUM)).toBe(CostRange.MEDIUM);
  });
});


describe("getCostBadgeDisplay", () => {
  it("returns 'Free' for FREE badge", () => {
    expect(getCostBadgeDisplay(CostRange.FREE)).toBe("Free");
  });

  it("returns 'Low Cost ($0-$10)' for LOW badge", () => {
    expect(getCostBadgeDisplay(CostRange.LOW)).toBe("Low Cost ($0-$10)");
  });

  it("returns 'Medium Cost ($10-$50)' for MEDIUM badge", () => {
    expect(getCostBadgeDisplay(CostRange.MEDIUM)).toBe("Medium Cost ($10-$50)");
  });

  it("returns 'High Cost (>$50)' for HIGH badge", () => {
    expect(getCostBadgeDisplay(CostRange.HIGH)).toBe("High Cost (>$50)");
  });

  it("returns 'Unknown' for invalid badge", () => {
    expect(getCostBadgeDisplay("invalid" as CostRange)).toBe("Unknown");
  });
});

describe("serializeTutorialCostRecord", () => {
  it("creates a valid tutorial cost record", () => {
    const costAnalysis = createMockCostAnalysis(25);
    const record = serializeTutorialCostRecord(
      "workshop-123",
      "official_workshop",
      "Test Workshop",
      costAnalysis,
      "2025-01",
      "https://example.com/workshop"
    );

    expect(record.tutorialId).toBe("workshop-123");
    expect(record.tutorialType).toBe("official_workshop");
    expect(record.title).toBe("Test Workshop");
    expect(record.url).toBe("https://example.com/workshop");
    expect(record.costBadge).toBe(CostRange.MEDIUM);
    expect(record.pricingVersion).toBe("2025-01");
    expect(record.userReports).toEqual([]);
    expect(record.analyzedAt).toBe("2025-01-15T00:00:00.000Z");
    expect(record.lastUpdated).toBeDefined();
  });

  it("calculates correct cost badge for free tutorial", () => {
    const costAnalysis = createMockCostAnalysis(0);
    const record = serializeTutorialCostRecord(
      "free-tutorial",
      "community_guide",
      "Free Guide",
      costAnalysis,
      "2025-01"
    );

    expect(record.costBadge).toBe(CostRange.FREE);
  });

  it("handles missing URL", () => {
    const costAnalysis = createMockCostAnalysis(5);
    const record = serializeTutorialCostRecord(
      "tutorial-1",
      "popular_blog",
      "Blog Post",
      costAnalysis,
      "2025-01"
    );

    expect(record.url).toBeUndefined();
  });

  it("includes user reports when provided", () => {
    const costAnalysis = createMockCostAnalysis(15);
    const userReports: UserCostReport[] = [
      {
        userId: "user-1",
        actualCost: 12,
        duration: 24,
        region: "us-east-1",
        reportedAt: new Date(),
      },
    ];
    const record = serializeTutorialCostRecord(
      "tutorial-2",
      "official_workshop",
      "Workshop",
      costAnalysis,
      "2025-01",
      undefined,
      userReports
    );

    expect(record.userReports).toHaveLength(1);
    expect(record.userReports[0].actualCost).toBe(12);
  });
});


describe("deserializeTutorialCostRecord", () => {
  it("deserializes a DynamoDB record to CostDatabase", () => {
    const record = {
      tutorialId: "workshop-123",
      costAnalysis: {
        totalCosts: { hourlyRate: 0.05, dailyCost: 1.2, monthlyCost: 36.5, scenarios: [] },
        resources: [],
        hiddenCosts: [],
        freeTierEligible: false,
        warnings: [],
        generatedAt: "2025-01-15T00:00:00.000Z",
      },
      analyzedAt: "2025-01-15T00:00:00.000Z",
      pricingVersion: "2025-01",
      userReports: [],
    };

    const result = deserializeTutorialCostRecord(record);

    expect(result.workshopId).toBe("workshop-123");
    expect(result.costAnalysis.totalCosts.monthlyCost).toBe(36.5);
    expect(result.analyzedAt).toBeInstanceOf(Date);
    expect(result.pricingVersion).toBe("2025-01");
    expect(result.userReports).toEqual([]);
  });

  it("converts string generatedAt to Date", () => {
    const record = {
      tutorialId: "test",
      costAnalysis: {
        totalCosts: { hourlyRate: 0, dailyCost: 0, monthlyCost: 0, scenarios: [] },
        resources: [],
        hiddenCosts: [],
        freeTierEligible: true,
        warnings: [],
        generatedAt: "2025-01-20T12:00:00.000Z",
      },
      analyzedAt: "2025-01-20T12:00:00.000Z",
      pricingVersion: "2025-01",
      userReports: [],
    };

    const result = deserializeTutorialCostRecord(record);

    expect(result.costAnalysis.generatedAt).toBeInstanceOf(Date);
    expect(result.costAnalysis.generatedAt.toISOString()).toBe("2025-01-20T12:00:00.000Z");
  });

  it("handles missing userReports", () => {
    const record = {
      tutorialId: "test",
      costAnalysis: createMockCostAnalysis(0),
      analyzedAt: "2025-01-15T00:00:00.000Z",
      pricingVersion: "2025-01",
    };

    const result = deserializeTutorialCostRecord(record);

    expect(result.userReports).toEqual([]);
  });
});


describe("needsRefresh", () => {
  it("returns false for recent update", () => {
    const recentDate = new Date().toISOString();
    expect(needsRefresh(recentDate)).toBe(false);
  });

  it("returns true for update older than 30 days", () => {
    const oldDate = new Date(Date.now() - UPDATE_INTERVAL_MS - 1000).toISOString();
    expect(needsRefresh(oldDate)).toBe(true);
  });

  it("returns false for update exactly 30 days ago", () => {
    const exactlyThirtyDays = new Date(Date.now() - UPDATE_INTERVAL_MS + 1000).toISOString();
    expect(needsRefresh(exactlyThirtyDays)).toBe(false);
  });
});

// ============================================================
// Constants tests
// ============================================================

describe("COST_THRESHOLDS", () => {
  it("has correct threshold values", () => {
    expect(COST_THRESHOLDS.FREE).toBe(0);
    expect(COST_THRESHOLDS.LOW).toBe(10);
    expect(COST_THRESHOLDS.MEDIUM).toBe(50);
  });
});

describe("UPDATE_INTERVAL_MS", () => {
  it("equals 30 days in milliseconds", () => {
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(UPDATE_INTERVAL_MS).toBe(thirtyDaysMs);
  });
});


// ============================================================
// TutorialCostDatabase class tests
// ============================================================

describe("TutorialCostDatabase", () => {
  let db: TutorialCostDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new TutorialCostDatabase("2025-01");
  });

  describe("constructor", () => {
    it("sets default pricing version", () => {
      const defaultDb = new TutorialCostDatabase();
      expect(defaultDb.getPricingVersion()).toBe("2025-01");
    });

    it("accepts custom pricing version", () => {
      const customDb = new TutorialCostDatabase("2025-02");
      expect(customDb.getPricingVersion()).toBe("2025-02");
    });
  });

  describe("storeCostAnalysis", () => {
    it("stores cost analysis in DynamoDB", async () => {
      const costAnalysis = createMockCostAnalysis(25);

      await db.storeCostAnalysis(
        "workshop-123",
        "official_workshop",
        "Test Workshop",
        costAnalysis,
        "https://example.com"
      );

      expect(dynamodb.put).toHaveBeenCalledTimes(1);
      const call = vi.mocked(dynamodb.put).mock.calls[0];
      expect(call[0].TableName).toBe("Workshops");
      expect((call[0].Item as Record<string, unknown>).tutorialId).toBe("workshop-123");
      expect((call[0].Item as Record<string, unknown>).tutorialType).toBe("official_workshop");
      expect((call[0].Item as Record<string, unknown>).title).toBe("Test Workshop");
      expect((call[0].Item as Record<string, unknown>).costBadge).toBe(CostRange.MEDIUM);
    });

    it("calculates correct cost badge for different costs", async () => {
      const freeCost = createMockCostAnalysis(0);
      await db.storeCostAnalysis("free", "community_guide", "Free", freeCost);

      const lowCost = createMockCostAnalysis(5);
      await db.storeCostAnalysis("low", "popular_blog", "Low", lowCost);

      const highCost = createMockCostAnalysis(100);
      await db.storeCostAnalysis("high", "official_workshop", "High", highCost);

      const calls = vi.mocked(dynamodb.put).mock.calls;
      expect((calls[0][0].Item as Record<string, unknown>).costBadge).toBe(CostRange.FREE);
      expect((calls[1][0].Item as Record<string, unknown>).costBadge).toBe(CostRange.LOW);
      expect((calls[2][0].Item as Record<string, unknown>).costBadge).toBe(CostRange.HIGH);
    });

    it("stores without URL when not provided", async () => {
      const costAnalysis = createMockCostAnalysis(10);

      await db.storeCostAnalysis(
        "tutorial-1",
        "popular_blog",
        "Blog Post",
        costAnalysis
      );

      const call = vi.mocked(dynamodb.put).mock.calls[0];
      expect((call[0].Item as Record<string, unknown>).url).toBeUndefined();
    });
  });


  describe("getCostAnalysis", () => {
    it("returns cost analysis when found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        tutorialId: "workshop-123",
        costAnalysis: {
          totalCosts: { hourlyRate: 0.05, dailyCost: 1.2, monthlyCost: 36.5, scenarios: [] },
          resources: [],
          hiddenCosts: [],
          freeTierEligible: false,
          warnings: [],
          generatedAt: "2025-01-15T00:00:00.000Z",
        },
        analyzedAt: "2025-01-15T00:00:00.000Z",
        pricingVersion: "2025-01",
        userReports: [],
      });

      const result = await db.getCostAnalysis("workshop-123");

      expect(result).not.toBeNull();
      expect(result!.workshopId).toBe("workshop-123");
      expect(result!.costAnalysis.totalCosts.monthlyCost).toBe(36.5);
      expect(dynamodb.get).toHaveBeenCalledWith({
        TableName: "Workshops",
        Key: { workshopId: "workshop-123" },
      });
    });

    it("returns null when not found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const result = await db.getCostAnalysis("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getCostBadge", () => {
    it("returns cost badge when found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        tutorialId: "workshop-123",
        costBadge: CostRange.MEDIUM,
      });

      const result = await db.getCostBadge("workshop-123");

      expect(result).toBe(CostRange.MEDIUM);
    });

    it("returns null when not found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const result = await db.getCostBadge("nonexistent");

      expect(result).toBeNull();
    });
  });


  describe("listTutorialsWithCostBadges", () => {
    it("returns all tutorials when no filter", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { tutorialId: "t1", title: "Tutorial 1", costBadge: CostRange.FREE },
        { tutorialId: "t2", title: "Tutorial 2", costBadge: CostRange.LOW },
        { tutorialId: "t3", title: "Tutorial 3", costBadge: CostRange.HIGH },
      ]);

      const result = await db.listTutorialsWithCostBadges();

      expect(result).toHaveLength(3);
      expect(result[0].tutorialId).toBe("t1");
      expect(result[0].costBadge).toBe(CostRange.FREE);
      expect(dynamodb.scan).toHaveBeenCalledWith({
        TableName: "Workshops",
      });
    });

    it("filters by tutorial type", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { tutorialId: "w1", title: "Workshop 1", costBadge: CostRange.MEDIUM },
      ]);

      const result = await db.listTutorialsWithCostBadges("official_workshop");

      expect(result).toHaveLength(1);
      expect(dynamodb.scan).toHaveBeenCalledWith({
        TableName: "Workshops",
        FilterExpression: "tutorialType = :type",
        ExpressionAttributeValues: { ":type": "official_workshop" },
      });
    });

    it("handles workshopId fallback for tutorialId", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { workshopId: "w1", title: "Workshop 1", costBadge: CostRange.LOW },
      ]);

      const result = await db.listTutorialsWithCostBadges();

      expect(result[0].tutorialId).toBe("w1");
    });

    it("includes URL when available", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { tutorialId: "t1", title: "Tutorial", costBadge: CostRange.FREE, url: "https://example.com" },
      ]);

      const result = await db.listTutorialsWithCostBadges();

      expect(result[0].url).toBe("https://example.com");
    });
  });


  describe("getTutorialsNeedingRefresh", () => {
    it("returns tutorials older than 30 days", async () => {
      const oldDate = new Date(Date.now() - UPDATE_INTERVAL_MS - 1000).toISOString();
      const recentDate = new Date().toISOString();

      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { tutorialId: "old", lastUpdated: oldDate },
        { tutorialId: "recent", lastUpdated: recentDate },
      ]);

      const result = await db.getTutorialsNeedingRefresh();

      expect(result).toEqual(["old"]);
    });

    it("returns empty array when all tutorials are recent", async () => {
      const recentDate = new Date().toISOString();

      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { tutorialId: "t1", lastUpdated: recentDate },
        { tutorialId: "t2", lastUpdated: recentDate },
      ]);

      const result = await db.getTutorialsNeedingRefresh();

      expect(result).toEqual([]);
    });

    it("handles workshopId fallback", async () => {
      const oldDate = new Date(Date.now() - UPDATE_INTERVAL_MS - 1000).toISOString();

      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { workshopId: "w1", lastUpdated: oldDate },
      ]);

      const result = await db.getTutorialsNeedingRefresh();

      expect(result).toEqual(["w1"]);
    });

    it("skips records without lastUpdated", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        { tutorialId: "t1" },
      ]);

      const result = await db.getTutorialsNeedingRefresh();

      expect(result).toEqual([]);
    });
  });


  describe("updateCostAnalysis", () => {
    it("updates cost analysis in DynamoDB", async () => {
      const costAnalysis = createMockCostAnalysis(75);

      await db.updateCostAnalysis("workshop-123", costAnalysis);

      expect(dynamodb.update).toHaveBeenCalledTimes(1);
      const call = vi.mocked(dynamodb.update).mock.calls[0];
      expect(call[0].TableName).toBe("Workshops");
      expect(call[0].Key).toEqual({ workshopId: "workshop-123" });
      expect(call[0].ExpressionAttributeValues![":badge"]).toBe(CostRange.HIGH);
      expect(call[0].ExpressionAttributeValues![":version"]).toBe("2025-01");
    });

    it("recalculates cost badge on update", async () => {
      const lowCost = createMockCostAnalysis(5);
      await db.updateCostAnalysis("t1", lowCost);

      const call = vi.mocked(dynamodb.update).mock.calls[0];
      expect(call[0].ExpressionAttributeValues![":badge"]).toBe(CostRange.LOW);
    });
  });

  describe("addUserCostReport", () => {
    it("adds user report to existing tutorial", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        tutorialId: "workshop-123",
        userReports: [],
      });

      const report: UserCostReport = {
        userId: "user-1",
        actualCost: 15,
        duration: 48,
        region: "us-east-1",
        reportedAt: new Date(),
      };

      await db.addUserCostReport("workshop-123", report);

      expect(dynamodb.update).toHaveBeenCalledTimes(1);
      const call = vi.mocked(dynamodb.update).mock.calls[0];
      expect(call[0].ExpressionAttributeValues![":reports"]).toHaveLength(1);
      expect(call[0].ExpressionAttributeValues![":reports"][0].actualCost).toBe(15);
    });

    it("appends to existing user reports", async () => {
      const existingReport: UserCostReport = {
        userId: "user-0",
        actualCost: 10,
        duration: 24,
        region: "us-west-2",
        reportedAt: new Date(),
      };

      vi.mocked(dynamodb.get).mockResolvedValueOnce({
        tutorialId: "workshop-123",
        userReports: [existingReport],
      });

      const newReport: UserCostReport = {
        userId: "user-1",
        actualCost: 20,
        duration: 72,
        region: "eu-west-1",
        reportedAt: new Date(),
      };

      await db.addUserCostReport("workshop-123", newReport);

      const call = vi.mocked(dynamodb.update).mock.calls[0];
      expect(call[0].ExpressionAttributeValues![":reports"]).toHaveLength(2);
    });

    it("throws error when tutorial not found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      const report: UserCostReport = {
        userId: "user-1",
        actualCost: 15,
        duration: 48,
        region: "us-east-1",
        reportedAt: new Date(),
      };

      await expect(db.addUserCostReport("nonexistent", report)).rejects.toThrow(
        "Tutorial nonexistent not found"
      );
    });
  });


  describe("deleteCostAnalysis", () => {
    it("deletes cost analysis from DynamoDB", async () => {
      await db.deleteCostAnalysis("workshop-123");

      expect(dynamodb.del).toHaveBeenCalledWith({
        TableName: "Workshops",
        Key: { workshopId: "workshop-123" },
      });
    });
  });

  describe("setPricingVersion", () => {
    it("updates the pricing version", () => {
      db.setPricingVersion("2025-02");
      expect(db.getPricingVersion()).toBe("2025-02");
    });
  });

  describe("getPricingVersion", () => {
    it("returns the current pricing version", () => {
      expect(db.getPricingVersion()).toBe("2025-01");
    });
  });
});

import type { ResourceConfig, ResourcePricing } from "@aws-intel/shared";
import { TABLES } from "../../config/tables";
import * as dynamodb from "../../lib/dynamodb";
import { PRICING_TABLE, type PricingEntry } from "./costAnalyzer";

// --- Supported AWS regions ---

export const SUPPORTED_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-north-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "sa-east-1",
  "ca-central-1",
] as const;

export type SupportedRegion = (typeof SUPPORTED_REGIONS)[number];

// --- Regional pricing multipliers relative to us-east-1 ---

export const REGION_MULTIPLIERS: Record<string, number> = {
  "us-east-1": 1.0,
  "us-east-2": 1.0,
  "us-west-1": 1.05,
  "us-west-2": 1.0,
  "eu-west-1": 1.08,
  "eu-west-2": 1.10,
  "eu-west-3": 1.10,
  "eu-central-1": 1.10,
  "eu-north-1": 1.08,
  "ap-southeast-1": 1.12,
  "ap-southeast-2": 1.15,
  "ap-northeast-1": 1.18,
  "ap-northeast-2": 1.15,
  "ap-northeast-3": 1.18,
  "ap-south-1": 1.05,
  "sa-east-1": 1.25,
  "ca-central-1": 1.05,
};

// --- Pricing model discount factors ---

export const PRICING_MODEL_FACTORS: Record<string, number> = {
  "On-Demand": 1.0,
  "Reserved": 0.6,
  "Spot": 0.3,
};

export const VALID_PRICING_MODELS = Object.keys(PRICING_MODEL_FACTORS);

// --- Monthly update schedule (30 days in ms) ---

export const UPDATE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

// --- Helper: compute regional pricing for a base entry ---

export function computeRegionalPricing(
  baseEntry: PricingEntry,
  region: string,
  pricingModel: string
): ResourcePricing {
  const regionMultiplier = REGION_MULTIPLIERS[region] ?? 1.0;
  const modelFactor = PRICING_MODEL_FACTORS[pricingModel] ?? 1.0;

  const hourlyRate =
    Math.round(baseEntry.hourlyRate * regionMultiplier * modelFactor * 10000) /
    10000;
  const dailyCost = Math.round(hourlyRate * 24 * 10000) / 10000;
  const monthlyCost = Math.round(hourlyRate * 730 * 10000) / 10000;

  return { hourlyRate, dailyCost, monthlyCost, pricingModel };
}

// --- Helper: build a pricing lookup key ---

export function buildPricingKey(
  resourceType: string,
  instanceType?: string
): string {
  return instanceType ? `${resourceType}:${instanceType}` : resourceType;
}

// --- Helper: serialize a DynamoDB pricing record ---

export interface PricingRecord {
  serviceCode: string;
  region: string;
  hourlyRate: number;
  dailyCost: number;
  monthlyCost: number;
  pricingModel: string;
  freeTierEligible: boolean;
  freeTierLimit?: string;
  description: string;
  updatedAt: string;
}

export function serializePricingRecord(
  serviceCode: string,
  region: string,
  pricing: ResourcePricing,
  entry: PricingEntry,
  updatedAt: Date
): PricingRecord {
  return {
    serviceCode,
    region,
    hourlyRate: pricing.hourlyRate,
    dailyCost: pricing.dailyCost,
    monthlyCost: pricing.monthlyCost,
    pricingModel: pricing.pricingModel,
    freeTierEligible: entry.freeTierEligible,
    freeTierLimit: entry.freeTierLimit,
    description: entry.description,
    updatedAt: updatedAt.toISOString(),
  };
}

export function deserializePricingRecord(
  record: Record<string, unknown>
): ResourcePricing {
  return {
    hourlyRate: (record.hourlyRate as number) ?? 0,
    dailyCost: (record.dailyCost as number) ?? 0,
    monthlyCost: (record.monthlyCost as number) ?? 0,
    pricingModel: (record.pricingModel as string) ?? "On-Demand",
  };
}


// --- PricingDatabaseManager class ---

export class PricingDatabaseManager {
  private lastUpdateDate: Date | null = null;

  /**
   * Update pricing data in DynamoDB for all resource types across all regions.
   * Uses the local PRICING_TABLE as the source of truth (simulating AWS Pricing API).
   * Generates On-Demand, Reserved, and Spot pricing for each resource/region combo.
   * Requirements: 38.1, 38.5
   */
  async updatePricing(): Promise<void> {
    const now = new Date();

    for (const [serviceCode, entry] of Object.entries(PRICING_TABLE)) {
      for (const region of SUPPORTED_REGIONS) {
        for (const model of VALID_PRICING_MODELS) {
          const pricing = computeRegionalPricing(entry, region, model);
          const compositeKey = model === "On-Demand"
            ? serviceCode
            : `${serviceCode}#${model}`;

          const record = serializePricingRecord(
            compositeKey,
            region,
            pricing,
            entry,
            now
          );

          await dynamodb.put({
            TableName: TABLES.PricingData,
            Item: record,
          });
        }
      }
    }

    // Store the last update timestamp
    await dynamodb.put({
      TableName: TABLES.PricingData,
      Item: {
        serviceCode: "METADATA",
        region: "LAST_UPDATE",
        updatedAt: now.toISOString(),
      },
    });

    this.lastUpdateDate = now;
  }

  /**
   * Get pricing for a specific resource type, region, and configuration.
   * Looks up cached pricing from DynamoDB first, falls back to local PRICING_TABLE.
   * Requirements: 38.1
   */
  async getPricing(
    resourceType: string,
    region: string,
    config: ResourceConfig
  ): Promise<ResourcePricing> {
    const pricingModel = (config as Record<string, unknown>).pricingModel as string | undefined ?? "On-Demand";
    const instanceType = config.instanceType;
    const lookupKey = buildPricingKey(resourceType, instanceType);
    const compositeKey = pricingModel === "On-Demand"
      ? lookupKey
      : `${lookupKey}#${pricingModel}`;

    // Try DynamoDB cache first
    const cached = await dynamodb.get({
      TableName: TABLES.PricingData,
      Key: { serviceCode: compositeKey, region },
    });

    if (cached) {
      return deserializePricingRecord(cached);
    }

    // Fall back to local pricing table with regional/model adjustments
    const baseEntry = this.lookupLocalPricing(resourceType, instanceType);
    return computeRegionalPricing(baseEntry, region, pricingModel);
  }

  /**
   * Get the timestamp of the last pricing update.
   * Requirements: 38.5
   */
  async getLastUpdate(): Promise<Date | null> {
    if (this.lastUpdateDate) {
      return this.lastUpdateDate;
    }

    const record = await dynamodb.get({
      TableName: TABLES.PricingData,
      Key: { serviceCode: "METADATA", region: "LAST_UPDATE" },
    });

    if (record?.updatedAt) {
      this.lastUpdateDate = new Date(record.updatedAt as string);
      return this.lastUpdateDate;
    }

    return null;
  }

  /**
   * Check if pricing data needs a refresh (older than 30 days).
   */
  async needsUpdate(): Promise<boolean> {
    const lastUpdate = await this.getLastUpdate();
    if (!lastUpdate) return true;
    return Date.now() - lastUpdate.getTime() > UPDATE_INTERVAL_MS;
  }

  /**
   * Look up pricing from the local PRICING_TABLE (fallback).
   */
  private lookupLocalPricing(
    resourceType: string,
    instanceType?: string
  ): PricingEntry {
    if (instanceType) {
      const specificKey = `${resourceType}:${instanceType}`;
      if (PRICING_TABLE[specificKey]) {
        return PRICING_TABLE[specificKey];
      }
    }

    if (PRICING_TABLE[resourceType]) {
      return PRICING_TABLE[resourceType];
    }

    return {
      hourlyRate: 0.0,
      freeTierEligible: false,
      description: `Unknown resource: ${resourceType}`,
    };
  }
}

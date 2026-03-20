import {
  CostRange,
  type CostAnalysis,
  type CostDatabase,
  type UserCostReport,
} from "@aws-intel/shared";
import { TABLES } from "../../config/tables";
import * as dynamodb from "../../lib/dynamodb";

// --- Cost badge thresholds (monthly cost in USD) ---

export const COST_THRESHOLDS = {
  FREE: 0,
  LOW: 10,
  MEDIUM: 50,
} as const;

// --- Monthly update interval (30 days in ms) ---

export const UPDATE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

// --- Tutorial types for categorization ---

export type TutorialType = "official_workshop" | "popular_blog" | "community_guide";

// --- DynamoDB record structure ---

export interface TutorialCostRecord {
  tutorialId: string;
  tutorialType: TutorialType;
  title: string;
  url?: string;
  costAnalysis: CostAnalysis;
  costBadge: CostRange;
  analyzedAt: string;
  pricingVersion: string;
  userReports: UserCostReport[];
  lastUpdated: string;
}


// --- Helper: determine cost badge from monthly cost ---

export function determineCostBadge(monthlyCost: number): CostRange {
  if (monthlyCost <= COST_THRESHOLDS.FREE) {
    return CostRange.FREE;
  }
  if (monthlyCost <= COST_THRESHOLDS.LOW) {
    return CostRange.LOW;
  }
  if (monthlyCost <= COST_THRESHOLDS.MEDIUM) {
    return CostRange.MEDIUM;
  }
  return CostRange.HIGH;
}

// --- Helper: get cost badge display text ---

export function getCostBadgeDisplay(badge: CostRange): string {
  switch (badge) {
    case CostRange.FREE:
      return "Free";
    case CostRange.LOW:
      return "Low Cost ($0-$10)";
    case CostRange.MEDIUM:
      return "Medium Cost ($10-$50)";
    case CostRange.HIGH:
      return "High Cost (>$50)";
    default:
      return "Unknown";
  }
}

// --- Helper: serialize a tutorial cost record for DynamoDB ---

export function serializeTutorialCostRecord(
  tutorialId: string,
  tutorialType: TutorialType,
  title: string,
  costAnalysis: CostAnalysis,
  pricingVersion: string,
  url?: string,
  userReports: UserCostReport[] = []
): TutorialCostRecord {
  const now = new Date().toISOString();
  const monthlyCost = costAnalysis.totalCosts.monthlyCost;
  const costBadge = determineCostBadge(monthlyCost);

  return {
    tutorialId,
    tutorialType,
    title,
    url,
    costAnalysis,
    costBadge,
    analyzedAt: costAnalysis.generatedAt.toISOString(),
    pricingVersion,
    userReports,
    lastUpdated: now,
  };
}


// --- Helper: deserialize a DynamoDB record to CostDatabase ---

export function deserializeTutorialCostRecord(
  record: Record<string, unknown>
): CostDatabase {
  const costAnalysis = record.costAnalysis as CostAnalysis;
  
  // Ensure generatedAt is a Date object
  if (costAnalysis && typeof costAnalysis.generatedAt === "string") {
    costAnalysis.generatedAt = new Date(costAnalysis.generatedAt);
  }

  return {
    workshopId: record.tutorialId as string,
    costAnalysis,
    analyzedAt: new Date(record.analyzedAt as string),
    pricingVersion: record.pricingVersion as string,
    userReports: (record.userReports as UserCostReport[]) ?? [],
  };
}

// --- Helper: check if analysis needs refresh (older than 30 days) ---

export function needsRefresh(lastUpdated: string): boolean {
  const lastUpdateTime = new Date(lastUpdated).getTime();
  return Date.now() - lastUpdateTime > UPDATE_INTERVAL_MS;
}

// --- TutorialCostDatabase class ---

export class TutorialCostDatabase {
  private pricingVersion: string;

  constructor(pricingVersion: string = "2025-01") {
    this.pricingVersion = pricingVersion;
  }


  /**
   * Store a cost analysis in DynamoDB for reuse.
   * Requirements: 38.1
   */
  async storeCostAnalysis(
    tutorialId: string,
    tutorialType: TutorialType,
    title: string,
    costAnalysis: CostAnalysis,
    url?: string
  ): Promise<void> {
    const record = serializeTutorialCostRecord(
      tutorialId,
      tutorialType,
      title,
      costAnalysis,
      this.pricingVersion,
      url
    );

    await dynamodb.put({
      TableName: TABLES.Workshops,
      Item: record,
    });
  }

  /**
   * Get a stored cost analysis by tutorial ID.
   * Requirements: 38.1
   */
  async getCostAnalysis(tutorialId: string): Promise<CostDatabase | null> {
    const record = await dynamodb.get({
      TableName: TABLES.Workshops,
      Key: { workshopId: tutorialId },
    });

    if (!record) {
      return null;
    }

    return deserializeTutorialCostRecord(record);
  }


  /**
   * Get the cost badge for a tutorial.
   * Requirements: 38.4
   */
  async getCostBadge(tutorialId: string): Promise<CostRange | null> {
    const record = await dynamodb.get({
      TableName: TABLES.Workshops,
      Key: { workshopId: tutorialId },
    });

    if (!record) {
      return null;
    }

    return record.costBadge as CostRange;
  }

  /**
   * List all tutorials with their cost badges.
   * Supports filtering by tutorial type.
   * Requirements: 38.2, 38.3, 38.4
   */
  async listTutorialsWithCostBadges(
    tutorialType?: TutorialType
  ): Promise<Array<{ tutorialId: string; title: string; costBadge: CostRange; url?: string }>> {
    let records: Record<string, unknown>[];

    if (tutorialType) {
      records = await dynamodb.scan({
        TableName: TABLES.Workshops,
        FilterExpression: "tutorialType = :type",
        ExpressionAttributeValues: { ":type": tutorialType },
      });
    } else {
      records = await dynamodb.scan({
        TableName: TABLES.Workshops,
      });
    }

    return records.map((record) => ({
      tutorialId: record.tutorialId as string ?? record.workshopId as string,
      title: record.title as string,
      costBadge: record.costBadge as CostRange,
      url: record.url as string | undefined,
    }));
  }


  /**
   * Get tutorials that need monthly refresh (older than 30 days).
   * Requirements: 38.5
   */
  async getTutorialsNeedingRefresh(): Promise<string[]> {
    const records = await dynamodb.scan({
      TableName: TABLES.Workshops,
    });

    return records
      .filter((record) => {
        const lastUpdated = record.lastUpdated as string;
        return lastUpdated && needsRefresh(lastUpdated);
      })
      .map((record) => record.tutorialId as string ?? record.workshopId as string);
  }

  /**
   * Update a cost analysis with new pricing data.
   * Requirements: 38.5
   */
  async updateCostAnalysis(
    tutorialId: string,
    costAnalysis: CostAnalysis
  ): Promise<void> {
    const now = new Date().toISOString();
    const monthlyCost = costAnalysis.totalCosts.monthlyCost;
    const costBadge = determineCostBadge(monthlyCost);

    await dynamodb.update({
      TableName: TABLES.Workshops,
      Key: { workshopId: tutorialId },
      UpdateExpression:
        "SET costAnalysis = :analysis, costBadge = :badge, analyzedAt = :analyzed, pricingVersion = :version, lastUpdated = :updated",
      ExpressionAttributeValues: {
        ":analysis": costAnalysis,
        ":badge": costBadge,
        ":analyzed": costAnalysis.generatedAt.toISOString(),
        ":version": this.pricingVersion,
        ":updated": now,
      },
    });
  }


  /**
   * Add a user cost report to a tutorial.
   * Allows users to report actual costs for community validation.
   */
  async addUserCostReport(
    tutorialId: string,
    report: UserCostReport
  ): Promise<void> {
    const existing = await dynamodb.get({
      TableName: TABLES.Workshops,
      Key: { workshopId: tutorialId },
    });

    if (!existing) {
      throw new Error(`Tutorial ${tutorialId} not found`);
    }

    const userReports = (existing.userReports as UserCostReport[]) ?? [];
    userReports.push(report);

    await dynamodb.update({
      TableName: TABLES.Workshops,
      Key: { workshopId: tutorialId },
      UpdateExpression: "SET userReports = :reports",
      ExpressionAttributeValues: { ":reports": userReports },
    });
  }

  /**
   * Delete a cost analysis from the database.
   */
  async deleteCostAnalysis(tutorialId: string): Promise<void> {
    await dynamodb.del({
      TableName: TABLES.Workshops,
      Key: { workshopId: tutorialId },
    });
  }

  /**
   * Set the pricing version for new analyses.
   */
  setPricingVersion(version: string): void {
    this.pricingVersion = version;
  }

  /**
   * Get the current pricing version.
   */
  getPricingVersion(): string {
    return this.pricingVersion;
  }
}

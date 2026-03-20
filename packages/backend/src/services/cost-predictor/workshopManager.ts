import {
  CostRange,
  DifficultyLevel,
  type Workshop,
  type WorkshopInfo,
  type WorkshopFilter,
  type CostAnalysis,
  type AWSResource,
} from "@aws-intel/shared";

import * as dynamodb from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";
import axios from "axios";

// --- Workshop category definitions ---

export const WORKSHOP_CATEGORIES = [
  "Serverless",
  "Containers",
  "Machine Learning",
  "Security",
  "Networking",
  "Database",
  "DevOps",
  "Analytics",
  "Storage",
  "Compute",
  "IoT",
  "Migration",
] as const;

export type WorkshopCategory = (typeof WORKSHOP_CATEGORIES)[number];

// --- AWS Workshops catalog URL ---

const AWS_WORKSHOPS_CATALOG_URL =
  "https://workshops.aws/categories";

// --- Sync result type ---

export interface SyncResult {
  workshopsAdded: number;
  workshopsUpdated: number;
  totalWorkshops: number;
  syncedAt: Date;
}

// --- Default empty cost analysis ---

function createEmptyCostAnalysis(): CostAnalysis {
  return {
    totalCosts: {
      hourlyRate: 0,
      dailyCost: 0,
      monthlyCost: 0,
      scenarios: [],
    },
    resources: [],
    hiddenCosts: [],
    freeTierEligible: true,
    warnings: [],
    generatedAt: new Date(),
  };
}

// --- Helper: determine cost badge from monthly cost ---

export function determineCostBadge(monthlyCost: number): CostRange {
  if (monthlyCost <= 0) return CostRange.FREE;
  if (monthlyCost <= 10) return CostRange.LOW;
  if (monthlyCost <= 50) return CostRange.MEDIUM;
  return CostRange.HIGH;
}

// --- Helper: categorize a workshop based on keywords ---

export function categorizeWorkshop(
  title: string,
  description: string
): string {
  const text = `${title} ${description}`.toLowerCase();

  const categoryKeywords: Record<string, string[]> = {
    Serverless: ["serverless", "lambda", "api gateway", "step functions", "sam"],
    Containers: [
      "container",
      "docker",
      "ecs",
      "eks",
      "kubernetes",
      "fargate",
    ],
    "Machine Learning": [
      "machine learning",
      "ml",
      "sagemaker",
      "bedrock",
      "ai",
      "deep learning",
    ],
    Security: [
      "security",
      "iam",
      "waf",
      "guardduty",
      "detective",
      "encryption",
    ],
    Networking: [
      "networking",
      "vpc",
      "cloudfront",
      "route 53",
      "transit gateway",
    ],
    Database: [
      "database",
      "dynamodb",
      "rds",
      "aurora",
      "elasticache",
      "neptune",
    ],
    DevOps: [
      "devops",
      "ci/cd",
      "codepipeline",
      "codebuild",
      "cdk",
      "cloudformation",
    ],
    Analytics: [
      "analytics",
      "athena",
      "emr",
      "glue",
      "quicksight",
      "kinesis",
    ],
    Storage: ["storage", "s3", "ebs", "efs", "backup"],
    Compute: ["compute", "ec2", "auto scaling", "lightsail", "batch"],
    IoT: ["iot", "greengrass", "iot core"],
    Migration: ["migration", "dms", "snow", "transfer"],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return category;
    }
  }

  return "General";
}

// --- Helper: estimate difficulty from content ---

export function estimateDifficulty(
  title: string,
  description: string
): DifficultyLevel {
  const text = `${title} ${description}`.toLowerCase();

  const advancedKeywords = [
    "advanced",
    "expert",
    "complex",
    "multi-region",
    "architecture",
    "optimization",
  ];
  const beginnerKeywords = [
    "beginner",
    "introduction",
    "getting started",
    "basics",
    "101",
    "first",
  ];

  if (advancedKeywords.some((kw) => text.includes(kw))) {
    return DifficultyLevel.ADVANCED;
  }
  if (beginnerKeywords.some((kw) => text.includes(kw))) {
    return DifficultyLevel.BEGINNER;
  }
  return DifficultyLevel.INTERMEDIATE;
}

// --- WorkshopManager class ---

export class WorkshopManager {
  private workshopCache: Map<string, Workshop> = new Map();

  /**
   * List workshops with optional filtering by category, search term, or cost range.
   * Fetches from DynamoDB and applies filters.
   * Requirements: 29.3, 29.4
   */
  async listWorkshops(filter?: WorkshopFilter): Promise<WorkshopInfo[]> {
    const workshops = await this.fetchAllWorkshops();
    let infos = workshops.map((w) => w.info);

    if (filter) {
      infos = this.applyFilter(infos, filter);
    }

    return infos;
  }

  /**
   * Get a single workshop by ID with full details including cost analysis.
   * Requirements: 29.3
   */
  async getWorkshop(workshopId: string): Promise<Workshop> {
    // Check in-memory cache first
    if (this.workshopCache.has(workshopId)) {
      return this.workshopCache.get(workshopId)!;
    }

    const item = await dynamodb.get({
      TableName: TABLES.Workshops,
      Key: { workshopId },
    });

    if (!item) {
      throw new Error(`Workshop not found: ${workshopId}`);
    }

    const workshop = this.deserializeWorkshop(item);
    this.workshopCache.set(workshopId, workshop);
    return workshop;
  }

  /**
   * Sync workshops from the AWS Workshops catalog.
   * Fetches the catalog, parses entries, and upserts into DynamoDB.
   * Designed to be triggered daily via EventBridge.
   * Requirements: 29.1, 29.2, 29.5
   */
  async syncWorkshops(): Promise<SyncResult> {
    let added = 0;
    let updated = 0;

    const catalogEntries = await this.fetchCatalog();

    for (const entry of catalogEntries) {
      const workshopId =
        entry.workshopId ?? `ws-${entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

      const existing = await this.safeGetWorkshop(workshopId);

      const category = categorizeWorkshop(entry.title, entry.description);
      const difficulty = estimateDifficulty(entry.title, entry.description);
      const costAnalysis = existing?.costAnalysis ?? createEmptyCostAnalysis();
      const costBadge = determineCostBadge(costAnalysis.totalCosts.monthlyCost);

      const workshop: Workshop = {
        workshopId,
        info: {
          workshopId,
          title: entry.title,
          description: entry.description,
          category,
          difficulty,
          estimatedDuration: entry.estimatedDuration ?? 120,
          costBadge,
          lastUpdated: new Date(),
        },
        resources: existing?.resources ?? [],
        costAnalysis,
        instructions: entry.instructions ?? "",
        sourceUrl: entry.sourceUrl,
        lastAnalyzed: existing?.lastAnalyzed,
        popularity: entry.popularity ?? 0,
      };

      await this.saveWorkshop(workshop);
      this.workshopCache.set(workshopId, workshop);

      if (existing) {
        updated++;
      } else {
        added++;
      }
    }

    const totalWorkshops = await this.countWorkshops();

    return {
      workshopsAdded: added,
      workshopsUpdated: updated,
      totalWorkshops,
      syncedAt: new Date(),
    };
  }

  /**
   * Add a custom tutorial by URL. Fetches the content, parses it,
   * and creates a workshop entry.
   * Requirements: 29.3, 32.1
   */
  async addCustomTutorial(url: string): Promise<Workshop> {
    const content = await this.fetchTutorialContent(url);

    const title = this.extractTitle(content) ?? `Custom Tutorial`;
    const description =
      this.extractDescription(content) ?? "Custom tutorial added via URL";

    const workshopId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const category = categorizeWorkshop(title, description);
    const difficulty = estimateDifficulty(title, description);

    const workshop: Workshop = {
      workshopId,
      info: {
        workshopId,
        title,
        description,
        category,
        difficulty,
        estimatedDuration: 60,
        costBadge: CostRange.FREE,
        lastUpdated: new Date(),
      },
      resources: [],
      costAnalysis: createEmptyCostAnalysis(),
      instructions: content,
      sourceUrl: url,
      lastAnalyzed: undefined,
      popularity: 0,
    };

    await this.saveWorkshop(workshop);
    this.workshopCache.set(workshopId, workshop);

    return workshop;
  }

  // --- Private helpers ---

  /**
   * Fetch all workshops from DynamoDB.
   */
  private async fetchAllWorkshops(): Promise<Workshop[]> {
    const items = await dynamodb.scan({
      TableName: TABLES.Workshops,
    });

    return items.map((item) => this.deserializeWorkshop(item));
  }

  /**
   * Count total workshops in DynamoDB.
   */
  private async countWorkshops(): Promise<number> {
    const items = await dynamodb.scan({
      TableName: TABLES.Workshops,
    });
    return items.length;
  }

  /**
   * Safely get a workshop, returning undefined if not found.
   */
  private async safeGetWorkshop(
    workshopId: string
  ): Promise<Workshop | undefined> {
    try {
      return await this.getWorkshop(workshopId);
    } catch {
      return undefined;
    }
  }

  /**
   * Save a workshop to DynamoDB.
   */
  private async saveWorkshop(workshop: Workshop): Promise<void> {
    await dynamodb.put({
      TableName: TABLES.Workshops,
      Item: this.serializeWorkshop(workshop),
    });
  }

  /**
   * Serialize a Workshop for DynamoDB storage.
   */
  private serializeWorkshop(
    workshop: Workshop
  ): Record<string, unknown> {
    return {
      workshopId: workshop.workshopId,
      title: workshop.info.title,
      description: workshop.info.description,
      category: workshop.info.category,
      difficulty: workshop.info.difficulty,
      estimatedDuration: workshop.info.estimatedDuration,
      costBadge: workshop.info.costBadge,
      lastUpdated: workshop.info.lastUpdated.toISOString(),
      resources: JSON.stringify(workshop.resources),
      costAnalysis: JSON.stringify(workshop.costAnalysis),
      instructions: workshop.instructions,
      sourceUrl: workshop.sourceUrl ?? "",
      lastAnalyzed: workshop.lastAnalyzed?.toISOString() ?? "",
      popularity: workshop.popularity ?? 0,
    };
  }

  /**
   * Deserialize a DynamoDB item into a Workshop.
   */
  private deserializeWorkshop(
    item: Record<string, unknown>
  ): Workshop {
    const workshopId = item.workshopId as string;
    const title = item.title as string;
    const description = (item.description as string) ?? "";
    const category = (item.category as string) ?? "General";
    const difficulty =
      (item.difficulty as DifficultyLevel) ?? DifficultyLevel.INTERMEDIATE;
    const estimatedDuration = (item.estimatedDuration as number) ?? 120;
    const costBadge = (item.costBadge as CostRange) ?? CostRange.FREE;
    const lastUpdated = item.lastUpdated
      ? new Date(item.lastUpdated as string)
      : new Date();

    let resources: AWSResource[] = [];
    try {
      resources =
        typeof item.resources === "string"
          ? JSON.parse(item.resources as string)
          : (item.resources as AWSResource[]) ?? [];
    } catch {
      resources = [];
    }

    let costAnalysis: CostAnalysis;
    try {
      costAnalysis =
        typeof item.costAnalysis === "string"
          ? JSON.parse(item.costAnalysis as string)
          : (item.costAnalysis as CostAnalysis) ?? createEmptyCostAnalysis();
    } catch {
      costAnalysis = createEmptyCostAnalysis();
    }

    // Restore Date objects in costAnalysis
    if (costAnalysis.generatedAt && typeof costAnalysis.generatedAt === "string") {
      costAnalysis.generatedAt = new Date(costAnalysis.generatedAt);
    }

    const sourceUrl = (item.sourceUrl as string) || undefined;

    return {
      workshopId,
      info: {
        workshopId,
        title,
        description,
        category,
        difficulty,
        estimatedDuration,
        costBadge,
        lastUpdated,
        sourceUrl,
      },
      resources,
      costAnalysis,
      instructions: (item.instructions as string) ?? "",
      sourceUrl,
      lastAnalyzed: item.lastAnalyzed
        ? new Date(item.lastAnalyzed as string)
        : undefined,
      popularity: (item.popularity as number) ?? 0,
    };
  }

  /**
   * Apply filter criteria to workshop infos.
   */
  private applyFilter(
    infos: WorkshopInfo[],
    filter: WorkshopFilter
  ): WorkshopInfo[] {
    let filtered = infos;

    if (filter.category) {
      const cat = filter.category.toLowerCase();
      filtered = filtered.filter(
        (info) => info.category.toLowerCase() === cat
      );
    }

    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (info) =>
          info.title.toLowerCase().includes(term) ||
          info.description.toLowerCase().includes(term) ||
          info.category.toLowerCase().includes(term)
      );
    }

    if (filter.costRange) {
      filtered = filtered.filter(
        (info) => info.costBadge === filter.costRange
      );
    }

    return filtered;
  }

  /**
   * Fetch the AWS Workshops catalog. In production, this would scrape/call
   * the AWS Workshops API. Returns parsed catalog entries.
   */
  async fetchCatalog(): Promise<CatalogEntry[]> {
    try {
      const response = await axios.get(AWS_WORKSHOPS_CATALOG_URL, {
        timeout: 10000,
      });
      return this.parseCatalogResponse(response.data);
    } catch {
      // If catalog fetch fails, return empty — sync will retry next day
      return [];
    }
  }

  /**
   * Parse the raw catalog response into structured entries.
   */
  parseCatalogResponse(data: unknown): CatalogEntry[] {
    // Handle HTML response (scraping the workshops page)
    if (typeof data === "string") {
      return this.parseHtmlCatalog(data);
    }

    // Handle JSON API response
    if (Array.isArray(data)) {
      return data
        .filter(
          (entry: unknown) =>
            entry != null &&
            typeof entry === "object" &&
            "title" in (entry as Record<string, unknown>)
        )
        .map((entry: unknown) => {
          const e = entry as Record<string, unknown>;
          return {
            workshopId: e.id as string | undefined,
            title: (e.title as string) ?? "Untitled Workshop",
            description: (e.description as string) ?? "",
            sourceUrl: (e.url as string) ?? undefined,
            estimatedDuration: (e.duration as number) ?? undefined,
            instructions: (e.content as string) ?? undefined,
            popularity: (e.popularity as number) ?? undefined,
          };
        });
    }

    return [];
  }

  /**
   * Parse HTML catalog page for workshop entries.
   */
  private parseHtmlCatalog(html: string): CatalogEntry[] {
    const entries: CatalogEntry[] = [];
    // Simple regex-based extraction for workshop titles and links
    const titleRegex =
      /<h[23][^>]*>([^<]+)<\/h[23]>/gi;
    let match: RegExpExecArray | null;

    while ((match = titleRegex.exec(html)) !== null) {
      const title = match[1].trim();
      if (title && title.length > 3) {
        entries.push({
          title,
          description: "",
        });
      }
    }

    return entries;
  }

  /**
   * Fetch tutorial content from a URL.
   */
  private async fetchTutorialContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, { timeout: 15000 });
      if (typeof response.data === "string") {
        return response.data;
      }
      return JSON.stringify(response.data);
    } catch (error) {
      throw new Error(
        `Failed to fetch tutorial from ${url}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Extract a title from HTML or text content.
   */
  private extractTitle(content: string): string | undefined {
    // Try <title> tag
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();

    // Try <h1> tag
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1].trim();

    // Try first line of text
    const firstLine = content.split("\n").find((line) => line.trim().length > 0);
    if (firstLine && firstLine.trim().length <= 200) {
      return firstLine.trim().replace(/<[^>]+>/g, "");
    }

    return undefined;
  }

  /**
   * Extract a description from HTML or text content.
   */
  private extractDescription(content: string): string | undefined {
    // Try meta description
    const metaMatch = content.match(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    );
    if (metaMatch) return metaMatch[1].trim();

    // Try first paragraph
    const pMatch = content.match(/<p[^>]*>([^<]+)<\/p>/i);
    if (pMatch) return pMatch[1].trim().slice(0, 300);

    return undefined;
  }
}

// --- Catalog entry type ---

export interface CatalogEntry {
  workshopId?: string;
  title: string;
  description: string;
  sourceUrl?: string;
  estimatedDuration?: number;
  instructions?: string;
  popularity?: number;
}

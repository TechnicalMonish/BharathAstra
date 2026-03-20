import { describe, it, expect } from "vitest";
import {
  ResultCardBuilder,
  extractKeyTakeaways,
  extractImpactMetrics,
  extractValidationStats,
  buildRelatedLinks,
  buildConflictWarnings,
  buildTrendIndicator,
} from "./resultCardBuilder";
import {
  ContentSource,
  AuthorityLevel,
  DifficultyLevel,
  TrendStatus,
  ConflictSeverity,
  type RankedResult,
  type ContentItem,
  type QualityScore,
} from "@aws-intel/shared";

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "test-1",
    source: ContentSource.AWS_BLOG,
    title: "Test Article",
    url: "https://example.com/test",
    author: { name: "Author", credentials: [], authorityLevel: AuthorityLevel.COMMUNITY_MEMBER },
    publishDate: new Date("2024-12-01"),
    content: "This is important content. You should use Lambda for serverless. It can improve performance by 50% faster.",
    metadata: {
      hasCodeExamples: true,
      hasDiagrams: false,
      hasStepByStep: true,
      estimatedReadTime: 8,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      techStack: ["TypeScript"],
      awsServices: ["Lambda"],
    },
    ...overrides,
  };
}

function makeScore(): QualityScore {
  return {
    overall: 7.5,
    recency: 8,
    authorAuthority: 6,
    communityValidation: 7,
    practicalImpact: 8,
    contentQuality: 7,
    breakdown: {
      recencyPoints: 8,
      authorityPoints: 6,
      validationPoints: 7,
      impactPoints: 8,
      qualityPoints: 7,
    },
  };
}

function makeRanked(overrides: Partial<ContentItem> = {}): RankedResult {
  return { item: makeItem(overrides), score: makeScore(), rank: 1 };
}

describe("ResultCardBuilder", () => {
  describe("buildCard", () => {
    it("should build a card with all core fields", () => {
      const builder = new ResultCardBuilder();
      const card = builder.buildCard(makeRanked());

      expect(card.title).toBe("Test Article");
      expect(card.url).toBe("https://example.com/test");
      expect(card.source).toBe(ContentSource.AWS_BLOG);
      expect(card.qualityScore).toBe(7.5);
      expect(card.scoreBreakdown).toBeDefined();
      expect(card.author.name).toBe("Author");
      expect(card.estimatedReadTime).toBe(8);
      expect(card.difficultyLevel).toBe(DifficultyLevel.INTERMEDIATE);
    });

    it("should extract key takeaways", () => {
      const builder = new ResultCardBuilder();
      const card = builder.buildCard(makeRanked({
        content: "This is an important best practice for Lambda. You should always optimize your functions. Reduce cold starts by 30% improvement with provisioned concurrency.",
      }));
      expect(card.keyTakeaways.length).toBeLessThanOrEqual(3);
    });

    it("should include conflict warnings when provided", () => {
      const builder = new ResultCardBuilder();
      const card = builder.buildCard(makeRanked(), {
        conflicts: [{
          topic: "lambda vs ecs",
          conflictingItems: [],
          positions: [
            { item: makeItem(), stance: "lambda", isDeprecated: false, isCurrent: true },
            { item: makeItem(), stance: "ecs", isDeprecated: false, isCurrent: true },
          ],
          severity: ConflictSeverity.MEDIUM,
        }],
      });
      expect(card.conflicts).toBeDefined();
      expect(card.conflicts!.length).toBe(1);
    });

    it("should include trend indicator when provided", () => {
      const builder = new ResultCardBuilder();
      const card = builder.buildCard(makeRanked(), {
        trendInfo: {
          topic: "lambda",
          status: TrendStatus.RISING,
          changePercentage: 0.35,
          contentVolume: { last30Days: 10, last90Days: 25, previousPeriod: 15, percentageChange: 0.35 },
          engagementTrend: { averageScore: 7, totalEngagement: 70, trend: "increasing" },
          lastUpdated: new Date(),
        },
      });
      expect(card.trendIndicator).toBeDefined();
      expect(card.trendIndicator!.status).toBe(TrendStatus.RISING);
    });

    it("should include related links", () => {
      const builder = new ResultCardBuilder();
      const card = builder.buildCard(makeRanked());
      expect(card.relatedLinks.length).toBeGreaterThan(0);
      expect(card.relatedLinks[0].url).toBe("https://example.com/test");
    });
  });
});

describe("extractKeyTakeaways", () => {
  it("should return at most 3 takeaways", () => {
    const content = "This is important. You should do this. Best practice is that. Critical step here. Must follow this rule.";
    const takeaways = extractKeyTakeaways(content);
    expect(takeaways.length).toBeLessThanOrEqual(3);
  });

  it("should prioritize sentences with signal words", () => {
    const content = "The weather is nice today and the sky is blue and clear. You must configure IAM roles correctly for security best practice compliance.";
    const takeaways = extractKeyTakeaways(content);
    if (takeaways.length > 0) {
      expect(takeaways[0]).toContain("must");
    }
  });

  it("should return empty for short content", () => {
    expect(extractKeyTakeaways("Short.")).toEqual([]);
  });
});

describe("extractImpactMetrics", () => {
  it("should extract performance improvements", () => {
    const metrics = extractImpactMetrics("Achieved 50% faster response times");
    expect(metrics).toBeDefined();
    expect(metrics!.performanceImprovement).toBeDefined();
  });

  it("should extract cost savings", () => {
    const metrics = extractImpactMetrics("We cut costs by $200 per month");
    expect(metrics).toBeDefined();
    expect(metrics!.costSavings).toBeDefined();
  });

  it("should return undefined when no metrics found", () => {
    expect(extractImpactMetrics("Just a regular article")).toBeUndefined();
  });
});

describe("extractValidationStats", () => {
  it("should extract engagement metrics", () => {
    const item = makeItem();
    item.engagement = { upvotes: 100, comments: 20, normalizedScore: 7 };
    const stats = extractValidationStats(item);
    expect(stats.upvotes).toBe(100);
    expect(stats.comments).toBe(20);
  });

  it("should return empty stats when no engagement", () => {
    const stats = extractValidationStats(makeItem());
    expect(stats).toEqual({});
  });
});

describe("buildRelatedLinks", () => {
  it("should include original article link", () => {
    const links = buildRelatedLinks(makeItem());
    expect(links.length).toBe(1);
    expect(links[0].type).toBe("article");
  });

  it("should mark GitHub sources as code", () => {
    const links = buildRelatedLinks(makeItem({ source: ContentSource.GITHUB }));
    expect(links[0].type).toBe("code");
  });
});

describe("buildConflictWarnings", () => {
  it("should return undefined for empty conflicts", () => {
    expect(buildConflictWarnings([])).toBeUndefined();
    expect(buildConflictWarnings(undefined)).toBeUndefined();
  });
});

describe("buildTrendIndicator", () => {
  it("should return undefined when no trend info", () => {
    expect(buildTrendIndicator(undefined)).toBeUndefined();
  });

  it("should build rising indicator", () => {
    const indicator = buildTrendIndicator({
      topic: "lambda",
      status: TrendStatus.RISING,
      changePercentage: 0.5,
      contentVolume: { last30Days: 10, last90Days: 25, previousPeriod: 15, percentageChange: 0.5 },
      engagementTrend: { averageScore: 7, totalEngagement: 70, trend: "increasing" },
      lastUpdated: new Date(),
    });
    expect(indicator!.status).toBe(TrendStatus.RISING);
    expect(indicator!.message).toContain("Trending up");
  });

  it("should build declining indicator", () => {
    const indicator = buildTrendIndicator({
      topic: "opsworks",
      status: TrendStatus.DECLINING,
      changePercentage: -0.4,
      contentVolume: { last30Days: 2, last90Days: 5, previousPeriod: 15, percentageChange: -0.4 },
      engagementTrend: { averageScore: 3, totalEngagement: 15, trend: "decreasing" },
      lastUpdated: new Date(),
    });
    expect(indicator!.status).toBe(TrendStatus.DECLINING);
    expect(indicator!.message).toContain("Declining");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  TrendAnalyzer,
  classifyTrend,
  calculatePercentageChange,
  extractTopicFromItem,
  RISING_THRESHOLD,
  DECLINING_THRESHOLD,
} from "./trendAnalyzer";
import {
  ContentSource,
  DifficultyLevel,
  AuthorityLevel,
  TrendStatus,
  type ContentItem,
} from "@aws-intel/shared";

// --- Helpers ---

const NOW = new Date("2025-01-15");

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "test-1",
    source: ContentSource.AWS_BLOG,
    title: "Test Article",
    url: "https://example.com/article",
    author: {
      name: "Test Author",
      credentials: [],
      authorityLevel: AuthorityLevel.COMMUNITY_MEMBER,
    },
    publishDate: new Date("2025-01-01"),
    content: "Test content about AWS Lambda.",
    metadata: {
      hasCodeExamples: false,
      hasDiagrams: false,
      hasStepByStep: false,
      estimatedReadTime: 5,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      techStack: [],
      awsServices: ["Lambda"],
    },
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d;
}

// --- Helper tests ---

describe("classifyTrend", () => {
  it("should classify as RISING when > 20% increase", () => {
    expect(classifyTrend(0.25)).toBe(TrendStatus.RISING);
  });

  it("should classify as STABLE when between -20% and +20%", () => {
    expect(classifyTrend(0.10)).toBe(TrendStatus.STABLE);
    expect(classifyTrend(-0.10)).toBe(TrendStatus.STABLE);
    expect(classifyTrend(0)).toBe(TrendStatus.STABLE);
  });

  it("should classify as DECLINING when > 20% decrease", () => {
    expect(classifyTrend(-0.25)).toBe(TrendStatus.DECLINING);
  });

  it("should classify boundary values as STABLE", () => {
    expect(classifyTrend(RISING_THRESHOLD)).toBe(TrendStatus.STABLE);
    expect(classifyTrend(DECLINING_THRESHOLD)).toBe(TrendStatus.STABLE);
  });
});

describe("calculatePercentageChange", () => {
  it("should return 0 when both are 0", () => {
    expect(calculatePercentageChange(0, 0)).toBe(0);
  });

  it("should return 1.0 when previous is 0 and current > 0", () => {
    expect(calculatePercentageChange(5, 0)).toBe(1.0);
  });

  it("should calculate correct percentage", () => {
    expect(calculatePercentageChange(12, 10)).toBeCloseTo(0.2);
  });

  it("should return negative for decrease", () => {
    expect(calculatePercentageChange(8, 10)).toBeCloseTo(-0.2);
  });
});

describe("extractTopicFromItem", () => {
  it("should extract AWS services as topics", () => {
    const item = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda", "S3"] } });
    expect(extractTopicFromItem(item)).toEqual(["lambda", "s3"]);
  });

  it("should return 'general' when no services", () => {
    const item = makeItem({ metadata: { ...makeItem().metadata, awsServices: [] } });
    expect(extractTopicFromItem(item)).toEqual(["general"]);
  });
});

// --- TrendAnalyzer class ---

describe("TrendAnalyzer", () => {
  let analyzer: TrendAnalyzer;

  beforeEach(() => {
    analyzer = new TrendAnalyzer();
  });

  describe("analyzeTrend", () => {
    it("should return STABLE for unknown topic", () => {
      const result = analyzer.analyzeTrend("unknown-topic", NOW);
      expect(result.status).toBe(TrendStatus.STABLE);
      expect(result.contentVolume.last30Days).toBe(0);
    });

    it("should detect RISING trend when recent volume exceeds previous", () => {
      // Add many recent items (last 90 days) and few older items (90-180 days)
      const recentItems = Array.from({ length: 10 }, (_, i) =>
        makeItem({ id: `recent-${i}`, publishDate: daysAgo(i + 1) })
      );
      const oldItems = Array.from({ length: 3 }, (_, i) =>
        makeItem({ id: `old-${i}`, publishDate: daysAgo(120 + i) })
      );
      analyzer.updateTrendData([...recentItems, ...oldItems]);

      const result = analyzer.analyzeTrend("lambda", NOW);
      expect(result.status).toBe(TrendStatus.RISING);
      expect(result.changePercentage).toBeGreaterThan(RISING_THRESHOLD);
    });

    it("should detect DECLINING trend when previous volume exceeds current", () => {
      // Few recent items, many older items
      const recentItems = [makeItem({ id: "recent-1", publishDate: daysAgo(10) })];
      const oldItems = Array.from({ length: 10 }, (_, i) =>
        makeItem({ id: `old-${i}`, publishDate: daysAgo(100 + i) })
      );
      analyzer.updateTrendData([...recentItems, ...oldItems]);

      const result = analyzer.analyzeTrend("lambda", NOW);
      expect(result.status).toBe(TrendStatus.DECLINING);
    });
  });

  describe("updateTrendData", () => {
    it("should store items by topic", () => {
      const items = [
        makeItem({ id: "1", metadata: { ...makeItem().metadata, awsServices: ["Lambda"] } }),
        makeItem({ id: "2", metadata: { ...makeItem().metadata, awsServices: ["S3"] } }),
      ];
      analyzer.updateTrendData(items);

      const lambdaTrend = analyzer.analyzeTrend("lambda", NOW);
      expect(lambdaTrend.contentVolume.last30Days).toBe(1);

      const s3Trend = analyzer.analyzeTrend("s3", NOW);
      expect(s3Trend.contentVolume.last30Days).toBe(1);
    });

    it("should not add duplicate items", () => {
      const item = makeItem({ id: "dup" });
      analyzer.updateTrendData([item]);
      analyzer.updateTrendData([item]);

      const result = analyzer.analyzeTrend("lambda", NOW);
      expect(result.contentVolume.last30Days).toBe(1);
    });
  });

  describe("getTrendingTopics", () => {
    it("should return topics sorted by score", () => {
      // Lambda: many recent items
      const lambdaItems = Array.from({ length: 5 }, (_, i) =>
        makeItem({ id: `lambda-${i}`, publishDate: daysAgo(i + 1) })
      );
      // S3: fewer recent items
      const s3Items = [
        makeItem({
          id: "s3-1",
          publishDate: daysAgo(5),
          metadata: { ...makeItem().metadata, awsServices: ["S3"] },
        }),
      ];
      analyzer.updateTrendData([...lambdaItems, ...s3Items]);

      const trending = analyzer.getTrendingTopics(10, NOW);
      expect(trending.length).toBeGreaterThan(0);
      expect(trending[0].topic).toBe("lambda");
    });

    it("should respect limit", () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        makeItem({
          id: `item-${i}`,
          publishDate: daysAgo(i + 1),
          metadata: { ...makeItem().metadata, awsServices: [`Service${i}`] },
        })
      );
      analyzer.updateTrendData(items);

      const trending = analyzer.getTrendingTopics(2, NOW);
      expect(trending).toHaveLength(2);
    });

    it("should return empty for no data", () => {
      expect(analyzer.getTrendingTopics(10, NOW)).toEqual([]);
    });
  });
});

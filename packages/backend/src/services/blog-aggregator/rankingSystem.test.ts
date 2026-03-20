import { describe, it, expect } from "vitest";
import {
  RankingSystem,
  calculateRecencyScore,
  calculateAuthorityScore,
  calculateValidationScore,
  calculateImpactScore,
  calculateContentQualityScore,
  daysBetween,
  clamp,
  WEIGHTS,
  NEUTRAL_SCORE,
} from "./rankingSystem";
import {
  ContentSource,
  DifficultyLevel,
  AuthorityLevel,
  type ContentItem,
  type EngagementMetrics,
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
    content: "This is a test article about AWS Lambda.",
    metadata: {
      hasCodeExamples: false,
      hasDiagrams: false,
      hasStepByStep: false,
      estimatedReadTime: 5,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      techStack: [],
      awsServices: [],
    },
    ...overrides,
  };
}

function makeEngagement(overrides: Partial<EngagementMetrics> = {}): EngagementMetrics {
  return { normalizedScore: 5, ...overrides };
}

// --- Helper function tests ---

describe("daysBetween", () => {
  it("should return 0 for the same date", () => {
    const d = new Date("2025-01-01");
    expect(daysBetween(d, d)).toBe(0);
  });

  it("should return correct days between two dates", () => {
    const d1 = new Date("2025-01-01");
    const d2 = new Date("2025-01-31");
    expect(daysBetween(d1, d2)).toBe(30);
  });

  it("should be symmetric", () => {
    const d1 = new Date("2025-01-01");
    const d2 = new Date("2025-03-01");
    expect(daysBetween(d1, d2)).toBe(daysBetween(d2, d1));
  });
});

describe("clamp", () => {
  it("should return value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("should clamp to min", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it("should clamp to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

// --- Recency scoring ---

describe("calculateRecencyScore", () => {
  it("should return 10 for content ≤30 days old", () => {
    const date = new Date("2025-01-01");
    expect(calculateRecencyScore(date, NOW)).toBe(10);
  });

  it("should return 8 for content 31-90 days old", () => {
    const date = new Date("2024-11-01"); // ~75 days
    expect(calculateRecencyScore(date, NOW)).toBe(8);
  });

  it("should return 6 for content 91-180 days old", () => {
    const date = new Date("2024-08-15"); // ~153 days
    expect(calculateRecencyScore(date, NOW)).toBe(6);
  });

  it("should return 4 for content 181-365 days old", () => {
    const date = new Date("2024-03-01"); // ~320 days
    expect(calculateRecencyScore(date, NOW)).toBe(4);
  });

  it("should return 2 for content 1-2 years old", () => {
    const date = new Date("2023-06-01"); // ~594 days
    expect(calculateRecencyScore(date, NOW)).toBe(2);
  });

  it("should return 1 for content >2 years old", () => {
    const date = new Date("2020-01-01");
    expect(calculateRecencyScore(date, NOW)).toBe(1);
  });

  it("should return 10 for content published today", () => {
    expect(calculateRecencyScore(NOW, NOW)).toBe(10);
  });
});

// --- Authority scoring ---

describe("calculateAuthorityScore", () => {
  it("should return 10 for AWS Hero", () => {
    expect(calculateAuthorityScore(AuthorityLevel.AWS_HERO)).toBe(10);
  });

  it("should return 8 for AWS Employee", () => {
    expect(calculateAuthorityScore(AuthorityLevel.AWS_EMPLOYEE)).toBe(8);
  });

  it("should return 6 for Recognized Contributor", () => {
    expect(calculateAuthorityScore(AuthorityLevel.RECOGNIZED_CONTRIBUTOR)).toBe(6);
  });

  it("should return 4 for Community Member", () => {
    expect(calculateAuthorityScore(AuthorityLevel.COMMUNITY_MEMBER)).toBe(4);
  });

  it("should return 3 for Unknown", () => {
    expect(calculateAuthorityScore(AuthorityLevel.UNKNOWN)).toBe(3);
  });
});

// --- Validation scoring ---

describe("calculateValidationScore", () => {
  it("should return neutral score when no engagement data", () => {
    expect(calculateValidationScore(undefined)).toBe(NEUTRAL_SCORE);
  });

  it("should return normalizedScore from engagement", () => {
    expect(calculateValidationScore(makeEngagement({ normalizedScore: 7.5 }))).toBe(7.5);
  });

  it("should clamp score to 0-10 range", () => {
    expect(calculateValidationScore(makeEngagement({ normalizedScore: 15 }))).toBe(10);
    expect(calculateValidationScore(makeEngagement({ normalizedScore: -3 }))).toBe(0);
  });
});

// --- Impact scoring ---

describe("calculateImpactScore", () => {
  it("should return baseline 3 for content with no impact signals", () => {
    const item = makeItem({ content: "A simple article about AWS." });
    expect(calculateImpactScore(item)).toBe(3);
  });

  it("should add 3 for performance improvements", () => {
    const item = makeItem({ content: "We achieved 50% faster response times with performance improvement." });
    expect(calculateImpactScore(item)).toBe(6);
  });

  it("should add 3 for cost savings", () => {
    const item = makeItem({ content: "We reduced cost by $500 per month with cost savings." });
    expect(calculateImpactScore(item)).toBe(6);
  });

  it("should add 2 for before/after metrics", () => {
    const item = makeItem({ content: "Here is a before and after comparison." });
    expect(calculateImpactScore(item)).toBe(5);
  });

  it("should add 1 for case study", () => {
    const item = makeItem({ content: "This is a real-world case study." });
    expect(calculateImpactScore(item)).toBe(4);
  });

  it("should cap at 10 when all signals present", () => {
    const item = makeItem({
      content: "50% faster performance improvement, cost savings of $200, before and after metrics, real-world case study.",
    });
    expect(calculateImpactScore(item)).toBeLessThanOrEqual(10);
  });
});

// --- Content quality scoring ---

describe("calculateContentQualityScore", () => {
  it("should return baseline 3 for minimal content", () => {
    const item = makeItem();
    expect(calculateContentQualityScore(item)).toBe(3);
  });

  it("should add 2.5 for code examples", () => {
    const item = makeItem({ metadata: { ...makeItem().metadata, hasCodeExamples: true } });
    expect(calculateContentQualityScore(item)).toBe(5.5);
  });

  it("should add 2 for diagrams", () => {
    const item = makeItem({ metadata: { ...makeItem().metadata, hasDiagrams: true } });
    expect(calculateContentQualityScore(item)).toBe(5);
  });

  it("should add 2 for step-by-step", () => {
    const item = makeItem({ metadata: { ...makeItem().metadata, hasStepByStep: true } });
    expect(calculateContentQualityScore(item)).toBe(5);
  });

  it("should add 1.5 for edge case coverage", () => {
    const item = makeItem({ content: "This article covers edge cases and error handling." });
    expect(calculateContentQualityScore(item)).toBe(4.5);
  });

  it("should cap at 10 when all quality signals present", () => {
    const longContent = Array(350).fill("word").join(" ") + " edge case handling";
    const item = makeItem({
      content: longContent,
      metadata: {
        ...makeItem().metadata,
        hasCodeExamples: true,
        hasDiagrams: true,
        hasStepByStep: true,
      },
    });
    expect(calculateContentQualityScore(item)).toBeLessThanOrEqual(10);
  });
});

// --- RankingSystem class ---

describe("RankingSystem", () => {
  const ranker = new RankingSystem();

  describe("calculateQualityScore", () => {
    it("should return a score between 0 and 10", () => {
      const item = makeItem();
      const score = ranker.calculateQualityScore(item, NOW);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(10);
    });

    it("should populate all score components", () => {
      const item = makeItem();
      const score = ranker.calculateQualityScore(item, NOW);
      expect(score.recency).toBeDefined();
      expect(score.authorAuthority).toBeDefined();
      expect(score.communityValidation).toBeDefined();
      expect(score.practicalImpact).toBeDefined();
      expect(score.contentQuality).toBeDefined();
      expect(score.breakdown).toBeDefined();
    });

    it("should use correct weights in overall calculation", () => {
      const item = makeItem({
        publishDate: new Date("2025-01-01"),
        author: { name: "Hero", credentials: [], authorityLevel: AuthorityLevel.AWS_HERO },
        engagement: makeEngagement({ normalizedScore: 8 }),
      });
      const score = ranker.calculateQualityScore(item, NOW);
      const expected =
        score.recency * WEIGHTS.recency +
        score.authorAuthority * WEIGHTS.authority +
        score.communityValidation * WEIGHTS.validation +
        score.practicalImpact * WEIGHTS.impact +
        score.contentQuality * WEIGHTS.quality;
      expect(score.overall).toBeCloseTo(expected, 5);
    });

    it("should handle missing engagement with neutral score", () => {
      const item = makeItem({ engagement: undefined });
      const score = ranker.calculateQualityScore(item, NOW);
      expect(score.communityValidation).toBe(NEUTRAL_SCORE);
    });

    it("should handle missing author with unknown authority", () => {
      const item = makeItem({
        author: { name: "Unknown", credentials: [], authorityLevel: AuthorityLevel.UNKNOWN },
      });
      const score = ranker.calculateQualityScore(item, NOW);
      expect(score.authorAuthority).toBe(3);
    });
  });

  describe("rankResults", () => {
    it("should sort by quality score descending", () => {
      const heroItem = makeItem({
        id: "hero",
        author: { name: "Hero", credentials: [], authorityLevel: AuthorityLevel.AWS_HERO },
        engagement: makeEngagement({ normalizedScore: 9 }),
      });
      const unknownItem = makeItem({
        id: "unknown",
        publishDate: new Date("2020-01-01"),
        author: { name: "Nobody", credentials: [], authorityLevel: AuthorityLevel.UNKNOWN },
      });
      const results = ranker.rankResults([unknownItem, heroItem], NOW);
      expect(results[0].item.id).toBe("hero");
      expect(results[1].item.id).toBe("unknown");
    });

    it("should assign sequential ranks starting at 1", () => {
      const items = [
        makeItem({ id: "a", publishDate: new Date("2025-01-10") }),
        makeItem({ id: "b", publishDate: new Date("2024-01-01") }),
      ];
      const results = ranker.rankResults(items, NOW);
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
    });

    it("should tiebreak by recency (newer first)", () => {
      const newer = makeItem({ id: "newer", publishDate: new Date("2025-01-10") });
      const older = makeItem({ id: "older", publishDate: new Date("2025-01-05") });
      // Same author, same metadata, same engagement → same score
      const results = ranker.rankResults([older, newer], NOW);
      expect(results[0].item.id).toBe("newer");
      expect(results[1].item.id).toBe("older");
    });

    it("should return empty array for empty input", () => {
      expect(ranker.rankResults([], NOW)).toEqual([]);
    });

    it("should handle single item", () => {
      const item = makeItem();
      const results = ranker.rankResults([item], NOW);
      expect(results).toHaveLength(1);
      expect(results[0].rank).toBe(1);
    });
  });
});

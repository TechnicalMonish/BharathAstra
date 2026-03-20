import { describe, it, expect } from "vitest";
import {
  ConflictDetector,
  extractKeywords,
  extractTopics,
  keywordSimilarity,
  detectStance,
  isDeprecated,
  isCurrent,
  classifySeverity,
} from "./conflictDetector";
import {
  ContentSource,
  DifficultyLevel,
  AuthorityLevel,
  ConflictSeverity,
  type ContentItem,
  type RankedResult,
  type QualityScore,
  type ConflictPosition,
} from "@aws-intel/shared";

// --- Helpers ---

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

function makeScore(overall: number = 7): QualityScore {
  return {
    overall,
    recency: 8,
    authorAuthority: 5,
    communityValidation: 5,
    practicalImpact: 5,
    contentQuality: 5,
    breakdown: {
      recencyPoints: 8,
      authorityPoints: 5,
      validationPoints: 5,
      impactPoints: 5,
      qualityPoints: 5,
    },
  };
}

function makeRanked(item: ContentItem, rank: number = 1): RankedResult {
  return { item, score: makeScore(), rank };
}

// --- Helper tests ---

describe("extractKeywords", () => {
  it("should extract lowercase words longer than 2 chars", () => {
    const result = extractKeywords("Use Lambda for serverless");
    expect(result).toContain("use");
    expect(result).toContain("lambda");
    expect(result).toContain("serverless");
  });

  it("should filter out short words", () => {
    const result = extractKeywords("I am a dev");
    expect(result).not.toContain("am");
    expect(result).toContain("dev");
  });
});

describe("extractTopics", () => {
  it("should extract AWS services as topics", () => {
    const item = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda", "S3"] } });
    const topics = extractTopics(item);
    expect(topics).toContain("lambda");
    expect(topics).toContain("s3");
  });

  it("should extract title words as topics", () => {
    const item = makeItem({ title: "Serverless Architecture Guide" });
    const topics = extractTopics(item);
    expect(topics).toContain("serverless");
  });
});

describe("keywordSimilarity", () => {
  it("should return 1 for identical sets", () => {
    expect(keywordSimilarity(["lambda", "s3"], ["lambda", "s3"])).toBe(1);
  });

  it("should return 0 for disjoint sets", () => {
    expect(keywordSimilarity(["lambda"], ["ec2"])).toBe(0);
  });

  it("should return 0 for empty arrays", () => {
    expect(keywordSimilarity([], ["lambda"])).toBe(0);
  });
});

describe("detectStance", () => {
  it("should detect serverless stance", () => {
    expect(detectStance("Use serverless for this workload")).toBe("serverless");
  });

  it("should detect containers stance", () => {
    expect(detectStance("Use containers for this workload")).toBe("containers");
  });

  it("should fall back to recommendation pattern", () => {
    expect(detectStance("We recommend DynamoDB for this")).toBe("dynamodb");
  });
});

describe("isDeprecated / isCurrent", () => {
  it("should detect deprecated content", () => {
    expect(isDeprecated("This service is deprecated")).toBe(true);
    expect(isDeprecated("A modern approach")).toBe(false);
  });

  it("should detect current content", () => {
    expect(isCurrent("This is the recommended approach")).toBe(true);
    expect(isCurrent("An old method")).toBe(false);
  });
});

describe("classifySeverity", () => {
  it("should return HIGH for deprecated vs current", () => {
    const a: ConflictPosition = { item: makeItem(), stance: "old", isDeprecated: true, isCurrent: false };
    const b: ConflictPosition = { item: makeItem(), stance: "new", isDeprecated: false, isCurrent: true };
    expect(classifySeverity(a, b)).toBe(ConflictSeverity.HIGH);
  });

  it("should return MEDIUM for opposing stances", () => {
    const a: ConflictPosition = { item: makeItem(), stance: "serverless", isDeprecated: false, isCurrent: false };
    const b: ConflictPosition = { item: makeItem(), stance: "containers", isDeprecated: false, isCurrent: false };
    expect(classifySeverity(a, b)).toBe(ConflictSeverity.MEDIUM);
  });

  it("should return LOW for general stances", () => {
    const a: ConflictPosition = { item: makeItem(), stance: "general", isDeprecated: false, isCurrent: false };
    const b: ConflictPosition = { item: makeItem(), stance: "something", isDeprecated: false, isCurrent: false };
    expect(classifySeverity(a, b)).toBe(ConflictSeverity.LOW);
  });
});

// --- ConflictDetector class ---

describe("ConflictDetector", () => {
  const detector = new ConflictDetector();

  describe("analyzeRecommendations", () => {
    it("should extract recommendations from items", () => {
      const items = [
        makeItem({ id: "1", content: "Use serverless for this workload", metadata: { ...makeItem().metadata, awsServices: ["Lambda"] } }),
      ];
      const recs = detector.analyzeRecommendations(items);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].supportingItems).toHaveLength(1);
    });

    it("should return empty for empty input", () => {
      expect(detector.analyzeRecommendations([])).toEqual([]);
    });
  });

  describe("detectConflicts", () => {
    it("should detect conflicts between opposing approaches on same topic", () => {
      const item1 = makeItem({
        id: "1",
        title: "Lambda Guide",
        content: "Use serverless Lambda for all workloads. This is the recommended best practice approach.",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda"] },
      });
      const item2 = makeItem({
        id: "2",
        title: "Lambda Guide",
        content: "Use containers ECS for all workloads. This is a deprecated legacy approach.",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda"] },
      });
      const results = [makeRanked(item1, 1), makeRanked(item2, 2)];
      const conflicts = detector.detectConflicts(results);
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it("should return empty for single result", () => {
      const results = [makeRanked(makeItem())];
      expect(detector.detectConflicts(results)).toEqual([]);
    });

    it("should return empty for items with same stance", () => {
      const item1 = makeItem({
        id: "1",
        content: "Use serverless for this",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda"] },
      });
      const item2 = makeItem({
        id: "2",
        content: "Use serverless for that",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda"] },
      });
      const results = [makeRanked(item1, 1), makeRanked(item2, 2)];
      const conflicts = detector.detectConflicts(results);
      expect(conflicts).toEqual([]);
    });
  });
});

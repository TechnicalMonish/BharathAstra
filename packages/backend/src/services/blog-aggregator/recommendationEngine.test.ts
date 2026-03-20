import { describe, it, expect } from "vitest";
import {
  RecommendationEngine,
  setOverlap,
  topicSimilarity,
  complementarySkillsScore,
  sequentialLearningScore,
  calculateRecommendationScore,
  MAX_RECOMMENDATIONS,
} from "./recommendationEngine";
import {
  ContentSource,
  DifficultyLevel,
  AuthorityLevel,
  type ContentItem,
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
      techStack: ["TypeScript"],
      awsServices: ["Lambda"],
    },
    ...overrides,
  };
}

// --- Helper tests ---

describe("setOverlap", () => {
  it("should return 1 for identical sets", () => {
    expect(setOverlap(["a", "b"], ["a", "b"])).toBe(1);
  });

  it("should return 0 for disjoint sets", () => {
    expect(setOverlap(["a"], ["b"])).toBe(0);
  });

  it("should return 0 for empty arrays", () => {
    expect(setOverlap([], ["a"])).toBe(0);
    expect(setOverlap(["a"], [])).toBe(0);
  });

  it("should be case-insensitive", () => {
    expect(setOverlap(["Lambda"], ["lambda"])).toBe(1);
  });

  it("should calculate partial overlap", () => {
    // {a, b} ∩ {b, c} = {b}, union = {a, b, c} = 3, overlap = 1/3
    expect(setOverlap(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
  });
});

describe("topicSimilarity", () => {
  it("should return high score for items with same services and tech", () => {
    const a = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda", "S3"], techStack: ["TypeScript"] } });
    const b = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda", "S3"], techStack: ["TypeScript"] } });
    expect(topicSimilarity(a, b)).toBe(1);
  });

  it("should return 0 for completely different items", () => {
    const a = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda"], techStack: ["TypeScript"] } });
    const b = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["RDS"], techStack: ["Python"] } });
    expect(topicSimilarity(a, b)).toBe(0);
  });
});

describe("sequentialLearningScore", () => {
  it("should return 1.0 for next difficulty level", () => {
    const beginner = makeItem({ metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.BEGINNER } });
    const intermediate = makeItem({ metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.INTERMEDIATE } });
    expect(sequentialLearningScore(beginner, intermediate)).toBe(1.0);
  });

  it("should return 0.6 for same difficulty level", () => {
    const a = makeItem({ metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.INTERMEDIATE } });
    const b = makeItem({ metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.INTERMEDIATE } });
    expect(sequentialLearningScore(a, b)).toBe(0.6);
  });

  it("should return 0.2 for going backwards one level", () => {
    const advanced = makeItem({ metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.ADVANCED } });
    const intermediate = makeItem({ metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.INTERMEDIATE } });
    expect(sequentialLearningScore(advanced, intermediate)).toBe(0.2);
  });
});

describe("complementarySkillsScore", () => {
  it("should score higher when candidate has new services plus overlap", () => {
    const viewed = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda"] } });
    const candidate = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda", "DynamoDB"] } });
    const score = complementarySkillsScore(viewed, candidate);
    expect(score).toBeGreaterThan(0);
  });

  it("should return 0 for candidate with no services", () => {
    const viewed = makeItem({ metadata: { ...makeItem().metadata, awsServices: ["Lambda"] } });
    const candidate = makeItem({ metadata: { ...makeItem().metadata, awsServices: [] } });
    expect(complementarySkillsScore(viewed, candidate)).toBe(0);
  });
});

// --- RecommendationEngine class ---

describe("RecommendationEngine", () => {
  const engine = new RecommendationEngine();

  describe("getRecommendations", () => {
    it("should exclude the viewed item", () => {
      const viewed = makeItem({ id: "viewed" });
      const allItems = [viewed, makeItem({ id: "other" })];
      const recs = engine.getRecommendations(viewed, [], allItems);
      expect(recs.every((r) => r.id !== "viewed")).toBe(true);
    });

    it("should exclude previously viewed items from history", () => {
      const viewed = makeItem({ id: "viewed" });
      const historyItem = makeItem({ id: "history" });
      const candidate = makeItem({ id: "candidate" });
      const allItems = [viewed, historyItem, candidate];
      const recs = engine.getRecommendations(viewed, [historyItem], allItems);
      expect(recs.every((r) => r.id !== "history")).toBe(true);
    });

    it("should limit to 5 recommendations", () => {
      const viewed = makeItem({ id: "viewed" });
      const allItems = Array.from({ length: 20 }, (_, i) =>
        makeItem({ id: `item-${i}` })
      );
      const recs = engine.getRecommendations(viewed, [], allItems);
      expect(recs.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    });

    it("should return empty for no candidates", () => {
      const viewed = makeItem({ id: "viewed" });
      const recs = engine.getRecommendations(viewed, [], [viewed]);
      expect(recs).toEqual([]);
    });

    it("should prioritize similar content", () => {
      const viewed = makeItem({
        id: "viewed",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda", "DynamoDB"], techStack: ["TypeScript"] },
      });
      const similar = makeItem({
        id: "similar",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda", "DynamoDB"], techStack: ["TypeScript"] },
      });
      const different = makeItem({
        id: "different",
        metadata: { ...makeItem().metadata, awsServices: ["RDS", "EC2"], techStack: ["Java"] },
      });
      const recs = engine.getRecommendations(viewed, [], [viewed, similar, different]);
      expect(recs[0].id).toBe("similar");
    });
  });

  describe("findRelatedContent", () => {
    it("should exclude the source item", () => {
      const item = makeItem({ id: "source" });
      const allItems = [item, makeItem({ id: "other" })];
      const related = engine.findRelatedContent(item, allItems);
      expect(related.every((r) => r.id !== "source")).toBe(true);
    });

    it("should return items sorted by topic similarity", () => {
      const item = makeItem({
        id: "source",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda"], techStack: ["TypeScript"] },
      });
      const similar = makeItem({
        id: "similar",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda"], techStack: ["TypeScript"] },
      });
      const different = makeItem({
        id: "different",
        metadata: { ...makeItem().metadata, awsServices: ["RDS"], techStack: ["Java"] },
      });
      const related = engine.findRelatedContent(item, [item, similar, different]);
      expect(related[0].id).toBe("similar");
    });

    it("should limit to MAX_RECOMMENDATIONS", () => {
      const item = makeItem({ id: "source" });
      const allItems = Array.from({ length: 20 }, (_, i) =>
        makeItem({ id: `item-${i}` })
      );
      const related = engine.findRelatedContent(item, [item, ...allItems]);
      expect(related.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    });

    it("should return empty when no other items", () => {
      const item = makeItem({ id: "source" });
      expect(engine.findRelatedContent(item, [item])).toEqual([]);
    });
  });
});

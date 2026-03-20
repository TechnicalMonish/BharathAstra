import { describe, it, expect } from "vitest";
import { FilterEngine, parseImplementationTimeMinutes } from "./filterEngine";
import {
  ContentSource,
  DifficultyLevel,
  AuthorityLevel,
  RecencyRange,
  type ContentItem,
  type RankedResult,
  type QualityScore,
  type FilterCriteria,
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
    publishDate: new Date(),
    content: "Test content about AWS Lambda.",
    metadata: {
      hasCodeExamples: false,
      hasDiagrams: false,
      hasStepByStep: false,
      estimatedReadTime: 5,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      techStack: ["TypeScript"],
      awsServices: ["Lambda"],
      freeTierCompatible: true,
      implementationTime: "30 minutes",
    },
    ...overrides,
  };
}

function makeScore(overall: number = 5): QualityScore {
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

function makeRanked(item: ContentItem, rank: number = 1, overall: number = 5): RankedResult {
  return { item, score: makeScore(overall), rank };
}

// --- Tests ---

describe("parseImplementationTimeMinutes", () => {
  it("should parse minutes", () => {
    expect(parseImplementationTimeMinutes("30 minutes")).toBe(30);
  });

  it("should parse hours", () => {
    expect(parseImplementationTimeMinutes("2 hours")).toBe(120);
  });

  it("should parse days", () => {
    expect(parseImplementationTimeMinutes("1 day")).toBe(1440);
  });

  it("should return null for undefined", () => {
    expect(parseImplementationTimeMinutes(undefined)).toBeNull();
  });

  it("should return null for non-numeric string", () => {
    expect(parseImplementationTimeMinutes("quick")).toBeNull();
  });
});

describe("FilterEngine", () => {
  const engine = new FilterEngine();

  it("should return all results when no criteria specified", () => {
    const results = [makeRanked(makeItem())];
    expect(engine.applyFilters(results, {})).toHaveLength(1);
  });

  it("should return all results when criteria is empty object", () => {
    const results = [makeRanked(makeItem()), makeRanked(makeItem({ id: "2" }))];
    expect(engine.applyFilters(results, {})).toHaveLength(2);
  });

  describe("freeTierOnly filter", () => {
    it("should keep free tier compatible items", () => {
      const results = [
        makeRanked(makeItem({ id: "free", metadata: { ...makeItem().metadata, freeTierCompatible: true } })),
        makeRanked(makeItem({ id: "paid", metadata: { ...makeItem().metadata, freeTierCompatible: false } })),
      ];
      const filtered = engine.applyFilters(results, { freeTierOnly: true });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("free");
    });

    it("should not filter when freeTierOnly is false", () => {
      const results = [
        makeRanked(makeItem({ id: "paid", metadata: { ...makeItem().metadata, freeTierCompatible: false } })),
      ];
      expect(engine.applyFilters(results, { freeTierOnly: false })).toHaveLength(1);
    });
  });

  describe("recencyRange filter", () => {
    it("should filter by last week", () => {
      const recent = makeItem({ id: "recent", publishDate: new Date() });
      const old = makeItem({ id: "old", publishDate: new Date("2020-01-01") });
      const results = [makeRanked(recent), makeRanked(old)];
      const filtered = engine.applyFilters(results, { recencyRange: RecencyRange.LAST_WEEK });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("recent");
    });
  });

  describe("difficultyLevels filter", () => {
    it("should filter by difficulty level", () => {
      const beginner = makeItem({
        id: "beg",
        metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.BEGINNER },
      });
      const advanced = makeItem({
        id: "adv",
        metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.ADVANCED },
      });
      const results = [makeRanked(beginner), makeRanked(advanced)];
      const filtered = engine.applyFilters(results, {
        difficultyLevels: [DifficultyLevel.BEGINNER],
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("beg");
    });

    it("should support multiple difficulty levels", () => {
      const beginner = makeItem({
        id: "beg",
        metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.BEGINNER },
      });
      const advanced = makeItem({
        id: "adv",
        metadata: { ...makeItem().metadata, difficultyLevel: DifficultyLevel.ADVANCED },
      });
      const results = [makeRanked(beginner), makeRanked(advanced)];
      const filtered = engine.applyFilters(results, {
        difficultyLevels: [DifficultyLevel.BEGINNER, DifficultyLevel.ADVANCED],
      });
      expect(filtered).toHaveLength(2);
    });
  });

  describe("techStacks filter", () => {
    it("should filter by tech stack (case-insensitive)", () => {
      const tsItem = makeItem({
        id: "ts",
        metadata: { ...makeItem().metadata, techStack: ["TypeScript"] },
      });
      const pyItem = makeItem({
        id: "py",
        metadata: { ...makeItem().metadata, techStack: ["Python"] },
      });
      const results = [makeRanked(tsItem), makeRanked(pyItem)];
      const filtered = engine.applyFilters(results, { techStacks: ["typescript"] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("ts");
    });
  });

  describe("implementationTimeRange filter", () => {
    it("should filter by min/max time", () => {
      const quick = makeItem({
        id: "quick",
        metadata: { ...makeItem().metadata, implementationTime: "15 minutes" },
      });
      const long = makeItem({
        id: "long",
        metadata: { ...makeItem().metadata, implementationTime: "3 hours" },
      });
      const results = [makeRanked(quick), makeRanked(long)];
      const filtered = engine.applyFilters(results, {
        implementationTimeRange: { min: 10, max: 60 },
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("quick");
    });
  });

  describe("focusAreas filter", () => {
    it("should filter by AWS service focus area", () => {
      const lambdaItem = makeItem({
        id: "lambda",
        metadata: { ...makeItem().metadata, awsServices: ["Lambda"] },
      });
      const s3Item = makeItem({
        id: "s3",
        content: "Test content about AWS S3 storage.",
        metadata: { ...makeItem().metadata, awsServices: ["S3"] },
      });
      const results = [makeRanked(lambdaItem), makeRanked(s3Item)];
      const filtered = engine.applyFilters(results, { focusAreas: ["Lambda"] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("lambda");
    });
  });

  describe("minQualityScore filter", () => {
    it("should filter by minimum quality score", () => {
      const high = makeRanked(makeItem({ id: "high" }), 1, 8);
      const low = makeRanked(makeItem({ id: "low" }), 2, 3);
      const filtered = engine.applyFilters([high, low], { minQualityScore: 5 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("high");
    });
  });

  describe("AND logic", () => {
    it("should apply multiple filters with AND logic", () => {
      const match = makeItem({
        id: "match",
        metadata: {
          ...makeItem().metadata,
          freeTierCompatible: true,
          difficultyLevel: DifficultyLevel.BEGINNER,
          techStack: ["TypeScript"],
        },
      });
      const noMatch = makeItem({
        id: "nomatch",
        metadata: {
          ...makeItem().metadata,
          freeTierCompatible: true,
          difficultyLevel: DifficultyLevel.ADVANCED,
          techStack: ["Python"],
        },
      });
      const results = [makeRanked(match, 1, 7), makeRanked(noMatch, 2, 7)];
      const filtered = engine.applyFilters(results, {
        freeTierOnly: true,
        difficultyLevels: [DifficultyLevel.BEGINNER],
        techStacks: ["TypeScript"],
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].item.id).toBe("match");
    });
  });

  it("should maintain original ranking order", () => {
    const items = [
      makeRanked(makeItem({ id: "a" }), 1, 9),
      makeRanked(makeItem({ id: "b" }), 2, 7),
      makeRanked(makeItem({ id: "c" }), 3, 5),
    ];
    const filtered = engine.applyFilters(items, {});
    expect(filtered.map((r) => r.item.id)).toEqual(["a", "b", "c"]);
  });
});

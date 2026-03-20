import { describe, it, expect, vi } from "vitest";
import {
  SearchEngine,
  extractTerms,
  extractAwsServices,
  extractConcepts,
  findSynonyms,
} from "./searchEngine";
import { ContentSource, AuthorityLevel, DifficultyLevel, type ContentItem, type SourceResult } from "@aws-intel/shared";

function makeItem(id: string, title: string, services: string[] = []): ContentItem {
  return {
    id,
    source: ContentSource.AWS_BLOG,
    title,
    url: `https://example.com/${id}`,
    author: { name: "Test", credentials: [], authorityLevel: AuthorityLevel.COMMUNITY_MEMBER },
    publishDate: new Date("2024-12-01"),
    content: `Content about ${title}`,
    metadata: {
      hasCodeExamples: true,
      hasDiagrams: false,
      hasStepByStep: false,
      estimatedReadTime: 5,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      techStack: ["TypeScript"],
      awsServices: services,
    },
  };
}

describe("SearchEngine", () => {
  describe("expandQuery", () => {
    it("should extract original terms from query", () => {
      const engine = new SearchEngine();
      const result = engine.expandQuery("lambda serverless api");
      expect(result.originalTerms).toContain("lambda");
      expect(result.originalTerms).toContain("serverless");
      expect(result.originalTerms).toContain("api");
    });

    it("should detect AWS service names", () => {
      const engine = new SearchEngine();
      const result = engine.expandQuery("how to use lambda with dynamodb");
      expect(result.awsServices).toContain("lambda");
      expect(result.awsServices).toContain("dynamodb");
    });

    it("should expand with synonyms", () => {
      const engine = new SearchEngine();
      const result = engine.expandQuery("serverless architecture");
      expect(result.synonyms.length).toBeGreaterThan(0);
      expect(result.synonyms).toContain("lambda");
    });

    it("should extract concepts", () => {
      const engine = new SearchEngine();
      const result = engine.expandQuery("best practice for security");
      expect(result.concepts).toContain("best practice");
      expect(result.concepts).toContain("security");
    });

    it("should handle empty query", () => {
      const engine = new SearchEngine();
      const result = engine.expandQuery("");
      expect(result.originalTerms).toEqual([]);
      expect(result.awsServices).toEqual([]);
    });
  });

  describe("suggestAlternatives", () => {
    it("should suggest alternatives for known terms", () => {
      const engine = new SearchEngine();
      const suggestions = engine.suggestAlternatives("serverless");
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it("should suggest tutorials and best practices for AWS services", () => {
      const engine = new SearchEngine();
      const suggestions = engine.suggestAlternatives("lambda");
      expect(suggestions.some((s) => s.includes("lambda"))).toBe(true);
    });

    it("should return at most 5 suggestions", () => {
      const engine = new SearchEngine();
      const suggestions = engine.suggestAlternatives("serverless containers database");
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });

    it("should return empty for unrecognized terms", () => {
      const engine = new SearchEngine();
      const suggestions = engine.suggestAlternatives("xyznonexistent");
      expect(suggestions).toEqual([]);
    });
  });

  describe("search", () => {
    it("should return results from AWS Blog when searching", async () => {
      const engine = new SearchEngine();
      const results = await engine.search({ text: "lambda serverless" });
      // AWS Blog integration returns real results
      expect(Array.isArray(results)).toBe(true);
    }, 15000);

    it("should respect limit parameter", async () => {
      const engine = new SearchEngine();
      const results = await engine.search({ text: "lambda", limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    }, 15000);

    it("should apply filters when provided", async () => {
      const engine = new SearchEngine();
      const results = await engine.search({
        text: "lambda",
        filters: { difficultyLevels: [DifficultyLevel.BEGINNER] },
      });
      // Results should be filtered by difficulty level
      for (const result of results) {
        expect(result.item.metadata.difficultyLevel).toBe(DifficultyLevel.BEGINNER);
      }
    }, 15000);
  });
});

describe("extractTerms", () => {
  it("should lowercase and split text", () => {
    expect(extractTerms("Hello World")).toEqual(["hello", "world"]);
  });

  it("should remove special characters", () => {
    expect(extractTerms("aws-lambda!")).toEqual(["aws-lambda"]);
  });

  it("should filter short words", () => {
    expect(extractTerms("a b cd efg")).toEqual(["cd", "efg"]);
  });
});

describe("extractAwsServices", () => {
  it("should find known AWS services", () => {
    expect(extractAwsServices(["lambda", "s3"])).toContain("lambda");
    expect(extractAwsServices(["lambda", "s3"])).toContain("s3");
  });

  it("should return empty for unknown terms", () => {
    expect(extractAwsServices(["foobar"])).toEqual([]);
  });
});

describe("extractConcepts", () => {
  it("should find known concepts", () => {
    expect(extractConcepts(["best", "practice"])).toContain("best practice");
  });

  it("should return empty for non-concept terms", () => {
    expect(extractConcepts(["foobar"])).toEqual([]);
  });
});

describe("findSynonyms", () => {
  it("should find synonyms for known terms", () => {
    const syns = findSynonyms(["serverless"]);
    expect(syns).toContain("lambda");
  });

  it("should do reverse lookup", () => {
    const syns = findSynonyms(["lambda"]);
    expect(syns).toContain("serverless");
    expect(syns).toContain("compute");
  });

  it("should return empty for unknown terms", () => {
    expect(findSynonyms(["xyzunknown"])).toEqual([]);
  });
});

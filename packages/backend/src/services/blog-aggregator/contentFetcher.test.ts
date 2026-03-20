import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ContentFetcher,
  withRetry,
  withTimeout,
  SOURCE_ADAPTERS,
} from "./contentFetcher";
import { ContentSource, type ExpandedQuery, type ContentItem } from "@aws-intel/shared";

const MOCK_QUERY: ExpandedQuery = {
  originalTerms: ["lambda"],
  synonyms: ["serverless"],
  awsServices: ["Lambda"],
  concepts: ["compute"],
};

const EMPTY_QUERY: ExpandedQuery = {
  originalTerms: [],
  synonyms: [],
  awsServices: [],
  concepts: [],
};

// Mock adapter that returns empty array (for non-AWS sources)
const emptyAdapter = vi.fn().mockResolvedValue([]);

// Mock adapter that returns sample items
const mockAwsBlogAdapter = vi.fn().mockResolvedValue([
  {
    id: "test-1",
    source: ContentSource.AWS_BLOG,
    title: "Test Lambda Article",
    url: "https://aws.amazon.com/blogs/test",
    author: { name: "AWS", credentials: ["AWS Official"], authorityLevel: "aws_employee" },
    publishDate: new Date(),
    content: "Test content about Lambda",
    metadata: {
      hasCodeExamples: false,
      hasDiagrams: false,
      hasStepByStep: false,
      estimatedReadTime: 5,
      difficultyLevel: "intermediate",
      techStack: [],
      awsServices: ["Lambda"],
    },
  },
] as ContentItem[]);

describe("ContentFetcher", () => {
  describe("fetchFromAllSources", () => {
    it("should return results from all 10 sources", async () => {
      // Use mock adapters to avoid network calls
      const mockAdapters: Partial<Record<ContentSource, () => Promise<ContentItem[]>>> = {};
      for (const source of Object.values(ContentSource)) {
        mockAdapters[source] = source === ContentSource.AWS_BLOG 
          ? mockAwsBlogAdapter 
          : emptyAdapter;
      }
      
      const fetcher = new ContentFetcher(mockAdapters);
      const results = await fetcher.fetchFromAllSources(MOCK_QUERY);

      expect(results).toHaveLength(10);
      const sources = results.map((r) => r.source);
      for (const source of Object.values(ContentSource)) {
        expect(sources).toContain(source);
      }
    });

    it("should return items from AWS_BLOG source", async () => {
      const fetcher = new ContentFetcher({
        [ContentSource.AWS_BLOG]: mockAwsBlogAdapter,
      });
      const results = await fetcher.fetchFromAllSources(EMPTY_QUERY);

      const awsBlogResult = results.find((r) => r.source === ContentSource.AWS_BLOG);
      expect(awsBlogResult).toBeDefined();
      expect(awsBlogResult!.items).toHaveLength(1);
      expect(awsBlogResult!.error).toBeUndefined();
      expect(awsBlogResult!.retrievalTime).toBeGreaterThanOrEqual(0);
    });

    it("should return empty items from non-integrated sources", async () => {
      const mockAdapters: Partial<Record<ContentSource, () => Promise<ContentItem[]>>> = {};
      for (const source of Object.values(ContentSource)) {
        mockAdapters[source] = source === ContentSource.AWS_BLOG 
          ? mockAwsBlogAdapter 
          : emptyAdapter;
      }
      
      const fetcher = new ContentFetcher(mockAdapters);
      const results = await fetcher.fetchFromAllSources(MOCK_QUERY);

      // Non-AWS-Blog sources should still return empty arrays
      const nonAwsBlogResults = results.filter((r) => r.source !== ContentSource.AWS_BLOG);
      for (const result of nonAwsBlogResults) {
        expect(result.items).toHaveLength(0);
        expect(result.error).toBeUndefined();
      }
    });

    it("should continue when individual sources fail", async () => {
      const failingAdapter = vi.fn().mockRejectedValue(new Error("API down"));
      const fetcher = new ContentFetcher({
        [ContentSource.REDDIT]: failingAdapter,
        [ContentSource.AWS_BLOG]: mockAwsBlogAdapter,
      });

      const results = await fetcher.fetchFromAllSources(MOCK_QUERY);

      expect(results).toHaveLength(10);
      const redditResult = results.find((r) => r.source === ContentSource.REDDIT);
      expect(redditResult).toBeDefined();
      expect(redditResult!.items).toHaveLength(0);
      expect(redditResult!.error).toBeDefined();

      // AWS Blog with mock adapter should return items
      const awsBlogResult = results.find((r) => r.source === ContentSource.AWS_BLOG);
      expect(awsBlogResult!.items).toHaveLength(1);
      expect(awsBlogResult!.error).toBeUndefined();
    });

    it("should log errors for failed sources", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetcher = new ContentFetcher({
        [ContentSource.HACKERNEWS]: vi.fn().mockRejectedValue(new Error("Rate limited")),
        [ContentSource.AWS_BLOG]: mockAwsBlogAdapter,
      });

      await fetcher.fetchFromAllSources(MOCK_QUERY);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("hackernews")
      );
      consoleSpy.mockRestore();
    });
  });

  describe("fetchFromSource", () => {
    it("should return items from AWS_BLOG source", async () => {
      const fetcher = new ContentFetcher({
        [ContentSource.AWS_BLOG]: mockAwsBlogAdapter,
      });
      const items = await fetcher.fetchFromSource(ContentSource.AWS_BLOG, EMPTY_QUERY);

      expect(Array.isArray(items)).toBe(true);
      expect(items).toHaveLength(1);
    });

    it("should return items matching query from AWS_BLOG", async () => {
      const fetcher = new ContentFetcher({
        [ContentSource.AWS_BLOG]: mockAwsBlogAdapter,
      });
      const items = await fetcher.fetchFromSource(ContentSource.AWS_BLOG, MOCK_QUERY);

      expect(items).toHaveLength(1);
      expect(items[0].title).toContain("Lambda");
    });

    it("should throw for an unknown adapter", async () => {
      const fetcher = new ContentFetcher({
        ["unknown_source" as ContentSource]: undefined as any,
      });

      await expect(
        fetcher.fetchFromSource("unknown_source" as ContentSource, MOCK_QUERY)
      ).rejects.toThrow("No adapter registered");
    });
  });

  describe("source adapters", () => {
    it("should have adapters for all ContentSource values", () => {
      for (const source of Object.values(ContentSource)) {
        expect(SOURCE_ADAPTERS[source]).toBeDefined();
      }
    });

    it("adapters requiring API keys should return empty ContentItem[]", async () => {
      // Only Reddit, YouTube, Twitter, GitHub require API keys
      const apiKeyRequiredSources = [
        ContentSource.REDDIT,
        ContentSource.YOUTUBE,
        ContentSource.TWITTER,
        ContentSource.GITHUB,
      ];
      
      for (const source of apiKeyRequiredSources) {
        const adapter = SOURCE_ADAPTERS[source];
        const items = await adapter(MOCK_QUERY);
        expect(items).toHaveLength(0);
      }
    });
  });
});

describe("withRetry", () => {
  it("should return on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, 2, 10)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should apply exponential backoff between retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const start = Date.now();
    await withRetry(fn, 3, 50);
    const elapsed = Date.now() - start;

    // Should have waited ~50ms + ~100ms = ~150ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});

describe("withTimeout", () => {
  it("should resolve if operation completes within timeout", async () => {
    const result = await withTimeout(Promise.resolve("fast"), 1000);
    expect(result).toBe("fast");
  });

  it("should reject if operation exceeds timeout", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), 500));
    await expect(withTimeout(slow, 50)).rejects.toThrow("Timeout after 50ms");
  });
});

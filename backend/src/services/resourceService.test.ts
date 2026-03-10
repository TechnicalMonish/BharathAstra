import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ResourceAggregatorService,
  ISearchClient,
  RawSearchResult,
  categorizeByUrl,
  suggestAlternativeTerms,
} from "./resourceService";
import {
  TimeoutError,
  ServiceUnavailableError,
  ValidationError,
} from "../utils/errors";

// Helper to create a mock search client
function createMockClient(
  results: RawSearchResult[] = [],
): ISearchClient & { fetch: ReturnType<typeof vi.fn> } {
  return { fetch: vi.fn().mockResolvedValue(results) };
}

describe("ResourceAggregatorService", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let service: ResourceAggregatorService;

  beforeEach(() => {
    mockClient = createMockClient();
    service = new ResourceAggregatorService(mockClient);
  });

  describe("search", () => {
    it("should validate the query and reject empty queries", async () => {
      await expect(service.search("")).rejects.toThrow(ValidationError);
      expect(mockClient.fetch).not.toHaveBeenCalled();
    });

    it("should validate the query and reject queries over 500 chars", async () => {
      const longQuery = "a".repeat(501);
      await expect(service.search(longQuery)).rejects.toThrow(ValidationError);
      expect(mockClient.fetch).not.toHaveBeenCalled();
    });

    it("should return search results with correct fields", async () => {
      mockClient.fetch.mockResolvedValueOnce([
        {
          title: "AWS Lambda Guide",
          url: "https://docs.aws.amazon.com/lambda",
          snippet: "Learn about Lambda",
          score: 0.95,
        },
      ]);

      const response = await service.search("lambda");

      expect(response.results).toHaveLength(1);
      expect(response.results[0]).toEqual({
        title: "AWS Lambda Guide",
        sourceUrl: "https://docs.aws.amazon.com/lambda",
        snippet: "Learn about Lambda",
        resourceType: "article",
        relevanceScore: 0.95,
      });
    });

    it("should sort results by relevance score descending", async () => {
      mockClient.fetch.mockResolvedValueOnce([
        {
          title: "Low",
          url: "https://example.com/a",
          snippet: "A",
          score: 0.3,
        },
        {
          title: "High",
          url: "https://example.com/b",
          snippet: "B",
          score: 0.9,
        },
        {
          title: "Mid",
          url: "https://example.com/c",
          snippet: "C",
          score: 0.6,
        },
      ]);

      const response = await service.search("test");

      expect(response.results[0].relevanceScore).toBe(0.9);
      expect(response.results[1].relevanceScore).toBe(0.6);
      expect(response.results[2].relevanceScore).toBe(0.3);
    });

    it("should suggest alternative terms when no results found", async () => {
      mockClient.fetch.mockResolvedValueOnce([]);

      const response = await service.search("lambda");

      expect(response.results).toHaveLength(0);
      expect(response.suggestedTerms).toBeDefined();
      expect(response.suggestedTerms!.length).toBeGreaterThan(0);
    });

    it("should not include suggestedTerms when results are found", async () => {
      mockClient.fetch.mockResolvedValueOnce([
        {
          title: "Result",
          url: "https://example.com",
          snippet: "text",
          score: 0.8,
        },
      ]);

      const response = await service.search("lambda");

      expect(response.results).toHaveLength(1);
      expect(response.suggestedTerms).toBeUndefined();
    });

    it("should categorize results by URL patterns", async () => {
      mockClient.fetch.mockResolvedValueOnce([
        {
          title: "Video",
          url: "https://youtube.com/watch?v=123",
          snippet: "vid",
          score: 0.9,
        },
        {
          title: "Blog",
          url: "https://medium.com/aws-post",
          snippet: "blog",
          score: 0.8,
        },
        {
          title: "Docs",
          url: "https://docs.aws.amazon.com/s3",
          snippet: "doc",
          score: 0.7,
        },
      ]);

      const response = await service.search("s3");

      expect(
        response.results.find((r) => r.title === "Video")!.resourceType,
      ).toBe("video");
      expect(
        response.results.find((r) => r.title === "Blog")!.resourceType,
      ).toBe("blog");
      expect(
        response.results.find((r) => r.title === "Docs")!.resourceType,
      ).toBe("article");
    });

    it("should assign default relevance scores when score is missing", async () => {
      mockClient.fetch.mockResolvedValueOnce([
        { title: "First", url: "https://example.com/1", snippet: "a" },
        { title: "Second", url: "https://example.com/2", snippet: "b" },
      ]);

      const response = await service.search("test");

      for (const result of response.results) {
        expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(result.relevanceScore).toBeLessThanOrEqual(1);
      }
    });

    it("should default title to 'Untitled' when missing", async () => {
      mockClient.fetch.mockResolvedValueOnce([
        { title: "", url: "https://example.com", snippet: "text", score: 0.5 },
      ]);

      const response = await service.search("test");

      expect(response.results[0].title).toBe("Untitled");
    });
  });

  describe("retry logic", () => {
    it("should retry once on TimeoutError and succeed", async () => {
      const results: RawSearchResult[] = [
        {
          title: "Result",
          url: "https://example.com",
          snippet: "text",
          score: 0.8,
        },
      ];
      mockClient.fetch
        .mockRejectedValueOnce(new TimeoutError())
        .mockResolvedValueOnce(results);

      const response = await service.search("lambda");

      expect(mockClient.fetch).toHaveBeenCalledTimes(2);
      expect(response.results).toHaveLength(1);
    });

    it("should retry once on TimeoutError and throw if retry also times out", async () => {
      mockClient.fetch
        .mockRejectedValueOnce(new TimeoutError())
        .mockRejectedValueOnce(new TimeoutError());

      await expect(service.search("lambda")).rejects.toThrow(TimeoutError);
      expect(mockClient.fetch).toHaveBeenCalledTimes(2);
    });

    it("should NOT retry on ServiceUnavailableError", async () => {
      mockClient.fetch.mockRejectedValueOnce(new ServiceUnavailableError());

      await expect(service.search("lambda")).rejects.toThrow(
        ServiceUnavailableError,
      );
      expect(mockClient.fetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on non-timeout errors", async () => {
      mockClient.fetch.mockRejectedValueOnce(new Error("Unknown error"));

      await expect(service.search("lambda")).rejects.toThrow();
      expect(mockClient.fetch).toHaveBeenCalledTimes(1);
    });
  });
});

describe("categorizeByUrl", () => {
  it("should categorize YouTube URLs as video", () => {
    expect(categorizeByUrl("https://youtube.com/watch?v=abc")).toBe("video");
    expect(categorizeByUrl("https://www.youtube.com/watch?v=abc")).toBe(
      "video",
    );
    expect(categorizeByUrl("https://youtu.be/abc")).toBe("video");
  });

  it("should categorize Vimeo and Twitch as video", () => {
    expect(categorizeByUrl("https://vimeo.com/123")).toBe("video");
    expect(categorizeByUrl("https://twitch.tv/stream")).toBe("video");
  });

  it("should categorize Medium and dev.to as blog", () => {
    expect(categorizeByUrl("https://medium.com/some-post")).toBe("blog");
    expect(categorizeByUrl("https://dev.to/user/post")).toBe("blog");
  });

  it("should categorize hashnode and wordpress as blog", () => {
    expect(categorizeByUrl("https://blog.hashnode.dev/post")).toBe("blog");
    expect(categorizeByUrl("https://site.wordpress.com/post")).toBe("blog");
  });

  it("should categorize URLs with /blog path as blog", () => {
    expect(categorizeByUrl("https://aws.amazon.com/blog/post")).toBe("blog");
  });

  it("should categorize docs and other URLs as article", () => {
    expect(categorizeByUrl("https://docs.aws.amazon.com/s3")).toBe("article");
    expect(categorizeByUrl("https://stackoverflow.com/q/123")).toBe("article");
    expect(categorizeByUrl("https://example.com/page")).toBe("article");
  });
});

describe("suggestAlternativeTerms", () => {
  it("should suggest adding AWS prefix when not present", () => {
    const terms = suggestAlternativeTerms("lambda functions");
    expect(terms.some((t) => t.startsWith("AWS "))).toBe(true);
  });

  it("should not suggest AWS prefix when already present", () => {
    const terms = suggestAlternativeTerms("AWS lambda");
    expect(terms.every((t) => !t.startsWith("AWS AWS"))).toBe(true);
  });

  it("should suggest tutorial variant", () => {
    const terms = suggestAlternativeTerms("S3 bucket");
    expect(terms.some((t) => t.includes("tutorial"))).toBe(true);
  });

  it("should return at most 3 suggestions", () => {
    const terms = suggestAlternativeTerms("some query");
    expect(terms.length).toBeLessThanOrEqual(3);
  });
});

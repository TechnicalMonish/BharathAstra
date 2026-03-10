import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SearchService,
  cosineSimilarity,
  highlightTerms,
  textBasedSearch,
} from "./searchService";
import { ValidationError } from "../utils/errors";
import { DocumentSection } from "../types/models";

// Mock uuid
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid"),
}));

// Mock AWS SDK clients
const mockDynamoSend = vi.fn();
const mockBedrockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({ send: mockDynamoSend })),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockDynamoSend })),
  },
  GetCommand: vi.fn((params) => params),
}));

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: vi.fn(() => ({ send: mockBedrockSend })),
  InvokeModelCommand: vi.fn((params) => params),
}));

function makeSections(
  overrides?: Partial<DocumentSection>[],
): DocumentSection[] {
  const defaults: DocumentSection[] = [
    {
      sectionId: "s1",
      heading: "Introduction to S3",
      pageNumber: 1,
      text: "Amazon S3 is an object storage service that offers scalability.",
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    },
    {
      sectionId: "s2",
      heading: "S3 Pricing",
      pageNumber: 3,
      text: "S3 pricing is based on storage used and requests made.",
      embedding: [0.5, 0.4, 0.3, 0.2, 0.1],
    },
    {
      sectionId: "s3",
      heading: "EC2 Overview",
      pageNumber: 5,
      text: "Amazon EC2 provides resizable compute capacity in the cloud.",
      embedding: [0.3, 0.3, 0.3, 0.3, 0.3],
    },
  ];
  if (overrides) {
    return overrides.map((o, i) => ({
      ...defaults[i % defaults.length],
      ...o,
    }));
  }
  return defaults;
}

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("should return 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("should return 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("should return 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("should return 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("should return value between -1 and 1", () => {
    const result = cosineSimilarity([1, -2, 3], [-1, 2, -3]);
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });
});

describe("highlightTerms", () => {
  it("should wrap matching terms with <mark> tags", () => {
    const result = highlightTerms(
      "Amazon S3 is a storage service",
      "S3 storage",
    );
    expect(result).toContain("<mark>S3</mark>");
    expect(result).toContain("<mark>storage</mark>");
  });

  it("should be case-insensitive", () => {
    const result = highlightTerms("Amazon S3 service", "s3");
    expect(result).toContain("<mark>S3</mark>");
  });

  it("should return original text when no terms match", () => {
    const result = highlightTerms("Amazon S3 service", "lambda");
    expect(result).toBe("Amazon S3 service");
  });

  it("should handle empty query", () => {
    const result = highlightTerms("some text", "");
    expect(result).toBe("some text");
  });

  it("should escape regex special characters in query", () => {
    const result = highlightTerms("price is $5.00", "$5.00");
    expect(result).toContain("<mark>$5.00</mark>");
  });
});

describe("textBasedSearch", () => {
  const sections = makeSections();

  it("should find sections containing query terms", () => {
    const results = textBasedSearch(sections, "S3");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].sectionHeading).toBeDefined();
  });

  it("should rank results by term match ratio", () => {
    const results = textBasedSearch(sections, "S3 pricing storage");
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].relevanceScore).toBeGreaterThanOrEqual(
        results[i + 1].relevanceScore,
      );
    }
  });

  it("should return empty array for no matches", () => {
    const results = textBasedSearch(sections, "kubernetes");
    expect(results).toEqual([]);
  });

  it("should include highlighted text in results", () => {
    const results = textBasedSearch(sections, "S3");
    for (const result of results) {
      expect(result.highlightedText).toContain("<mark>");
    }
  });

  it("should return empty for empty query", () => {
    const results = textBasedSearch(sections, "   ");
    expect(results).toEqual([]);
  });
});

describe("SearchService", () => {
  let service: SearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SearchService();
  });

  describe("searchDocument", () => {
    it("should reject empty queries", async () => {
      await expect(service.searchDocument("doc-1", "")).rejects.toThrow(
        ValidationError,
      );
    });

    it("should reject queries exceeding 500 characters", async () => {
      const longQuery = "a".repeat(501);
      await expect(service.searchDocument("doc-1", longQuery)).rejects.toThrow(
        ValidationError,
      );
    });

    it("should throw when document is not found", async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });
      await expect(
        service.searchDocument("nonexistent", "test query"),
      ).rejects.toThrow("not found");
    });

    it("should return results ranked by relevance score descending", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      // Mock embedding generation - return a vector close to section 1
      const queryEmbedding = [0.12, 0.22, 0.32, 0.42, 0.52];
      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({ embedding: queryEmbedding }),
        ),
      });

      const response = await service.searchDocument("doc-1", "S3 storage");

      expect(response.results.length).toBeGreaterThan(0);
      for (let i = 0; i < response.results.length - 1; i++) {
        expect(response.results[i].relevanceScore).toBeGreaterThanOrEqual(
          response.results[i + 1].relevanceScore,
        );
      }
    });

    it("should include section heading and page number in results", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }),
        ),
      });

      const response = await service.searchDocument("doc-1", "S3");

      for (const result of response.results) {
        expect(result.sectionHeading).toBeTruthy();
        expect(result.pageNumber).toBeGreaterThanOrEqual(1);
      }
    });

    it("should highlight matching terms in results", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }),
        ),
      });

      const response = await service.searchDocument("doc-1", "S3");

      for (const result of response.results) {
        expect(result.highlightedText).toBeDefined();
        expect(typeof result.highlightedText).toBe("string");
      }
    });

    it("should fall back to text search when sections have no embeddings", async () => {
      const sections = makeSections([
        {
          sectionId: "s1",
          heading: "S3 Guide",
          pageNumber: 1,
          text: "S3 is great for storage",
          embedding: [],
        },
        {
          sectionId: "s2",
          heading: "EC2 Guide",
          pageNumber: 2,
          text: "EC2 is compute",
          embedding: [],
        },
      ]);
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({ embedding: [0.1, 0.2, 0.3] }),
        ),
      });

      const response = await service.searchDocument("doc-1", "S3 storage");

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].sectionHeading).toBe("S3 Guide");
    });

    it("should suggest related topics when no results found", async () => {
      const sections = makeSections([
        {
          sectionId: "s1",
          heading: "Lambda Functions",
          pageNumber: 1,
          text: "Lambda is serverless",
          embedding: [],
        },
      ]);
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend
        .mockResolvedValueOnce({
          body: new TextEncoder().encode(
            JSON.stringify({ embedding: [0.1, 0.2, 0.3] }),
          ),
        })
        .mockResolvedValueOnce({
          body: new TextEncoder().encode(
            JSON.stringify({
              content: [{ text: '["Lambda", "Serverless", "Functions"]' }],
            }),
          ),
        });

      const response = await service.searchDocument("doc-1", "kubernetes pods");

      expect(response.results).toEqual([]);
      expect(response.suggestedTopics).toBeDefined();
      expect(Array.isArray(response.suggestedTopics)).toBe(true);
    });

    it("should return relevance scores between 0 and 1", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }),
        ),
      });

      const response = await service.searchDocument("doc-1", "S3");

      for (const result of response.results) {
        expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(result.relevanceScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("summarizeDocument", () => {
    it("should return a full-document summary with all section references", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: "This document covers Amazon S3 object storage, its pricing model, and Amazon EC2 compute capacity.",
              },
            ],
          }),
        ),
      });

      const response = await service.summarizeDocument("doc-1");

      expect(response.summary).toBeTruthy();
      expect(response.wordCount).toBeGreaterThan(0);
      expect(response.wordCount).toBeLessThanOrEqual(500);
      expect(response.references).toHaveLength(sections.length);
      for (const ref of response.references) {
        expect(ref.sectionHeading).toBeTruthy();
        expect(ref.pageNumber).toBeGreaterThanOrEqual(1);
      }
    });

    it("should return a section summary when sectionId is provided", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: "Amazon S3 is a scalable object storage service.",
              },
            ],
          }),
        ),
      });

      const response = await service.summarizeDocument("doc-1", "s1");

      expect(response.summary).toBeTruthy();
      expect(response.wordCount).toBeGreaterThan(0);
      expect(response.wordCount).toBeLessThanOrEqual(200);
      expect(response.references).toHaveLength(1);
      expect(response.references[0].sectionHeading).toBe("Introduction to S3");
      expect(response.references[0].pageNumber).toBe(1);
    });

    it("should throw when document is not found", async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });
      await expect(service.summarizeDocument("nonexistent")).rejects.toThrow(
        "not found",
      );
    });

    it("should throw when sectionId does not exist", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      await expect(
        service.summarizeDocument("doc-1", "nonexistent-section"),
      ).rejects.toThrow("not found");
    });

    it("should throw ProcessingError when document has no sections", async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections: [] },
      });

      await expect(service.summarizeDocument("doc-1")).rejects.toThrow(
        "no content to summarize",
      );
    });

    it("should throw ServiceUnavailableError when Bedrock fails", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      mockBedrockSend.mockRejectedValueOnce(new Error("Bedrock timeout"));

      await expect(service.summarizeDocument("doc-1")).rejects.toThrow(
        "Service temporarily unavailable",
      );
    });

    it("should truncate summary if Bedrock exceeds word limit", async () => {
      const sections = makeSections();
      mockDynamoSend.mockResolvedValueOnce({
        Item: { documentId: "doc-1", sections },
      });

      // Generate a response with more than 500 words
      const longSummary = Array(600).fill("word").join(" ");
      mockBedrockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: longSummary }],
          }),
        ),
      });

      const response = await service.summarizeDocument("doc-1");

      expect(response.wordCount).toBeLessThanOrEqual(500);
    });
  });
});

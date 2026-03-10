// Feature: aws-doc-intelligence, Property 9: Resource search results contain all required fields
// **Validates: Requirements 4.2**

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import type { SearchResult } from "../types/index";
import {
  ResourceAggregatorService,
  categorizeByUrl,
  filterByResourceType,
  type ISearchClient,
  type RawSearchResult,
} from "./resourceService";

// Valid resource types as defined in the SearchResult interface
const VALID_RESOURCE_TYPES = ["blog", "video", "article"] as const;

// Generator: a valid URL string (http or https)
const validUrlArb = fc
  .record({
    protocol: fc.constantFrom("https://", "http://"),
    domain: fc.stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
      { minLength: 2, maxLength: 20 },
    ),
    tld: fc.constantFrom(".com", ".org", ".io", ".dev", ".net"),
    path: fc.stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-/".split("")),
      { minLength: 0, maxLength: 30 },
    ),
  })
  .map((parts) => `${parts.protocol}${parts.domain}${parts.tld}/${parts.path}`);

// Generator: a valid SearchResult with all required fields
const searchResultArb: fc.Arbitrary<SearchResult> = fc.record({
  title: fc
    .stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(
          "",
        ),
      ),
      { minLength: 1, maxLength: 100 },
    )
    .filter((s) => s.trim().length > 0),
  sourceUrl: validUrlArb,
  snippet: fc
    .stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,".split(
          "",
        ),
      ),
      { minLength: 1, maxLength: 200 },
    )
    .filter((s) => s.trim().length > 0),
  resourceType: fc.constantFrom(...VALID_RESOURCE_TYPES),
  relevanceScore: fc
    .integer({ min: 0, max: 1000 })
    .map((n) => Math.round((n / 1000) * 1000) / 1000),
});

describe("Property 9: Resource search results contain all required fields", () => {
  it("for any random SearchResult, it has non-empty title, valid URL, non-empty snippet, and valid resourceType", () => {
    fc.assert(
      fc.property(searchResultArb, (result) => {
        // title must be a non-empty string
        expect(typeof result.title).toBe("string");
        expect(result.title.trim().length).toBeGreaterThan(0);

        // sourceUrl must be a valid URL (starts with http:// or https://)
        expect(typeof result.sourceUrl).toBe("string");
        expect(
          result.sourceUrl.startsWith("http://") ||
            result.sourceUrl.startsWith("https://"),
        ).toBe(true);

        // snippet must be a non-empty string
        expect(typeof result.snippet).toBe("string");
        expect(result.snippet.trim().length).toBeGreaterThan(0);

        // resourceType must be one of the valid types
        expect(VALID_RESOURCE_TYPES).toContain(result.resourceType);
      }),
      { numRuns: 100 },
    );
  });

  it("for an array of random SearchResults, every result has all required fields", () => {
    const searchResultsArb = fc.array(searchResultArb, {
      minLength: 1,
      maxLength: 20,
    });

    fc.assert(
      fc.property(searchResultsArb, (results) => {
        for (const result of results) {
          // title: non-empty string
          expect(typeof result.title).toBe("string");
          expect(result.title.trim().length).toBeGreaterThan(0);

          // sourceUrl: valid URL
          expect(typeof result.sourceUrl).toBe("string");
          expect(
            result.sourceUrl.startsWith("http://") ||
              result.sourceUrl.startsWith("https://"),
          ).toBe(true);

          // snippet: non-empty string
          expect(typeof result.snippet).toBe("string");
          expect(result.snippet.trim().length).toBeGreaterThan(0);

          // resourceType: one of the valid types
          expect(VALID_RESOURCE_TYPES).toContain(result.resourceType);

          // relevanceScore: number in [0, 1]
          expect(typeof result.relevanceScore).toBe("number");
          expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
          expect(result.relevanceScore).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("ResourceAggregatorService.search returns results with all required fields", async () => {
    // Generator: raw search results that the mock ISearchClient returns
    const rawResultArb: fc.Arbitrary<RawSearchResult> = fc.record({
      title: fc
        .stringOf(
          fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(
              "",
            ),
          ),
          { minLength: 1, maxLength: 60 },
        )
        .filter((s) => s.trim().length > 0),
      url: fc.constantFrom(
        "https://aws.amazon.com/blogs/compute/lambda-guide",
        "https://youtube.com/watch?v=abc123",
        "https://medium.com/aws-tips",
        "https://dev.to/aws-tutorial",
        "https://docs.aws.amazon.com/s3/guide",
        "https://hashnode.com/post/aws-bedrock",
        "https://vimeo.com/aws-demo",
      ),
      snippet: fc
        .stringOf(
          fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,".split(
              "",
            ),
          ),
          { minLength: 1, maxLength: 150 },
        )
        .filter((s) => s.trim().length > 0),
      score: fc
        .integer({ min: 0, max: 1000 })
        .map((n) => Math.round((n / 1000) * 1000) / 1000),
    });

    const rawResultsArb = fc.array(rawResultArb, {
      minLength: 1,
      maxLength: 10,
    });

    await fc.assert(
      fc.asyncProperty(rawResultsArb, async (rawResults) => {
        // Create a mock ISearchClient that returns the generated raw results
        const mockClient: ISearchClient = {
          fetch: vi.fn().mockResolvedValue(rawResults),
        };

        const service = new ResourceAggregatorService(mockClient);
        const response = await service.search("AWS Lambda");

        // Verify every result in the response has all required fields
        for (const result of response.results) {
          // title: non-empty string
          expect(typeof result.title).toBe("string");
          expect(result.title.trim().length).toBeGreaterThan(0);

          // sourceUrl: valid URL
          expect(typeof result.sourceUrl).toBe("string");
          expect(
            result.sourceUrl.startsWith("http://") ||
              result.sourceUrl.startsWith("https://"),
          ).toBe(true);

          // snippet: non-empty string
          expect(typeof result.snippet).toBe("string");
          expect(result.snippet.trim().length).toBeGreaterThan(0);

          // resourceType: one of the valid types
          expect(VALID_RESOURCE_TYPES).toContain(result.resourceType);

          // relevanceScore: number in [0, 1]
          expect(typeof result.relevanceScore).toBe("number");
          expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
          expect(result.relevanceScore).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("categorizeByUrl always returns a valid resource type", () => {
    fc.assert(
      fc.property(validUrlArb, (url) => {
        const resourceType = categorizeByUrl(url);
        expect(VALID_RESOURCE_TYPES).toContain(resourceType);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 10: Resource type filtering returns only matching types
// **Validates: Requirements 4.5**

describe("Property 10: Resource type filtering returns only matching types", () => {
  // Generator: random filter type
  const filterTypeArb = fc.constantFrom(
    ...VALID_RESOURCE_TYPES,
  ) as fc.Arbitrary<"blog" | "video" | "article">;

  // Generator: array of SearchResults with mixed resource types
  const mixedSearchResultsArb = fc.array(searchResultArb, {
    minLength: 0,
    maxLength: 30,
  });

  it("filtering returns only results matching the selected resource type", () => {
    fc.assert(
      fc.property(
        mixedSearchResultsArb,
        filterTypeArb,
        (results, filterType) => {
          const filtered = filterByResourceType(results, filterType);

          // All returned results must have the matching resourceType
          for (const result of filtered) {
            expect(result.resourceType).toBe(filterType);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("filtering excludes all results of non-matching types", () => {
    fc.assert(
      fc.property(
        mixedSearchResultsArb,
        filterTypeArb,
        (results, filterType) => {
          const filtered = filterByResourceType(results, filterType);

          // No results of other types should be included
          const otherTypes = VALID_RESOURCE_TYPES.filter(
            (t) => t !== filterType,
          );
          for (const result of filtered) {
            expect(otherTypes).not.toContain(result.resourceType);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("filtered count matches the count of matching items in the original array", () => {
    fc.assert(
      fc.property(
        mixedSearchResultsArb,
        filterTypeArb,
        (results, filterType) => {
          const filtered = filterByResourceType(results, filterType);

          // Count of filtered results must equal count of matching items in original
          const expectedCount = results.filter(
            (r) => r.resourceType === filterType,
          ).length;
          expect(filtered.length).toBe(expectedCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});

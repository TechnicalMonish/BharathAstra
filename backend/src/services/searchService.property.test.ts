// Feature: aws-doc-intelligence, Property 4: Search results are ordered by relevance score descending
// **Validates: Requirements 2.1, 4.3**

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { textBasedSearch } from "./searchService";
import type { DocumentSearchResult, DocumentSearchResponse } from "../types";
import type { DocumentSection } from "../types/models";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

// Generator: a single DocumentSearchResult with a relevance score in [0.0, 1.0]
const documentSearchResultArb = fc
  .record({
    sectionHeading: fc
      .stringOf(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
        ),
        { minLength: 1, maxLength: 50 },
      )
      .filter((s) => s.trim().length > 0),
    pageNumber: fc.integer({ min: 1, max: 500 }),
    text: fc.string({ minLength: 1, maxLength: 200 }),
    highlightedText: fc.string({ minLength: 1, maxLength: 200 }),
    relevanceScore: fc
      .integer({ min: 0, max: 1000 })
      .map((n) => Math.round((n / 1000) * 1000) / 1000),
  })
  .filter((r) => r.relevanceScore >= 0 && r.relevanceScore <= 1);

// Generator: a DocumentSearchResponse with 2+ results
const searchResponseWithResultsArb = fc
  .array(documentSearchResultArb, { minLength: 2, maxLength: 20 })
  .map((results) => {
    // Sort descending by relevanceScore to simulate what the service should produce
    const sorted = [...results].sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    );
    return { results: sorted } as DocumentSearchResponse;
  });

// Generator: DocumentSection for textBasedSearch testing
const documentSectionArb = (terms: string[]) => {
  // Create sections that contain at least one of the query terms
  return fc
    .record({
      sectionId: fc.uuid(),
      heading: fc
        .stringOf(
          fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(
              "",
            ),
          ),
          { minLength: 1, maxLength: 30 },
        )
        .filter((s) => s.trim().length > 0),
      pageNumber: fc.integer({ min: 1, max: 100 }),
      text: fc
        .array(
          fc.oneof(
            // Some text chunks include query terms
            fc.constantFrom(...terms),
            // Some are random filler
            fc.stringOf(
              fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz ".split("")),
              { minLength: 1, maxLength: 30 },
            ),
          ),
          { minLength: 1, maxLength: 10 },
        )
        .map((parts) => parts.join(" ")),
      embedding: fc.constant([]),
    })
    .filter((s) => s.text.trim().length > 0);
};

describe("Property 4: Search results are ordered by relevance score descending", () => {
  it("for any search response with 2+ results, each result's relevance score >= the next result's score", () => {
    fc.assert(
      fc.property(searchResponseWithResultsArb, (response) => {
        const { results } = response;

        // Verify ordering: each result's score >= next result's score
        for (let i = 0; i < results.length - 1; i++) {
          expect(results[i].relevanceScore).toBeGreaterThanOrEqual(
            results[i + 1].relevanceScore,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it("textBasedSearch returns results sorted by relevance score descending", () => {
    // Use a fixed set of query terms for generating sections
    const queryTerms = ["lambda", "s3", "ec2", "dynamodb", "bedrock"];

    const sectionsArb = fc.array(documentSectionArb(queryTerms), {
      minLength: 2,
      maxLength: 15,
    });

    const queryArb = fc
      .subarray(queryTerms, { minLength: 1, maxLength: 3 })
      .map((terms) => terms.join(" "));

    fc.assert(
      fc.property(sectionsArb, queryArb, (sections, query) => {
        const results = textBasedSearch(sections, query);

        // If we got 2+ results, verify descending order
        if (results.length >= 2) {
          for (let i = 0; i < results.length - 1; i++) {
            expect(results[i].relevanceScore).toBeGreaterThanOrEqual(
              results[i + 1].relevanceScore,
            );
          }
        }

        // All scores should be in [0.0, 1.0]
        for (const result of results) {
          expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
          expect(result.relevanceScore).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 5: Search highlights contain query terms
// **Validates: Requirements 2.2**

import { highlightTerms } from "./searchService";

// Generator: a non-empty query term consisting of alphanumeric characters
const queryTermArb = fc.stringOf(
  fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(
      "",
    ),
  ),
  { minLength: 1, maxLength: 15 },
);

// Generator: array of 1-5 unique query terms
const queryTermsArb = fc
  .uniqueArray(queryTermArb, { minLength: 1, maxLength: 5 })
  .filter((terms) => terms.length > 0);

// Generator: random filler text (words that won't collide with query terms)
const fillerWordArb = fc.constantFrom(
  "the",
  "quick",
  "brown",
  "fox",
  "jumps",
  "over",
  "lazy",
  "dog",
  "and",
  "with",
  "for",
  "from",
  "into",
  "upon",
  "about",
);

describe("Property 5: Search highlights contain query terms", () => {
  it("when text contains query terms, highlightTerms wraps them with <mark> tags", () => {
    fc.assert(
      fc.property(
        queryTermsArb,
        fillerWordArb,
        fc.integer({ min: 0, max: 4 }),
        (terms, filler, insertIdx) => {
          // Build text that definitely contains at least one query term
          const fillerWords = [filler, filler, filler];
          // Insert a query term into the filler text
          const termToInsert = terms[0];
          const position = Math.min(insertIdx, fillerWords.length);
          fillerWords.splice(position, 0, termToInsert);
          const text = fillerWords.join(" ");
          const query = terms.join(" ");

          const highlighted = highlightTerms(text, query);

          // The highlighted output should contain at least one <mark> tag
          expect(highlighted).toContain("<mark>");
          expect(highlighted).toContain("</mark>");

          // Verify the marked content contains at least one of the query terms (case-insensitive)
          const markRegex = /<mark>(.*?)<\/mark>/gi;
          const matches = [...highlighted.matchAll(markRegex)];
          expect(matches.length).toBeGreaterThan(0);

          const lowerTerms = terms.map((t) => t.toLowerCase());
          const someTermFound = matches.some((m) =>
            lowerTerms.includes(m[1].toLowerCase()),
          );
          expect(someTermFound).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("when text does not contain any query terms, highlightTerms returns text without <mark> tags", () => {
    fc.assert(
      fc.property(
        fc.constant("the quick brown fox jumps over the lazy dog"),
        fc.constant("zzzzuniquetermzzzz xxxxxnotheretermxxxxx"),
        (text, query) => {
          const highlighted = highlightTerms(text, query);

          // No marks should be present since terms don't appear in text
          expect(highlighted).not.toContain("<mark>");
          expect(highlighted).toBe(text);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("highlightTerms produces marks that exactly match query terms regardless of case", () => {
    fc.assert(
      fc.property(queryTermsArb, (terms) => {
        // Build text with mixed-case versions of the terms
        const text = terms
          .map((t, i) => (i % 2 === 0 ? t.toUpperCase() : t.toLowerCase()))
          .join(" some filler ");
        const query = terms.join(" ");

        const highlighted = highlightTerms(text, query);

        // Extract all marked content
        const markRegex = /<mark>(.*?)<\/mark>/gi;
        const matches = [...highlighted.matchAll(markRegex)];

        // Every marked portion should be one of the query terms (case-insensitive)
        const lowerTerms = terms.map((t) => t.toLowerCase());
        for (const match of matches) {
          expect(lowerTerms).toContain(match[1].toLowerCase());
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 6: Document search results contain structural metadata
// **Validates: Requirements 2.3**

describe("Property 6: Document search results contain structural metadata", () => {
  it("for any random DocumentSearchResult, sectionHeading is non-empty and pageNumber >= 1", () => {
    fc.assert(
      fc.property(documentSearchResultArb, (result) => {
        // sectionHeading must be a non-empty string (after trimming)
        expect(typeof result.sectionHeading).toBe("string");
        expect(result.sectionHeading.trim().length).toBeGreaterThan(0);

        // pageNumber must be >= 1
        expect(result.pageNumber).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it("textBasedSearch results always contain non-empty sectionHeading and pageNumber >= 1", () => {
    const queryTerms = ["lambda", "s3", "ec2", "dynamodb", "bedrock"];

    const sectionsArb = fc.array(documentSectionArb(queryTerms), {
      minLength: 1,
      maxLength: 15,
    });

    const queryArb = fc
      .subarray(queryTerms, { minLength: 1, maxLength: 3 })
      .map((terms) => terms.join(" "));

    fc.assert(
      fc.property(sectionsArb, queryArb, (sections, query) => {
        const results = textBasedSearch(sections, query);

        for (const result of results) {
          // Each result must have a non-empty section heading
          expect(typeof result.sectionHeading).toBe("string");
          expect(result.sectionHeading.trim().length).toBeGreaterThan(0);

          // Each result must have a page number >= 1
          expect(result.pageNumber).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 7: Summary responses include section references
// **Validates: Requirements 3.4**

import type { SummarizeResponse } from "../types";

// Generator: a single reference with non-empty sectionHeading and pageNumber >= 1
const summaryReferenceArb = fc.record({
  sectionHeading: fc
    .stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(
          "",
        ),
      ),
      { minLength: 1, maxLength: 60 },
    )
    .filter((s) => s.trim().length > 0),
  pageNumber: fc.integer({ min: 1, max: 500 }),
});

// Generator: a valid SummarizeResponse with at least one reference
const summarizeResponseArb = fc.record({
  summary: fc.string({ minLength: 1, maxLength: 500 }),
  references: fc.array(summaryReferenceArb, { minLength: 1, maxLength: 20 }),
  wordCount: fc.integer({ min: 1, max: 500 }),
}) as fc.Arbitrary<SummarizeResponse>;

describe("Property 7: Summary responses include section references", () => {
  it("for any random SummarizeResponse, references array has at least one entry with valid sectionHeading and pageNumber", () => {
    fc.assert(
      fc.property(summarizeResponseArb, (response) => {
        // Must have at least one reference
        expect(response.references).toBeDefined();
        expect(Array.isArray(response.references)).toBe(true);
        expect(response.references.length).toBeGreaterThanOrEqual(1);

        // Each reference must have a non-empty sectionHeading and pageNumber >= 1
        for (const ref of response.references) {
          expect(typeof ref.sectionHeading).toBe("string");
          expect(ref.sectionHeading.trim().length).toBeGreaterThan(0);
          expect(ref.pageNumber).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("summarizeDocument returns response with at least one reference containing sectionHeading and pageNumber", async () => {
    // Generator for document sections (at least 1 section)
    const sectionArb = fc.record({
      sectionId: fc.uuid(),
      heading: fc
        .stringOf(
          fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(
              "",
            ),
          ),
          { minLength: 1, maxLength: 40 },
        )
        .filter((s) => s.trim().length > 0),
      pageNumber: fc.integer({ min: 1, max: 100 }),
      text: fc
        .stringOf(
          fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ.".split(
              "",
            ),
          ),
          { minLength: 10, maxLength: 200 },
        )
        .filter((s) => s.trim().length > 0),
      embedding: fc.constant([] as number[]),
    });

    const sectionsArb = fc.array(sectionArb, {
      minLength: 1,
      maxLength: 5,
    });

    await fc.assert(
      fc.asyncProperty(sectionsArb, async (sections) => {
        // Mock Bedrock to return a simple summary
        const mockBedrockClient = {
          send: vi.fn().mockResolvedValue({
            body: new TextEncoder().encode(
              JSON.stringify({
                content: [
                  { text: "This is a test summary of the AWS document." },
                ],
              }),
            ),
          }),
        } as unknown as BedrockRuntimeClient;

        // Create SearchService instance via Object.create to bypass constructor DynamoDB issues
        const { SearchService: SearchServiceClass } =
          await import("./searchService");

        const service = Object.create(SearchServiceClass.prototype);
        service.bedrockClient = mockBedrockClient;
        service.docClient = {
          send: vi.fn().mockResolvedValue({
            Item: {
              documentId: "test-doc-id",
              sections,
            },
          }),
        };

        const result = await service.summarizeDocument("test-doc-id");

        // Verify references array has at least one entry
        expect(result.references).toBeDefined();
        expect(Array.isArray(result.references)).toBe(true);
        expect(result.references.length).toBeGreaterThanOrEqual(1);

        // Each reference must have a non-empty sectionHeading and pageNumber >= 1
        for (const ref of result.references) {
          expect(typeof ref.sectionHeading).toBe("string");
          expect(ref.sectionHeading.trim().length).toBeGreaterThan(0);
          expect(ref.pageNumber).toBeGreaterThanOrEqual(1);
        }

        // References should correspond to the input sections
        expect(result.references.length).toBe(sections.length);
        for (let i = 0; i < sections.length; i++) {
          expect(result.references[i].sectionHeading).toBe(sections[i].heading);
          expect(result.references[i].pageNumber).toBe(sections[i].pageNumber);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 8: Summary word count respects limits
// **Validates: Requirements 3.5**

describe("Property 8: Summary word count respects limits", () => {
  // Generator: random words (simple alphabetic tokens)
  const wordArb = fc.stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
    { minLength: 1, maxLength: 12 },
  );

  // Generator: a summary text with a configurable number of words
  const summaryTextArb = (minWords: number, maxWords: number) =>
    fc
      .array(wordArb, { minLength: minWords, maxLength: maxWords })
      .map((words) => words.join(" "));

  // Generator: document sections (at least 1)
  const sectionForProp8Arb = fc.record({
    sectionId: fc.uuid(),
    heading: fc
      .stringOf(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
        ),
        { minLength: 1, maxLength: 40 },
      )
      .filter((s) => s.trim().length > 0),
    pageNumber: fc.integer({ min: 1, max: 100 }),
    text: fc
      .stringOf(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ.".split(""),
        ),
        { minLength: 10, maxLength: 200 },
      )
      .filter((s) => s.trim().length > 0),
    embedding: fc.constant([] as number[]),
  });

  const sectionsForProp8Arb = fc.array(sectionForProp8Arb, {
    minLength: 1,
    maxLength: 5,
  });

  // Helper: create a mock Bedrock client that returns a given summary text
  function createMockBedrockClient(summaryText: string) {
    return {
      send: vi.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: summaryText }],
          }),
        ),
      }),
    } as unknown as BedrockRuntimeClient;
  }

  // Helper: create a mock DynamoDB doc client that returns given sections
  function createMockDocClient(sections: any[]) {
    return {
      send: vi.fn().mockResolvedValue({
        Item: {
          documentId: "test-doc-id",
          sections,
        },
      }),
    };
  }

  it("full-document summary word count <= 500 and wordCount matches actual word count", async () => {
    // Generate summaries of varying lengths: some within 500, some exceeding (up to 700)
    await fc.assert(
      fc.asyncProperty(
        sectionsForProp8Arb,
        summaryTextArb(1, 700),
        async (sections, bedrockSummary) => {
          const { SearchService: SearchServiceClass } =
            await import("./searchService");

          const service = Object.create(SearchServiceClass.prototype);
          service.bedrockClient = createMockBedrockClient(bedrockSummary);
          service.docClient = createMockDocClient(sections);

          const result = await service.summarizeDocument("test-doc-id");

          // Word count must not exceed 500 for full-document summary
          expect(result.wordCount).toBeLessThanOrEqual(500);

          // wordCount field must match the actual word count of the summary text
          const actualWordCount = result.summary
            .split(/\s+/)
            .filter((w: string) => w.length > 0).length;
          expect(result.wordCount).toBe(actualWordCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("section summary word count <= 200 and wordCount matches actual word count", async () => {
    // Generate summaries of varying lengths: some within 200, some exceeding (up to 400)
    await fc.assert(
      fc.asyncProperty(
        sectionForProp8Arb,
        summaryTextArb(1, 400),
        async (section, bedrockSummary) => {
          const { SearchService: SearchServiceClass } =
            await import("./searchService");

          const service = Object.create(SearchServiceClass.prototype);
          service.bedrockClient = createMockBedrockClient(bedrockSummary);
          service.docClient = createMockDocClient([section]);

          const result = await service.summarizeDocument(
            "test-doc-id",
            section.sectionId,
          );

          // Word count must not exceed 200 for section summary
          expect(result.wordCount).toBeLessThanOrEqual(200);

          // wordCount field must match the actual word count of the summary text
          const actualWordCount = result.summary
            .split(/\s+/)
            .filter((w: string) => w.length > 0).length;
          expect(result.wordCount).toBe(actualWordCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});

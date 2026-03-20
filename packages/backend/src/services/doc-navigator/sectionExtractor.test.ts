import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SectionExtractor,
  computeKeywordOverlap,
  findHighlightRanges,
  splitIntoSentences,
  computeSentenceRelevance,
  MAX_EXTRACTED_SECTIONS,
} from "./sectionExtractor";
import type {
  SearchMatch,
  ProcessedQuery,
  ExtractedSection,
} from "@aws-intel/shared";
import { QueryType } from "@aws-intel/shared";

// --- Mock DynamoDB ---
vi.mock("../../lib/dynamodb", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue([]),
}));

// --- Helpers ---

function makeMatch(overrides: Partial<SearchMatch> = {}): SearchMatch {
  return {
    docId: "doc-1",
    docTitle: "Test Doc",
    sectionId: "sec-0",
    sectionTitle: "Test Section",
    content: "AWS Lambda is a serverless compute service.",
    relevanceScore: 0.8,
    ...overrides,
  };
}

function makeQuery(overrides: Partial<ProcessedQuery> = {}): ProcessedQuery {
  return {
    originalQuestion: "How do I use Lambda?",
    normalizedQuestion: "lambda",
    awsServices: ["Lambda"],
    concepts: ["serverless"],
    queryType: QueryType.HOW_TO,
    keywords: ["lambda", "serverless"],
    ...overrides,
  };
}

function makeSection(overrides: Partial<ExtractedSection> = {}): ExtractedSection {
  return {
    docId: "doc-1",
    docTitle: "Test Doc",
    sectionId: "sec-0",
    sectionNumber: "1",
    sectionTitle: "Test Section",
    content: "AWS Lambda is a serverless compute service. It runs your code without provisioning servers.",
    relevanceScore: 0.8,
    parentSections: [],
    ...overrides,
  };
}

// --- Tests ---

describe("splitIntoSentences", () => {
  it("splits text into sentences with correct positions", () => {
    const text = "First sentence. Second sentence. Third one.";
    const spans = splitIntoSentences(text);

    expect(spans.length).toBe(3);
    expect(spans[0].text).toBe("First sentence.");
    expect(spans[1].text).toBe("Second sentence.");
    expect(spans[2].text).toBe("Third one.");
  });

  it("returns empty array for empty text", () => {
    expect(splitIntoSentences("")).toEqual([]);
  });

  it("handles text without punctuation", () => {
    const spans = splitIntoSentences("No punctuation here");
    expect(spans.length).toBe(1);
    expect(spans[0].text).toBe("No punctuation here");
  });

  it("provides correct startIndex and endIndex", () => {
    const text = "Hello. World.";
    const spans = splitIntoSentences(text);
    expect(spans[0].startIndex).toBe(0);
    expect(spans[0].endIndex).toBeLessThanOrEqual(text.indexOf("World"));
  });
});

describe("computeSentenceRelevance", () => {
  it("returns 1 when all terms match", () => {
    const score = computeSentenceRelevance("lambda serverless", ["lambda", "serverless"]);
    expect(score).toBe(1);
  });

  it("returns 0 when no terms match", () => {
    const score = computeSentenceRelevance("hello world", ["lambda", "serverless"]);
    expect(score).toBe(0);
  });

  it("returns partial score for partial matches", () => {
    const score = computeSentenceRelevance("lambda function", ["lambda", "serverless"]);
    expect(score).toBe(0.5);
  });

  it("returns 0 for empty search terms", () => {
    expect(computeSentenceRelevance("anything", [])).toBe(0);
  });
});

describe("computeKeywordOverlap", () => {
  it("returns 1 when all keywords found in content", () => {
    expect(computeKeywordOverlap("aws lambda serverless", ["lambda", "serverless"])).toBe(1);
  });

  it("returns 0 when no keywords found", () => {
    expect(computeKeywordOverlap("hello world", ["lambda"])).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(computeKeywordOverlap("AWS Lambda", ["lambda"])).toBe(1);
  });

  it("returns 0 for empty keywords", () => {
    expect(computeKeywordOverlap("anything", [])).toBe(0);
  });
});

describe("findHighlightRanges", () => {
  it("finds sentences matching query keywords", () => {
    const content = "AWS Lambda is a serverless service. It is very fast. Lambda scales automatically.";
    const query = makeQuery({ keywords: ["lambda", "serverless"] });
    const highlights = findHighlightRanges(content, query);

    expect(highlights.length).toBeGreaterThan(0);
    // The first highlight should be the most relevant
    expect(highlights[0].relevanceScore).toBeGreaterThan(0);
  });

  it("returns empty array when no sentences match", () => {
    const content = "This is about databases and storage.";
    const query = makeQuery({ keywords: ["lambda"], awsServices: [], concepts: [] });
    const highlights = findHighlightRanges(content, query);

    expect(highlights.length).toBe(0);
  });

  it("includes startIndex and endIndex for each highlight", () => {
    const content = "Lambda is serverless. S3 is storage.";
    const query = makeQuery({ keywords: ["lambda", "serverless"] });
    const highlights = findHighlightRanges(content, query);

    for (const h of highlights) {
      expect(h.startIndex).toBeGreaterThanOrEqual(0);
      expect(h.endIndex).toBeGreaterThan(h.startIndex);
    }
  });

  it("sorts highlights by relevance descending", () => {
    const content = "Lambda is great. Lambda and serverless are powerful. Just some text.";
    const query = makeQuery({ keywords: ["lambda", "serverless"] });
    const highlights = findHighlightRanges(content, query);

    for (let i = 1; i < highlights.length; i++) {
      expect(highlights[i - 1].relevanceScore).toBeGreaterThanOrEqual(
        highlights[i].relevanceScore
      );
    }
  });
});

describe("SectionExtractor", () => {
  let extractor: SectionExtractor;

  beforeEach(() => {
    extractor = new SectionExtractor();
  });

  describe("extractRelevantSections", () => {
    it("returns empty array for empty matches", async () => {
      const result = await extractor.extractRelevantSections([], makeQuery());
      expect(result).toEqual([]);
    });

    it("returns at most MAX_EXTRACTED_SECTIONS sections", async () => {
      const matches = Array.from({ length: 10 }, (_, i) =>
        makeMatch({ sectionId: `sec-${i}`, relevanceScore: 0.5 + i * 0.05 })
      );
      const result = await extractor.extractRelevantSections(matches, makeQuery());
      expect(result.length).toBeLessThanOrEqual(MAX_EXTRACTED_SECTIONS);
    });

    it("ranks sections by combined relevance score", async () => {
      const matches = [
        makeMatch({ sectionId: "sec-low", relevanceScore: 0.2, content: "unrelated content" }),
        makeMatch({ sectionId: "sec-high", relevanceScore: 0.9, content: "lambda serverless compute" }),
      ];
      const result = await extractor.extractRelevantSections(matches, makeQuery());

      expect(result.length).toBe(2);
      expect(result[0].relevanceScore).toBeGreaterThanOrEqual(result[1].relevanceScore);
    });

    it("includes section numbers and titles", async () => {
      const matches = [makeMatch({ sectionTitle: "Getting Started" })];
      const result = await extractor.extractRelevantSections(matches, makeQuery());

      expect(result[0].sectionTitle).toBe("Getting Started");
      expect(result[0].sectionNumber).toBeDefined();
    });

    it("preserves docId and docTitle from matches", async () => {
      const matches = [makeMatch({ docId: "my-doc", docTitle: "My Document" })];
      const result = await extractor.extractRelevantSections(matches, makeQuery());

      expect(result[0].docId).toBe("my-doc");
      expect(result[0].docTitle).toBe("My Document");
    });
  });

  describe("highlightAnswers", () => {
    it("returns a HighlightedSection with highlights", () => {
      const section = makeSection({
        content: "Lambda is a serverless service. It handles scaling automatically.",
      });
      const query = makeQuery({ keywords: ["lambda", "serverless"] });
      const result = extractor.highlightAnswers(section, query);

      expect(result.section).toBe(section);
      expect(result.highlights.length).toBeGreaterThan(0);
    });

    it("returns empty highlights when content does not match query", () => {
      const section = makeSection({ content: "This is about databases only." });
      const query = makeQuery({
        keywords: ["lambda", "serverless"],
        awsServices: [],
        concepts: [],
      });
      const result = extractor.highlightAnswers(section, query);

      expect(result.section).toBe(section);
      expect(result.highlights.length).toBe(0);
    });

    it("highlight text is a substring of section content", () => {
      const section = makeSection({
        content: "Lambda is serverless. S3 is storage. Lambda scales well.",
      });
      const query = makeQuery({ keywords: ["lambda", "serverless"] });
      const result = extractor.highlightAnswers(section, query);

      for (const h of result.highlights) {
        expect(section.content).toContain(h.text);
      }
    });

    it("highlight ranges are valid indices", () => {
      const section = makeSection();
      const query = makeQuery();
      const result = extractor.highlightAnswers(section, query);

      for (const h of result.highlights) {
        expect(h.startIndex).toBeGreaterThanOrEqual(0);
        expect(h.endIndex).toBeLessThanOrEqual(section.content.length);
        expect(h.endIndex).toBeGreaterThan(h.startIndex);
      }
    });
  });
});

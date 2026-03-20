import { describe, it, expect } from "vitest";
import {
  extractMarkdownSections,
  extractKeywords,
  cosineSimilarity,
  generateMockEmbedding,
  computeKeywordScore,
  formatToMimeType,
  parseDocument,
  OFFICIAL_AWS_DOCS,
} from "./documentIndexer";
import { DocumentFormat } from "@aws-intel/shared";

describe("extractMarkdownSections", () => {
  it("extracts sections from markdown with headings", () => {
    const text = `# Title\nIntro text\n## Section One\nContent one\n## Section Two\nContent two`;
    const sections = extractMarkdownSections(text);

    expect(sections.length).toBe(3);
    expect(sections[0].sectionTitle).toBe("Title");
    expect(sections[1].sectionTitle).toBe("Section One");
    expect(sections[2].sectionTitle).toBe("Section Two");
  });

  it("returns single section for text without headings", () => {
    const text = "Just plain text without any headings.";
    const sections = extractMarkdownSections(text);

    expect(sections.length).toBe(1);
    expect(sections[0].sectionTitle).toBe("Content");
    expect(sections[0].content).toBe(text);
  });

  it("tracks parent sections for nested headings", () => {
    const text = `# Top\nTop content\n## Sub\nSub content\n### Deep\nDeep content`;
    const sections = extractMarkdownSections(text);

    const deepSection = sections.find((s) => s.sectionTitle === "Deep");
    expect(deepSection).toBeDefined();
    expect(deepSection!.parentSections.length).toBeGreaterThan(0);
    expect(deepSection!.level).toBe(3);
  });

  it("assigns section numbers correctly", () => {
    const text = `# A\ncontent\n## B\ncontent\n## C\ncontent`;
    const sections = extractMarkdownSections(text);

    expect(sections[0].sectionNumber).toBe("1");
    expect(sections[1].sectionNumber).toBe("1.1");
    expect(sections[2].sectionNumber).toBe("1.2");
  });

  it("returns empty array for empty text", () => {
    const sections = extractMarkdownSections("");
    expect(sections.length).toBe(0);
  });
});

describe("extractKeywords", () => {
  it("extracts meaningful keywords from text", () => {
    const keywords = extractKeywords(
      "AWS Lambda function deployment configuration"
    );
    expect(keywords).toContain("aws");
    expect(keywords).toContain("lambda");
    expect(keywords).toContain("function");
  });

  it("filters out stop words", () => {
    const keywords = extractKeywords("the quick brown fox is a very fast animal");
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("is");
    expect(keywords).not.toContain("a");
    expect(keywords).not.toContain("very");
  });

  it("returns empty array for empty text", () => {
    const keywords = extractKeywords("");
    expect(keywords.length).toBe(0);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("generateMockEmbedding", () => {
  it("generates deterministic embeddings for same input", () => {
    const a = generateMockEmbedding("test");
    const b = generateMockEmbedding("test");
    expect(a).toEqual(b);
  });

  it("generates different embeddings for different inputs", () => {
    const a = generateMockEmbedding("hello");
    const b = generateMockEmbedding("world");
    expect(a).not.toEqual(b);
  });

  it("generates embeddings of correct dimension", () => {
    const embedding = generateMockEmbedding("test");
    expect(embedding.length).toBe(256);
  });
});

describe("computeKeywordScore", () => {
  it("returns 1 when all query keywords match", () => {
    expect(computeKeywordScore(["aws", "lambda"], ["aws", "lambda", "s3"])).toBe(1);
  });

  it("returns 0 when no keywords match", () => {
    expect(computeKeywordScore(["aws"], ["python", "java"])).toBe(0);
  });

  it("returns partial score for partial matches", () => {
    expect(computeKeywordScore(["aws", "lambda"], ["aws", "s3"])).toBe(0.5);
  });

  it("returns 0 for empty inputs", () => {
    expect(computeKeywordScore([], ["aws"])).toBe(0);
    expect(computeKeywordScore(["aws"], [])).toBe(0);
  });
});

describe("formatToMimeType", () => {
  it("maps PDF format correctly", () => {
    expect(formatToMimeType(DocumentFormat.PDF)).toBe("application/pdf");
  });

  it("maps HTML format correctly", () => {
    expect(formatToMimeType(DocumentFormat.HTML)).toBe("text/html");
  });

  it("maps Markdown format correctly", () => {
    expect(formatToMimeType(DocumentFormat.MARKDOWN)).toBe("text/markdown");
  });

  it("maps Text format correctly", () => {
    expect(formatToMimeType(DocumentFormat.TEXT)).toBe("text/plain");
  });
});

describe("parseDocument", () => {
  it("parses plain text documents", async () => {
    const content = Buffer.from("Hello world");
    const result = await parseDocument(content, DocumentFormat.TEXT);
    expect(result).toBe("Hello world");
  });

  it("parses HTML documents and strips tags", async () => {
    const html = "<html><body><h1>Title</h1><p>Content</p></body></html>";
    const content = Buffer.from(html);
    const result = await parseDocument(content, DocumentFormat.HTML);
    expect(result).toContain("Title");
    expect(result).toContain("Content");
    expect(result).not.toContain("<h1>");
  });

  it("parses Markdown documents", async () => {
    const md = "# Heading\n\nSome paragraph text.";
    const content = Buffer.from(md);
    const result = await parseDocument(content, DocumentFormat.MARKDOWN);
    expect(result).toContain("Heading");
    expect(result).toContain("Some paragraph text.");
  });

  it("strips script and style tags from HTML", async () => {
    const html =
      "<html><body><script>alert('x')</script><style>.a{}</style><p>Safe</p></body></html>";
    const content = Buffer.from(html);
    const result = await parseDocument(content, DocumentFormat.HTML);
    expect(result).toContain("Safe");
    expect(result).not.toContain("alert");
    expect(result).not.toContain(".a{}");
  });
});

describe("OFFICIAL_AWS_DOCS", () => {
  it("is empty until real AWS documentation integration is implemented", () => {
    // OFFICIAL_AWS_DOCS is empty - real docs will be fetched via API integration
    expect(OFFICIAL_AWS_DOCS).toHaveLength(0);
  });

  it("each entry has name, category, and url", () => {
    for (const doc of OFFICIAL_AWS_DOCS) {
      expect(doc.name).toBeTruthy();
      expect(doc.category).toBeTruthy();
      expect(doc.url).toBeTruthy();
    }
  });
});

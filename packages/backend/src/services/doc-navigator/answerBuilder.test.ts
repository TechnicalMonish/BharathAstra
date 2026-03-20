import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AnswerBuilder,
  generateMockDirectAnswer,
  formatHowToAnswer,
  buildSourceReference,
  determineAnswerType,
  extractCodeExamples,
  identifyConfigurableParams,
  suggestRelatedSections,
  extractPrerequisites,
  MAX_RELATED_SECTIONS,
} from "./answerBuilder";
import {
  AnswerType,
  QueryType,
  RelationType,
  type HighlightedSection,
  type ProcessedQuery,
  type ExtractedSection,
} from "@aws-intel/shared";

// --- Helpers ---

function makeSection(overrides: Partial<ExtractedSection> = {}): ExtractedSection {
  return {
    docId: "doc-1",
    docTitle: "Test Doc",
    sectionId: "sec-0",
    sectionNumber: "1.1",
    sectionTitle: "Getting Started",
    content: "AWS Lambda is a serverless compute service. It runs your code without provisioning servers.",
    relevanceScore: 0.8,
    parentSections: [],
    ...overrides,
  };
}

function makeHighlightedSection(
  sectionOverrides: Partial<ExtractedSection> = {},
  highlights: HighlightedSection["highlights"] = []
): HighlightedSection {
  return {
    section: makeSection(sectionOverrides),
    highlights:
      highlights.length > 0
        ? highlights
        : [
            {
              text: "AWS Lambda is a serverless compute service.",
              startIndex: 0,
              endIndex: 44,
              relevanceScore: 0.9,
            },
          ],
  };
}

function makeQuery(overrides: Partial<ProcessedQuery> = {}): ProcessedQuery {
  return {
    originalQuestion: "What is AWS Lambda?",
    normalizedQuestion: "lambda",
    awsServices: ["Lambda"],
    concepts: ["serverless"],
    queryType: QueryType.WHAT_IS,
    keywords: ["lambda", "serverless"],
    ...overrides,
  };
}

// --- Tests ---

describe("generateMockDirectAnswer", () => {
  it("returns undefined for empty sections", () => {
    expect(generateMockDirectAnswer([], makeQuery())).toBeUndefined();
  });

  it("builds answer from highlights when available", () => {
    const hs = makeHighlightedSection();
    const answer = generateMockDirectAnswer([hs], makeQuery());
    expect(answer).toBeDefined();
    expect(answer!.length).toBeGreaterThan(0);
  });

  it("falls back to section content when no highlights", () => {
    const hs = makeHighlightedSection({}, []);
    const answer = generateMockDirectAnswer([hs], makeQuery());
    expect(answer).toBeDefined();
    expect(answer!).toContain("Lambda");
  });

  it("returns undefined when section content is empty and no highlights", () => {
    const hs: HighlightedSection = {
      section: makeSection({ content: "" }),
      highlights: [],
    };
    const answer = generateMockDirectAnswer([hs], makeQuery());
    expect(answer).toBeUndefined();
  });
});

describe("formatHowToAnswer", () => {
  it("returns undefined for empty sections", () => {
    expect(formatHowToAnswer([], makeQuery())).toBeUndefined();
  });

  it("formats highlights as numbered steps", () => {
    const hs = makeHighlightedSection({}, [
      { text: "Create an IAM role.", startIndex: 0, endIndex: 19, relevanceScore: 0.9 },
      { text: "Attach the policy.", startIndex: 20, endIndex: 38, relevanceScore: 0.8 },
    ]);
    const result = formatHowToAnswer([hs], makeQuery({ queryType: QueryType.HOW_TO }));
    expect(result).toContain("1.");
    expect(result).toContain("2.");
    expect(result).toContain("Create an IAM role.");
  });

  it("returns undefined when no highlights exist", () => {
    const hs: HighlightedSection = {
      section: makeSection({ content: "No relevant highlights here." }),
      highlights: [],
    };
    expect(formatHowToAnswer([hs], makeQuery())).toBeUndefined();
  });

  it("limits steps to 5", () => {
    const highlights = Array.from({ length: 8 }, (_, i) => ({
      text: `Step ${i + 1}.`,
      startIndex: i * 10,
      endIndex: i * 10 + 8,
      relevanceScore: 0.9 - i * 0.05,
    }));
    const hs = makeHighlightedSection({}, highlights);
    const result = formatHowToAnswer([hs], makeQuery())!;
    const lines = result.split("\n");
    expect(lines.length).toBeLessThanOrEqual(5);
  });
});

describe("buildSourceReference", () => {
  it("returns section number and title", () => {
    const hs = makeHighlightedSection({ sectionNumber: "2.3", sectionTitle: "Configuration" });
    const ref = buildSourceReference(hs);
    expect(ref.sectionNumber).toBe("2.3");
    expect(ref.title).toBe("Configuration");
  });
});

describe("determineAnswerType", () => {
  it("returns MULTI_STEP for HOW_TO queries", () => {
    const query = makeQuery({ queryType: QueryType.HOW_TO });
    const hs = [makeHighlightedSection()];
    expect(determineAnswerType(query, hs, "some answer")).toBe(AnswerType.MULTI_STEP);
  });

  it("returns REFERENCE when no sections", () => {
    expect(determineAnswerType(makeQuery(), [], "answer")).toBe(AnswerType.REFERENCE);
  });

  it("returns REFERENCE when no direct answer", () => {
    const hs = [makeHighlightedSection()];
    expect(determineAnswerType(makeQuery(), hs, undefined)).toBe(AnswerType.REFERENCE);
  });

  it("returns DIRECT for WHAT_IS with direct answer", () => {
    const query = makeQuery({ queryType: QueryType.WHAT_IS });
    const hs = [makeHighlightedSection()];
    expect(determineAnswerType(query, hs, "Lambda is...")).toBe(AnswerType.DIRECT);
  });

  it("returns AMBIGUOUS for COMPARISON queries", () => {
    const query = makeQuery({ queryType: QueryType.COMPARISON });
    const hs = [makeHighlightedSection()];
    expect(determineAnswerType(query, hs, "answer")).toBe(AnswerType.AMBIGUOUS);
  });
});

describe("extractCodeExamples", () => {
  it("returns empty array when no code blocks", () => {
    const hs = [makeHighlightedSection({ content: "No code here." })];
    expect(extractCodeExamples(hs)).toEqual([]);
  });

  it("extracts code blocks with language", () => {
    const content = "Some text\n```python\nprint('hello')\n```\nMore text";
    const hs = [makeHighlightedSection({ content })];
    const examples = extractCodeExamples(hs);
    expect(examples.length).toBe(1);
    expect(examples[0].language).toBe("python");
    expect(examples[0].code).toBe("print('hello')");
  });

  it("includes source section reference", () => {
    const content = "```javascript\nconsole.log('hi')\n```";
    const hs = [makeHighlightedSection({ content, sectionTitle: "My Section", sectionNumber: "3.1" })];
    const examples = extractCodeExamples(hs);
    expect(examples[0].sourceSection.title).toBe("My Section");
    expect(examples[0].sourceSection.sectionNumber).toBe("3.1");
  });
});

describe("identifyConfigurableParams", () => {
  it("finds angle-bracket placeholders", () => {
    const params = identifyConfigurableParams("aws s3 cp file.txt s3://<BUCKET_NAME>/");
    expect(params.length).toBe(1);
    expect(params[0].name).toBe("BUCKET_NAME");
  });

  it("finds ${VAR} placeholders", () => {
    const params = identifyConfigurableParams("echo ${REGION}");
    expect(params.length).toBe(1);
    expect(params[0].name).toBe("REGION");
  });

  it("finds YOUR_ prefixed placeholders", () => {
    const params = identifyConfigurableParams("--role YOUR_ROLE_ARN");
    expect(params.length).toBe(1);
    expect(params[0].name).toBe("YOUR_ROLE_ARN");
  });

  it("deduplicates params", () => {
    const params = identifyConfigurableParams("<BUCKET_NAME> <BUCKET_NAME>");
    expect(params.length).toBe(1);
  });

  it("returns empty for no placeholders", () => {
    expect(identifyConfigurableParams("const x = 1;")).toEqual([]);
  });
});

describe("suggestRelatedSections", () => {
  it("returns empty for empty sections", () => {
    expect(suggestRelatedSections([], makeQuery())).toEqual([]);
  });

  it("uses parent sections as prerequisites", () => {
    const hs = makeHighlightedSection({
      parentSections: [{ sectionNumber: "1", title: "Overview" }],
    });
    const related = suggestRelatedSections([hs], makeQuery());
    expect(related.some((r) => r.relationshipType === RelationType.PREREQUISITE)).toBe(true);
  });

  it("adds next-step from lower-ranked sections", () => {
    const sections = [
      makeHighlightedSection({ sectionId: "sec-0" }),
      makeHighlightedSection({ sectionId: "sec-1", sectionTitle: "Advanced Config" }),
    ];
    const related = suggestRelatedSections(sections, makeQuery());
    expect(related.some((r) => r.relationshipType === RelationType.NEXT_STEP)).toBe(true);
  });

  it("limits to MAX_RELATED_SECTIONS", () => {
    const sections = Array.from({ length: 10 }, (_, i) =>
      makeHighlightedSection({
        sectionId: `sec-${i}`,
        parentSections: [{ sectionNumber: `${i}`, title: `Parent ${i}` }],
      })
    );
    const related = suggestRelatedSections(sections, makeQuery());
    expect(related.length).toBeLessThanOrEqual(MAX_RELATED_SECTIONS);
  });
});

describe("extractPrerequisites", () => {
  it("derives prerequisites from query AWS services", () => {
    const query = makeQuery({ awsServices: ["Lambda", "S3"] });
    const prereqs = extractPrerequisites([makeHighlightedSection()], query);
    expect(prereqs.some((p) => p.concept === "Lambda")).toBe(true);
    expect(prereqs.some((p) => p.concept === "S3")).toBe(true);
  });

  it("derives prerequisites from parent sections", () => {
    const hs = makeHighlightedSection({
      parentSections: [{ sectionNumber: "1", title: "IAM Basics" }],
    });
    const prereqs = extractPrerequisites([hs], makeQuery({ awsServices: [] }));
    expect(prereqs.some((p) => p.concept === "IAM Basics")).toBe(true);
    expect(prereqs[0].learnMoreSection).toBeDefined();
  });

  it("returns empty when no services or parents", () => {
    const hs = makeHighlightedSection({ parentSections: [] });
    const prereqs = extractPrerequisites([hs], makeQuery({ awsServices: [] }));
    expect(prereqs).toEqual([]);
  });
});

describe("AnswerBuilder", () => {
  let builder: AnswerBuilder;

  beforeEach(() => {
    builder = new AnswerBuilder();
  });

  it("builds an answer with direct answer for WHAT_IS query", async () => {
    const sections = [makeHighlightedSection()];
    const query = makeQuery({ queryType: QueryType.WHAT_IS });
    const answer = await builder.buildAnswer(sections, query);

    expect(answer.directAnswer).toBeDefined();
    expect(answer.answerType).toBe(AnswerType.DIRECT);
    expect(answer.sections).toBe(sections);
  });

  it("builds a MULTI_STEP answer for HOW_TO query", async () => {
    const sections = [
      makeHighlightedSection({}, [
        { text: "Create a function.", startIndex: 0, endIndex: 18, relevanceScore: 0.9 },
        { text: "Deploy the function.", startIndex: 19, endIndex: 39, relevanceScore: 0.8 },
      ]),
    ];
    const query = makeQuery({ queryType: QueryType.HOW_TO, originalQuestion: "How do I create a Lambda?" });
    const answer = await builder.buildAnswer(sections, query);

    expect(answer.answerType).toBe(AnswerType.MULTI_STEP);
    expect(answer.directAnswer).toContain("1.");
  });

  it("falls back to REFERENCE when no sections provided", async () => {
    const answer = await builder.buildAnswer([], makeQuery());
    expect(answer.answerType).toBe(AnswerType.REFERENCE);
    expect(answer.directAnswer).toBeUndefined();
  });

  it("includes source reference in direct answer", async () => {
    const sections = [makeHighlightedSection({ sectionTitle: "Overview", sectionNumber: "1.1" })];
    const answer = await builder.buildAnswer(sections, makeQuery());
    expect(answer.directAnswer).toContain("Source:");
    expect(answer.directAnswer).toContain("Overview");
  });

  it("includes related sections", async () => {
    const sections = [
      makeHighlightedSection({ sectionId: "sec-0" }),
      makeHighlightedSection({ sectionId: "sec-1", sectionTitle: "Next Topic" }),
    ];
    const answer = await builder.buildAnswer(sections, makeQuery());
    expect(answer.relatedSections.length).toBeGreaterThan(0);
  });

  it("includes prerequisites from query services", async () => {
    const sections = [makeHighlightedSection()];
    const query = makeQuery({ awsServices: ["Lambda", "IAM"] });
    const answer = await builder.buildAnswer(sections, query);
    expect(answer.prerequisites.length).toBeGreaterThan(0);
  });

  it("extracts code examples from sections", async () => {
    const content = "Example:\n```python\nimport boto3\n```\nDone.";
    const sections = [makeHighlightedSection({ content })];
    const answer = await builder.buildAnswer(sections, makeQuery());
    expect(answer.codeExamples.length).toBe(1);
    expect(answer.codeExamples[0].language).toBe("python");
  });
});

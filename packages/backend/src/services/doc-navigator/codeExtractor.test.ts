import { describe, it, expect, beforeEach } from "vitest";
import {
  CodeExtractor,
  isRunnableExample,
  computeCodeRelevance,
  extractDescription,
  identifyConfigurableParams,
  extractInlineCodeSnippets,
  extractFencedCodeBlocks,
  MAX_CODE_EXAMPLES,
} from "./codeExtractor";
import { QueryType, type ExtractedSection, type ProcessedQuery } from "@aws-intel/shared";

// --- Helpers ---

function makeSection(overrides: Partial<ExtractedSection> = {}): ExtractedSection {
  return {
    docId: "doc-1",
    docTitle: "Test Doc",
    sectionId: "sec-0",
    sectionNumber: "1.1",
    sectionTitle: "Getting Started",
    content: "Some documentation content.",
    relevanceScore: 0.8,
    parentSections: [],
    ...overrides,
  };
}

function makeQuery(overrides: Partial<ProcessedQuery> = {}): ProcessedQuery {
  return {
    originalQuestion: "How do I use S3?",
    normalizedQuestion: "use s3",
    awsServices: ["S3"],
    concepts: ["storage"],
    queryType: QueryType.HOW_TO,
    keywords: ["s3", "bucket", "upload"],
    ...overrides,
  };
}

// --- isRunnableExample ---

describe("isRunnableExample", () => {
  it("returns false for empty code", () => {
    expect(isRunnableExample("", "python")).toBe(false);
    expect(isRunnableExample("   ", "javascript")).toBe(false);
  });

  it("detects runnable Python examples", () => {
    expect(isRunnableExample("import boto3\ns3 = boto3.client('s3')", "python")).toBe(true);
    expect(isRunnableExample("def handler(event, context):\n  return 200", "python")).toBe(true);
  });

  it("detects runnable JavaScript examples", () => {
    expect(isRunnableExample("const AWS = require('aws-sdk')", "javascript")).toBe(true);
    expect(isRunnableExample("import { S3 } from '@aws-sdk/client-s3'", "typescript")).toBe(true);
  });

  it("detects runnable bash examples", () => {
    expect(isRunnableExample("aws s3 cp file.txt s3://bucket/", "bash")).toBe(true);
  });

  it("considers multi-line code as runnable for unknown languages", () => {
    expect(isRunnableExample("line1\nline2", "ruby")).toBe(true);
    expect(isRunnableExample("single-line", "ruby")).toBe(false);
  });
});

// --- computeCodeRelevance ---

describe("computeCodeRelevance", () => {
  it("returns 0.5 when query has no terms", () => {
    const query = makeQuery({ keywords: [], awsServices: [], concepts: [] });
    expect(computeCodeRelevance("some code", "desc", query)).toBe(0.5);
  });

  it("returns higher score when code matches query terms", () => {
    const query = makeQuery({ keywords: ["s3", "bucket"], awsServices: ["S3"], concepts: [] });
    const high = computeCodeRelevance("s3.createBucket('my-bucket')", "S3 bucket creation", query);
    const low = computeCodeRelevance("console.log('hello')", "logging", query);
    expect(high).toBeGreaterThan(low);
  });
});

// --- extractDescription ---

describe("extractDescription", () => {
  it("extracts description from text before code block", () => {
    const content = "Here is how to create a bucket:\n```python\nimport boto3\n```";
    const codeStart = content.indexOf("```");
    const desc = extractDescription(content, codeStart, "Section");
    expect(desc).toBe("Here is how to create a bucket:");
  });

  it("falls back to section title when no suitable text before", () => {
    const content = "```python\nimport boto3\n```";
    const desc = extractDescription(content, 0, "My Section");
    expect(desc).toBe("Code example from My Section");
  });

  it("falls back when preceding text is too short", () => {
    const content = "Hi\n```python\ncode\n```";
    const codeStart = content.indexOf("```");
    const desc = extractDescription(content, codeStart, "Fallback");
    expect(desc).toBe("Code example from Fallback");
  });
});

// --- identifyConfigurableParams ---

describe("identifyConfigurableParams", () => {
  it("finds angle-bracket placeholders", () => {
    const params = identifyConfigurableParams("aws s3 cp file s3://<BUCKET_NAME>/", "bash");
    expect(params.some((p) => p.name === "BUCKET_NAME")).toBe(true);
  });

  it("finds ${VAR} placeholders", () => {
    const params = identifyConfigurableParams("region=${AWS_REGION}", "bash");
    expect(params.some((p) => p.name === "AWS_REGION")).toBe(true);
  });

  it("finds YOUR_ prefixed placeholders", () => {
    const params = identifyConfigurableParams("--role YOUR_ROLE_ARN", "bash");
    expect(params.some((p) => p.name === "YOUR_ROLE_ARN")).toBe(true);
  });

  it("finds bash environment variables", () => {
    const params = identifyConfigurableParams("echo $AWS_REGION", "bash");
    expect(params.some((p) => p.name === "AWS_REGION")).toBe(true);
  });

  it("does not extract bare $VAR for non-shell languages", () => {
    const params = identifyConfigurableParams("echo $AWS_REGION", "python");
    // Only ${} and <> patterns should match for non-shell
    expect(params.every((p) => p.name !== "AWS_REGION")).toBe(true);
  });

  it("finds dash-style placeholders", () => {
    const params = identifyConfigurableParams("s3://my-bucket-name/path", "bash");
    expect(params.some((p) => p.name === "my-bucket-name")).toBe(true);
  });

  it("deduplicates parameters", () => {
    const params = identifyConfigurableParams("<BUCKET> <BUCKET>", "text");
    expect(params.filter((p) => p.name === "BUCKET").length).toBe(1);
  });

  it("returns empty for code with no placeholders", () => {
    expect(identifyConfigurableParams("const x = 1;", "javascript")).toEqual([]);
  });
});

// --- extractInlineCodeSnippets ---

describe("extractInlineCodeSnippets", () => {
  it("extracts inline config snippets with = sign", () => {
    const content = "Set `AWS_REGION=us-east-1` in your environment.";
    const snippets = extractInlineCodeSnippets(content);
    expect(snippets.length).toBe(1);
    expect(snippets[0].code).toBe("AWS_REGION=us-east-1");
  });

  it("extracts inline aws CLI commands", () => {
    const content = "Run `aws s3 ls s3://bucket` to list objects.";
    const snippets = extractInlineCodeSnippets(content);
    expect(snippets.length).toBe(1);
    expect(snippets[0].code).toContain("aws s3 ls");
  });

  it("ignores short inline code", () => {
    const content = "Use `s3` for storage.";
    const snippets = extractInlineCodeSnippets(content);
    expect(snippets.length).toBe(0);
  });

  it("ignores non-config inline code", () => {
    const content = "The `Lambda` function handles events.";
    const snippets = extractInlineCodeSnippets(content);
    expect(snippets.length).toBe(0);
  });
});

// --- extractFencedCodeBlocks ---

describe("extractFencedCodeBlocks", () => {
  it("extracts fenced code blocks with language", () => {
    const section = makeSection({
      content: "Example:\n```python\nimport boto3\n```\nDone.",
    });
    const blocks = extractFencedCodeBlocks(section, makeQuery());
    expect(blocks.length).toBe(1);
    expect(blocks[0].language).toBe("python");
    expect(blocks[0].code).toBe("import boto3");
  });

  it("defaults to 'text' when no language specified", () => {
    const section = makeSection({
      content: "```\nsome output\n```",
    });
    const blocks = extractFencedCodeBlocks(section, makeQuery());
    expect(blocks.length).toBe(1);
    expect(blocks[0].language).toBe("text");
  });

  it("skips empty code blocks", () => {
    const section = makeSection({ content: "```python\n\n```" });
    const blocks = extractFencedCodeBlocks(section, makeQuery());
    expect(blocks.length).toBe(0);
  });

  it("attaches source section reference", () => {
    const section = makeSection({
      content: "```bash\naws s3 ls\n```",
      sectionNumber: "2.1",
      sectionTitle: "CLI Examples",
    });
    const blocks = extractFencedCodeBlocks(section, makeQuery());
    expect(blocks[0].sourceSection.sectionNumber).toBe("2.1");
    expect(blocks[0].sourceSection.title).toBe("CLI Examples");
  });

  it("extracts multiple code blocks from one section", () => {
    const section = makeSection({
      content: "```python\nprint('a')\n```\nText\n```javascript\nconsole.log('b')\n```",
    });
    const blocks = extractFencedCodeBlocks(section, makeQuery());
    expect(blocks.length).toBe(2);
  });
});

// --- CodeExtractor class ---

describe("CodeExtractor", () => {
  let extractor: CodeExtractor;

  beforeEach(() => {
    extractor = new CodeExtractor();
  });

  describe("extractCodeExamples", () => {
    it("returns empty array for sections with no code", () => {
      const sections = [makeSection({ content: "No code here." })];
      expect(extractor.extractCodeExamples(sections, makeQuery())).toEqual([]);
    });

    it("extracts fenced code blocks from sections", () => {
      const sections = [
        makeSection({
          content: "Example:\n```python\nimport boto3\ns3 = boto3.client('s3')\n```",
        }),
      ];
      const examples = extractor.extractCodeExamples(sections, makeQuery());
      expect(examples.length).toBeGreaterThanOrEqual(1);
      const pythonExample = examples.find((e) => e.language === "python");
      expect(pythonExample).toBeDefined();
      expect(pythonExample!.code).toContain("boto3");
    });

    it("extracts from multiple sections", () => {
      const sections = [
        makeSection({ content: "```python\nprint('a')\nprint('b')\n```", sectionId: "s1" }),
        makeSection({ content: "```bash\naws s3 ls\n```", sectionId: "s2" }),
      ];
      const examples = extractor.extractCodeExamples(sections, makeQuery());
      expect(examples.length).toBe(2);
    });

    it("prioritizes runnable examples over non-runnable", () => {
      const sections = [
        makeSection({
          content:
            "```text\noutput\n```\n```python\nimport boto3\ns3 = boto3.client('s3')\ns3.list_buckets()\n```",
        }),
      ];
      const examples = extractor.extractCodeExamples(sections, makeQuery());
      // The python example should come first (runnable)
      expect(examples[0].language).toBe("python");
    });

    it("limits results to MAX_CODE_EXAMPLES", () => {
      const codeBlocks = Array.from(
        { length: 15 },
        (_, i) => `\`\`\`python\nprint(${i})\nprint('extra')\n\`\`\``
      ).join("\n");
      const sections = [makeSection({ content: codeBlocks })];
      const examples = extractor.extractCodeExamples(sections, makeQuery());
      expect(examples.length).toBeLessThanOrEqual(MAX_CODE_EXAMPLES);
    });

    it("includes inline config snippets", () => {
      const sections = [
        makeSection({
          content: "Set `AWS_REGION=us-east-1` in your env. Also run `aws s3 ls s3://bucket`.",
        }),
      ];
      const examples = extractor.extractCodeExamples(sections, makeQuery());
      expect(examples.length).toBeGreaterThan(0);
    });

    it("attaches source section info to inline snippets", () => {
      const sections = [
        makeSection({
          content: "Use `--region us-east-1` flag.",
          sectionNumber: "3.2",
          sectionTitle: "Config",
        }),
      ];
      const examples = extractor.extractCodeExamples(sections, makeQuery());
      if (examples.length > 0) {
        expect(examples[0].sourceSection.sectionNumber).toBe("3.2");
        expect(examples[0].sourceSection.title).toBe("Config");
      }
    });
  });

  describe("identifyConfigurableParams", () => {
    it("delegates to the helper function", () => {
      const params = extractor.identifyConfigurableParams(
        "aws s3 cp file s3://<BUCKET_NAME>/",
        "bash"
      );
      expect(params.some((p) => p.name === "BUCKET_NAME")).toBe(true);
    });

    it("detects shell env vars for bash language", () => {
      const params = extractor.identifyConfigurableParams("echo $MY_VAR", "bash");
      expect(params.some((p) => p.name === "MY_VAR")).toBe(true);
    });
  });
});

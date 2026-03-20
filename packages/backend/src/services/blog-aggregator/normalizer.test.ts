import { describe, it, expect } from "vitest";
import {
  Normalizer,
  truncateToWords,
  isValidUrl,
  normalizeDate,
  estimateReadTime,
  detectCodeExamples,
  detectDiagrams,
  detectStepByStep,
  detectAwsServices,
  detectTechStack,
  detectDifficulty,
  extractCredentials,
  MAX_CONTENT_WORDS,
} from "./normalizer";
import {
  ContentSource,
  DifficultyLevel,
  AuthorityLevel,
  type ContentItem,
  type SourceResult,
} from "@aws-intel/shared";

// --- Helper to build a minimal valid ContentItem ---

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "test-1",
    source: ContentSource.AWS_BLOG,
    title: "Test Article",
    url: "https://example.com/article",
    author: {
      name: "Test Author",
      credentials: [],
      authorityLevel: AuthorityLevel.UNKNOWN,
    },
    publishDate: new Date("2024-06-15"),
    content: "This is a test article about AWS Lambda and S3.",
    metadata: {
      hasCodeExamples: false,
      hasDiagrams: false,
      hasStepByStep: false,
      estimatedReadTime: 5,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      techStack: [],
      awsServices: [],
    },
    ...overrides,
  };
}

function makeSourceResult(items: ContentItem[], source = ContentSource.AWS_BLOG): SourceResult {
  return { source, items, retrievalTime: 100 };
}

// --- Helper tests ---

describe("truncateToWords", () => {
  it("should return text unchanged if under limit", () => {
    expect(truncateToWords("hello world", 10)).toBe("hello world");
  });

  it("should truncate to the specified word count", () => {
    const text = "one two three four five six";
    expect(truncateToWords(text, 3)).toBe("one two three");
  });

  it("should handle empty string", () => {
    expect(truncateToWords("", 500)).toBe("");
  });
});

describe("isValidUrl", () => {
  it("should accept valid https URLs", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
  });

  it("should accept valid http URLs", () => {
    expect(isValidUrl("http://example.com/path")).toBe(true);
  });

  it("should reject invalid URLs", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("")).toBe(false);
  });
});

describe("normalizeDate", () => {
  it("should return a Date object for valid Date input", () => {
    const d = new Date("2024-01-15");
    expect(normalizeDate(d)).toEqual(d);
  });

  it("should parse a valid date string", () => {
    const result = normalizeDate("2024-03-20");
    expect(result.toISOString()).toContain("2024-03-20");
  });

  it("should return current date for invalid input", () => {
    const before = Date.now();
    const result = normalizeDate("not-a-date");
    expect(result.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe("estimateReadTime", () => {
  it("should return at least 1 minute", () => {
    expect(estimateReadTime("short")).toBe(1);
  });

  it("should estimate based on 200 wpm", () => {
    const words = Array(400).fill("word").join(" ");
    expect(estimateReadTime(words)).toBe(2);
  });
});

describe("detectCodeExamples", () => {
  it("should detect fenced code blocks", () => {
    expect(detectCodeExamples("```js\nconsole.log('hi')\n```")).toBe(true);
  });

  it("should detect function declarations", () => {
    expect(detectCodeExamples("function handler() {}")).toBe(true);
  });

  it("should return false for plain text", () => {
    expect(detectCodeExamples("This is a plain paragraph.")).toBe(false);
  });
});

describe("detectDiagrams", () => {
  it("should detect markdown images", () => {
    expect(detectDiagrams("![arch](diagram.png)")).toBe(true);
  });

  it("should detect diagram keyword", () => {
    expect(detectDiagrams("See the architecture diagram below")).toBe(true);
  });

  it("should return false for plain text", () => {
    expect(detectDiagrams("No visuals here")).toBe(false);
  });
});

describe("detectStepByStep", () => {
  it("should detect numbered steps", () => {
    expect(detectStepByStep("1. First do this\n2. Then do that")).toBe(true);
  });

  it("should detect step keyword", () => {
    expect(detectStepByStep("Step 1: Configure the bucket")).toBe(true);
  });

  it("should return false for plain text", () => {
    expect(detectStepByStep("A general overview of the topic")).toBe(false);
  });
});

describe("detectAwsServices", () => {
  it("should detect Lambda and S3", () => {
    const services = detectAwsServices("Deploy with Lambda and store in S3");
    expect(services).toContain("Lambda");
    expect(services).toContain("S3");
  });

  it("should return empty for no services", () => {
    expect(detectAwsServices("Hello world")).toEqual([]);
  });
});

describe("detectTechStack", () => {
  it("should detect TypeScript and React", () => {
    const stack = detectTechStack("Built with TypeScript and React");
    expect(stack).toContain("TypeScript");
    expect(stack).toContain("React");
  });

  it("should return empty for no tech", () => {
    expect(detectTechStack("A general article")).toEqual([]);
  });
});

describe("detectDifficulty", () => {
  it("should detect beginner content", () => {
    expect(detectDifficulty("Getting started with AWS - a beginner tutorial")).toBe(DifficultyLevel.BEGINNER);
  });

  it("should detect advanced content", () => {
    expect(detectDifficulty("Advanced deep dive into distributed microservices at scale")).toBe(DifficultyLevel.ADVANCED);
  });

  it("should default to intermediate", () => {
    expect(detectDifficulty("Using AWS services effectively")).toBe(DifficultyLevel.INTERMEDIATE);
  });
});

describe("extractCredentials", () => {
  it("should detect AWS Hero", () => {
    const result = extractCredentials("John Doe", "AWS Hero and community leader");
    expect(result.authorityLevel).toBe(AuthorityLevel.AWS_HERO);
    expect(result.credentials.length).toBeGreaterThan(0);
  });

  it("should detect AWS Employee", () => {
    const result = extractCredentials("Jane AWS Employee", "");
    expect(result.authorityLevel).toBe(AuthorityLevel.AWS_EMPLOYEE);
  });

  it("should default to community member", () => {
    const result = extractCredentials("Random Dev", "");
    expect(result.authorityLevel).toBe(AuthorityLevel.COMMUNITY_MEMBER);
  });
});

// --- Normalizer class tests ---

describe("Normalizer", () => {
  const normalizer = new Normalizer();

  describe("normalize", () => {
    it("should return normalized items from a source result", () => {
      const items = [makeItem()];
      const result = normalizer.normalize(makeSourceResult(items));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("test-1");
      expect(result[0].source).toBe(ContentSource.AWS_BLOG);
    });

    it("should filter out items with invalid URLs", () => {
      const items = [
        makeItem({ url: "not-a-url" }),
        makeItem({ id: "valid", url: "https://example.com" }),
      ];
      const result = normalizer.normalize(makeSourceResult(items));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("valid");
    });

    it("should truncate content to 500 words", () => {
      const longContent = Array(600).fill("word").join(" ");
      const items = [makeItem({ content: longContent })];
      const result = normalizer.normalize(makeSourceResult(items));

      const wordCount = result[0].content.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(MAX_CONTENT_WORDS);
    });

    it("should normalize dates to valid Date objects", () => {
      const items = [makeItem({ publishDate: "2024-01-15" as any })];
      const result = normalizer.normalize(makeSourceResult(items));

      expect(result[0].publishDate).toBeInstanceOf(Date);
      expect(result[0].publishDate.toISOString()).toContain("2024-01-15");
    });

    it("should set retrievedAt if not present", () => {
      const items = [makeItem()];
      const result = normalizer.normalize(makeSourceResult(items));

      expect(result[0].retrievedAt).toBeInstanceOf(Date);
    });

    it("should handle empty items array", () => {
      const result = normalizer.normalize(makeSourceResult([]));
      expect(result).toEqual([]);
    });

    it("should preserve existing metadata when present", () => {
      const items = [makeItem({
        metadata: {
          hasCodeExamples: true,
          hasDiagrams: true,
          hasStepByStep: true,
          estimatedReadTime: 10,
          difficultyLevel: DifficultyLevel.ADVANCED,
          techStack: ["Python"],
          awsServices: ["Lambda"],
        },
      })];
      const result = normalizer.normalize(makeSourceResult(items));

      expect(result[0].metadata.hasCodeExamples).toBe(true);
      expect(result[0].metadata.hasDiagrams).toBe(true);
      expect(result[0].metadata.techStack).toEqual(["Python"]);
      expect(result[0].metadata.awsServices).toEqual(["Lambda"]);
    });

    it("should enrich author with extracted credentials when missing", () => {
      const items = [makeItem({
        author: {
          name: "AWS Hero Developer",
          credentials: [],
          authorityLevel: AuthorityLevel.UNKNOWN,
        },
      })];
      const result = normalizer.normalize(makeSourceResult(items));

      expect(result[0].author.authorityLevel).toBe(AuthorityLevel.AWS_HERO);
      expect(result[0].author.credentials.length).toBeGreaterThan(0);
    });

    it("should keep existing author credentials when already set", () => {
      const items = [makeItem({
        author: {
          name: "Jeff Barr",
          credentials: ["VP"],
          authorityLevel: AuthorityLevel.AWS_EMPLOYEE,
        },
      })];
      const result = normalizer.normalize(makeSourceResult(items));

      expect(result[0].author.credentials).toEqual(["VP"]);
      expect(result[0].author.authorityLevel).toBe(AuthorityLevel.AWS_EMPLOYEE);
    });
  });

  describe("extractMetadata", () => {
    it("should extract metadata from content with code examples", () => {
      const content = "```python\ndef handler(event, context):\n  return 200\n```";
      const meta = normalizer.extractMetadata(content, ContentSource.AWS_BLOG);

      expect(meta.hasCodeExamples).toBe(true);
    });

    it("should detect AWS services in content", () => {
      const content = "This tutorial uses Lambda, DynamoDB, and API Gateway";
      const meta = normalizer.extractMetadata(content, ContentSource.MEDIUM);

      expect(meta.awsServices).toContain("Lambda");
      expect(meta.awsServices).toContain("DynamoDB");
      expect(meta.awsServices).toContain("API Gateway");
    });

    it("should detect tech stack in content", () => {
      const content = "Built with TypeScript and Node.js on Docker";
      const meta = normalizer.extractMetadata(content, ContentSource.DEVTO);

      expect(meta.techStack).toContain("TypeScript");
      expect(meta.techStack).toContain("Node.js");
      expect(meta.techStack).toContain("Docker");
    });

    it("should handle empty content gracefully", () => {
      const meta = normalizer.extractMetadata("", ContentSource.REDDIT);

      expect(meta.hasCodeExamples).toBe(false);
      expect(meta.hasDiagrams).toBe(false);
      expect(meta.hasStepByStep).toBe(false);
      expect(meta.estimatedReadTime).toBe(1);
      expect(meta.awsServices).toEqual([]);
      expect(meta.techStack).toEqual([]);
    });

    it("should handle non-string input gracefully", () => {
      const meta = normalizer.extractMetadata(null as any, ContentSource.GITHUB);

      expect(meta.hasCodeExamples).toBe(false);
      expect(meta.estimatedReadTime).toBe(1);
    });
  });
});

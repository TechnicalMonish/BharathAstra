import { describe, it, expect, beforeEach } from "vitest";
import {
  PrerequisiteAnalyzer,
  extractConcepts,
  estimateReadTime,
  orderByDependency,
  estimateReadTimeByLevel,
  type UserKnowledge,
} from "./prerequisiteAnalyzer";
import {
  ExperienceLevel,
  type ExtractedSection,
  type Prerequisite,
} from "@aws-intel/shared";

// --- Helpers ---

function makeSection(overrides: Partial<ExtractedSection> = {}): ExtractedSection {
  return {
    docId: "doc-1",
    docTitle: "Test Doc",
    sectionId: "sec-1",
    sectionNumber: "1.1",
    sectionTitle: "Getting Started",
    content:
      "AWS Lambda is a serverless compute service. You need an IAM role to grant permissions.",
    relevanceScore: 0.8,
    parentSections: [],
    ...overrides,
  };
}

function makeUserKnowledge(
  overrides: Partial<UserKnowledge> = {}
): UserKnowledge {
  return {
    userId: "user-1",
    knownConcepts: [],
    knownServices: [],
    experienceLevel: ExperienceLevel.BEGINNER,
    ...overrides,
  };
}

// --- extractConcepts ---

describe("extractConcepts", () => {
  it("extracts AWS service names from content", () => {
    const concepts = extractConcepts("Use Lambda and S3 for serverless storage.");
    expect(concepts).toContain("lambda");
    expect(concepts).toContain("s3");
    expect(concepts).toContain("serverless");
  });

  it("extracts cloud concepts like security group and subnet", () => {
    const concepts = extractConcepts(
      "Configure the security group and subnet for your VPC."
    );
    expect(concepts).toContain("security group");
    expect(concepts).toContain("subnet");
    expect(concepts).toContain("vpc");
  });

  it("returns empty array for content with no recognized concepts", () => {
    const concepts = extractConcepts("This is a plain text with no AWS terms.");
    expect(concepts).toEqual([]);
  });

  it("deduplicates concepts", () => {
    const concepts = extractConcepts("Lambda calls Lambda via Lambda.");
    const lambdaCount = concepts.filter((c) => c === "lambda").length;
    expect(lambdaCount).toBe(1);
  });
});

// --- estimateReadTime ---

describe("estimateReadTime", () => {
  it("returns at least 1 minute for short content", () => {
    expect(estimateReadTime("Hello world")).toBe(1);
  });

  it("estimates based on word count", () => {
    const words = Array(400).fill("word").join(" ");
    expect(estimateReadTime(words)).toBe(2);
  });

  it("returns 1 for empty content", () => {
    expect(estimateReadTime("")).toBe(1);
  });
});

// --- orderByDependency ---

describe("orderByDependency", () => {
  it("puts foundational concepts first", () => {
    const ordered = orderByDependency(["lambda", "iam", "serverless"]);
    expect(ordered.indexOf("iam")).toBeLessThan(ordered.indexOf("lambda"));
  });

  it("orders foundational concepts by their defined order", () => {
    const ordered = orderByDependency(["s3", "vpc", "iam"]);
    expect(ordered[0]).toBe("iam");
    expect(ordered[1]).toBe("vpc");
    expect(ordered[2]).toBe("s3");
  });

  it("appends non-foundational concepts alphabetically", () => {
    const ordered = orderByDependency(["serverless", "container", "iam"]);
    expect(ordered[0]).toBe("iam");
    expect(ordered[1]).toBe("container");
    expect(ordered[2]).toBe("serverless");
  });

  it("handles empty input", () => {
    expect(orderByDependency([])).toEqual([]);
  });
});

// --- estimateReadTimeByLevel ---

describe("estimateReadTimeByLevel", () => {
  it("returns 5 for beginners", () => {
    expect(estimateReadTimeByLevel(ExperienceLevel.BEGINNER)).toBe(5);
  });

  it("returns 3 for intermediate", () => {
    expect(estimateReadTimeByLevel(ExperienceLevel.INTERMEDIATE)).toBe(3);
  });

  it("returns 1 for advanced", () => {
    expect(estimateReadTimeByLevel(ExperienceLevel.ADVANCED)).toBe(1);
  });
});

// --- PrerequisiteAnalyzer.analyzePrerequisites ---

describe("PrerequisiteAnalyzer.analyzePrerequisites", () => {
  let analyzer: PrerequisiteAnalyzer;

  beforeEach(() => {
    analyzer = new PrerequisiteAnalyzer();
  });

  it("returns empty for no sections", () => {
    const result = analyzer.analyzePrerequisites([], makeUserKnowledge());
    expect(result).toEqual([]);
  });

  it("extracts prerequisites from section content", () => {
    const sections = [makeSection()];
    const result = analyzer.analyzePrerequisites(sections, makeUserKnowledge());
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.concept === "lambda")).toBe(true);
    expect(result.some((p) => p.concept === "iam")).toBe(true);
  });

  it("filters out concepts the user already knows", () => {
    const sections = [makeSection()];
    const user = makeUserKnowledge({
      knownServices: ["Lambda"],
      knownConcepts: ["iam"],
    });
    const result = analyzer.analyzePrerequisites(sections, user);
    expect(result.every((p) => p.concept !== "lambda")).toBe(true);
    expect(result.every((p) => p.concept !== "iam")).toBe(true);
  });

  it("orders prerequisites with foundational concepts first", () => {
    const sections = [
      makeSection({
        content: "Use Lambda with S3 and configure IAM roles in your VPC.",
      }),
    ];
    const result = analyzer.analyzePrerequisites(sections, makeUserKnowledge());
    const iamIdx = result.findIndex((p) => p.concept === "iam");
    const lambdaIdx = result.findIndex((p) => p.concept === "lambda");
    if (iamIdx >= 0 && lambdaIdx >= 0) {
      expect(iamIdx).toBeLessThan(lambdaIdx);
    }
  });

  it("includes parent sections as prerequisite sources", () => {
    const sections = [
      makeSection({
        content: "Deploy your application.",
        parentSections: [{ sectionNumber: "1", title: "VPC Setup" }],
      }),
    ];
    const result = analyzer.analyzePrerequisites(sections, makeUserKnowledge());
    expect(result.some((p) => p.concept === "vpc setup")).toBe(true);
  });

  it("includes learnMoreSection references", () => {
    const sections = [makeSection()];
    const result = analyzer.analyzePrerequisites(sections, makeUserKnowledge());
    for (const prereq of result) {
      expect(prereq.learnMoreSection).toBeDefined();
    }
  });
});

// --- PrerequisiteAnalyzer.checkKnowledgeGaps ---

describe("PrerequisiteAnalyzer.checkKnowledgeGaps", () => {
  let analyzer: PrerequisiteAnalyzer;

  beforeEach(() => {
    analyzer = new PrerequisiteAnalyzer();
  });

  it("returns gaps for unknown concepts", () => {
    const prereqs: Prerequisite[] = [
      { concept: "lambda", description: "Understanding of lambda is recommended." },
      { concept: "iam", description: "Understanding of iam is recommended." },
    ];
    const user = makeUserKnowledge({ knownServices: ["Lambda"] });
    const gaps = analyzer.checkKnowledgeGaps(prereqs, user);
    expect(gaps.length).toBe(1);
    expect(gaps[0].concept).toBe("iam");
  });

  it("returns empty when user knows all prerequisites", () => {
    const prereqs: Prerequisite[] = [
      { concept: "lambda", description: "desc" },
    ];
    const user = makeUserKnowledge({ knownServices: ["Lambda"] });
    const gaps = analyzer.checkKnowledgeGaps(prereqs, user);
    expect(gaps).toEqual([]);
  });

  it("estimates read time from section content when available", () => {
    const sections = [
      makeSection({
        content: Array(400).fill("word").join(" ") + " iam role policy",
      }),
    ];
    const prereqs: Prerequisite[] = [
      { concept: "iam", description: "desc" },
    ];
    const gaps = analyzer.checkKnowledgeGaps(
      prereqs,
      makeUserKnowledge(),
      sections
    );
    // 403 words / 200 wpm = ceil(2.015) = 3
    expect(gaps[0].estimatedReadTime).toBe(3);
  });

  it("falls back to experience-level estimate when no section content", () => {
    const prereqs: Prerequisite[] = [
      { concept: "iam", description: "desc" },
    ];
    const gaps = analyzer.checkKnowledgeGaps(
      prereqs,
      makeUserKnowledge({ experienceLevel: ExperienceLevel.ADVANCED })
    );
    expect(gaps[0].estimatedReadTime).toBe(1);
  });

  it("includes learnMoreSection from prerequisite", () => {
    const prereqs: Prerequisite[] = [
      {
        concept: "iam",
        description: "desc",
        learnMoreSection: { sectionNumber: "2.1", title: "IAM Basics" },
      },
    ];
    const gaps = analyzer.checkKnowledgeGaps(prereqs, makeUserKnowledge());
    expect(gaps[0].learnMoreSection.sectionNumber).toBe("2.1");
    expect(gaps[0].learnMoreSection.title).toBe("IAM Basics");
  });
});

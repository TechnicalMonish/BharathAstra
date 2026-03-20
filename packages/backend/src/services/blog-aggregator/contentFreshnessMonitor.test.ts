import { describe, it, expect } from "vitest";
import {
  ContentFreshnessMonitor,
  DEPRECATED_SERVICES,
  findDeprecatedReferences,
} from "./contentFreshnessMonitor";
import {
  ContentSource,
  AuthorityLevel,
  DifficultyLevel,
  type ContentItem,
} from "@aws-intel/shared";

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "test-1",
    source: ContentSource.AWS_BLOG,
    title: "Test Article",
    url: "https://example.com/test",
    author: { name: "Author", credentials: [], authorityLevel: AuthorityLevel.COMMUNITY_MEMBER },
    publishDate: new Date("2024-12-01"),
    content: "Content about Lambda and S3",
    metadata: {
      hasCodeExamples: false,
      hasDiagrams: false,
      hasStepByStep: false,
      estimatedReadTime: 5,
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      techStack: [],
      awsServices: ["Lambda"],
    },
    ...overrides,
  };
}

describe("ContentFreshnessMonitor", () => {
  const monitor = new ContentFreshnessMonitor();

  describe("checkFreshness", () => {
    it("should return no warnings for current content", () => {
      const report = monitor.checkFreshness(makeItem());
      expect(report.hasDeprecatedReferences).toBe(false);
      expect(report.warnings).toHaveLength(0);
    });

    it("should detect deprecated service references", () => {
      const report = monitor.checkFreshness(makeItem({
        content: "Use SimpleDB for your NoSQL needs",
      }));
      expect(report.hasDeprecatedReferences).toBe(true);
      expect(report.warnings.length).toBeGreaterThan(0);
      expect(report.warnings[0].service).toBe("simpledb");
      expect(report.warnings[0].alternative).toBe("DynamoDB");
    });

    it("should detect deprecated SDK references", () => {
      const report = monitor.checkFreshness(makeItem({
        content: "Install AWS SDK v2 for JavaScript",
      }));
      expect(report.hasDeprecatedReferences).toBe(true);
      expect(report.warnings.some((w) => w.alternative?.includes("v3"))).toBe(true);
    });

    it("should check both title and content", () => {
      const report = monitor.checkFreshness(makeItem({
        title: "Using CodeCommit for version control",
        content: "Regular content about git",
      }));
      expect(report.hasDeprecatedReferences).toBe(true);
    });

    it("should return the item ID in the report", () => {
      const report = monitor.checkFreshness(makeItem({ id: "my-item" }));
      expect(report.itemId).toBe("my-item");
    });
  });

  describe("checkMultiple", () => {
    it("should return only items with warnings", () => {
      const items = [
        makeItem({ id: "clean", content: "Using Lambda" }),
        makeItem({ id: "deprecated", content: "Use SimpleDB" }),
        makeItem({ id: "also-clean", content: "Using DynamoDB" }),
      ];
      const reports = monitor.checkMultiple(items);
      expect(reports).toHaveLength(1);
      expect(reports[0].itemId).toBe("deprecated");
    });

    it("should return empty for all-clean items", () => {
      const items = [
        makeItem({ content: "Lambda is great" }),
        makeItem({ content: "S3 is awesome" }),
      ];
      expect(monitor.checkMultiple(items)).toHaveLength(0);
    });
  });

  describe("getDeprecatedServices", () => {
    it("should return list of deprecated service names", () => {
      const services = monitor.getDeprecatedServices();
      expect(services.length).toBeGreaterThan(0);
      expect(services).toContain("simpledb");
      expect(services).toContain("codecommit");
    });
  });

  describe("getAlternative", () => {
    it("should return alternative for known deprecated service", () => {
      expect(monitor.getAlternative("simpledb")).toBe("DynamoDB");
    });

    it("should return undefined for unknown service", () => {
      expect(monitor.getAlternative("lambda")).toBeUndefined();
    });

    it("should be case-insensitive", () => {
      expect(monitor.getAlternative("SimpleDB")).toBe("DynamoDB");
    });
  });
});

describe("findDeprecatedReferences", () => {
  it("should find multiple deprecated references", () => {
    const warnings = findDeprecatedReferences("Use SimpleDB and CodeCommit together");
    expect(warnings.length).toBe(2);
  });

  it("should return empty for clean content", () => {
    expect(findDeprecatedReferences("Lambda and DynamoDB are great")).toHaveLength(0);
  });
});

describe("DEPRECATED_SERVICES", () => {
  it("should have message and alternative for each entry", () => {
    for (const [service, info] of Object.entries(DEPRECATED_SERVICES)) {
      expect(info.message).toBeDefined();
      expect(info.message.length).toBeGreaterThan(0);
      expect(info.alternative).toBeDefined();
      expect(info.alternative.length).toBeGreaterThan(0);
    }
  });
});

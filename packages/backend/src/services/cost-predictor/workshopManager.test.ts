import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WorkshopManager,
  determineCostBadge,
  categorizeWorkshop,
  estimateDifficulty,
  WORKSHOP_CATEGORIES,
  type CatalogEntry,
  type SyncResult,
} from "./workshopManager";
import { CostRange, DifficultyLevel } from "@aws-intel/shared";

// --- Mock dynamodb ---
vi.mock("../../lib/dynamodb", () => ({
  put: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue([]),
  del: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
}));

// --- Mock axios ---
vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: "" }),
  },
}));

import * as dynamodb from "../../lib/dynamodb";
import axios from "axios";

// --- Helper: create a mock DynamoDB workshop item ---
function createMockDbItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workshopId: "ws-test-workshop",
    title: "Test Workshop",
    description: "A test workshop for unit testing",
    category: "Serverless",
    difficulty: DifficultyLevel.BEGINNER,
    estimatedDuration: 60,
    costBadge: CostRange.LOW,
    lastUpdated: new Date("2024-01-15").toISOString(),
    resources: "[]",
    costAnalysis: JSON.stringify({
      totalCosts: { hourlyRate: 0.05, dailyCost: 1.2, monthlyCost: 5, scenarios: [] },
      resources: [],
      hiddenCosts: [],
      freeTierEligible: true,
      warnings: [],
      generatedAt: new Date("2024-01-15").toISOString(),
    }),
    instructions: "Step 1: Do something",
    sourceUrl: "https://workshops.aws/test",
    lastAnalyzed: new Date("2024-01-15").toISOString(),
    popularity: 42,
    ...overrides,
  };
}

// ============================================================
// Helper function tests
// ============================================================

describe("determineCostBadge", () => {
  it("returns FREE for zero cost", () => {
    expect(determineCostBadge(0)).toBe(CostRange.FREE);
  });

  it("returns FREE for negative cost", () => {
    expect(determineCostBadge(-5)).toBe(CostRange.FREE);
  });

  it("returns LOW for cost $0-$10", () => {
    expect(determineCostBadge(5)).toBe(CostRange.LOW);
    expect(determineCostBadge(10)).toBe(CostRange.LOW);
  });

  it("returns MEDIUM for cost $10-$50", () => {
    expect(determineCostBadge(10.01)).toBe(CostRange.MEDIUM);
    expect(determineCostBadge(50)).toBe(CostRange.MEDIUM);
  });

  it("returns HIGH for cost >$50", () => {
    expect(determineCostBadge(50.01)).toBe(CostRange.HIGH);
    expect(determineCostBadge(200)).toBe(CostRange.HIGH);
  });
});

describe("categorizeWorkshop", () => {
  it("categorizes serverless workshops", () => {
    expect(categorizeWorkshop("Build with Lambda", "Serverless app")).toBe("Serverless");
  });

  it("categorizes container workshops", () => {
    expect(categorizeWorkshop("EKS Workshop", "Deploy containers on Kubernetes")).toBe("Containers");
  });

  it("categorizes ML workshops", () => {
    expect(categorizeWorkshop("SageMaker Intro", "Machine learning on AWS")).toBe("Machine Learning");
  });

  it("categorizes security workshops", () => {
    expect(categorizeWorkshop("IAM Deep Dive", "Security best practices")).toBe("Security");
  });

  it("categorizes networking workshops", () => {
    expect(categorizeWorkshop("VPC Setup", "Networking fundamentals")).toBe("Networking");
  });

  it("categorizes database workshops", () => {
    expect(categorizeWorkshop("DynamoDB Workshop", "NoSQL database")).toBe("Database");
  });

  it("returns General for unrecognized content", () => {
    expect(categorizeWorkshop("Cooking Recipe", "How to bake a cake")).toBe("General");
  });
});

describe("estimateDifficulty", () => {
  it("returns BEGINNER for introductory content", () => {
    expect(estimateDifficulty("Getting Started with AWS", "Introduction to cloud")).toBe(
      DifficultyLevel.BEGINNER
    );
  });

  it("returns ADVANCED for complex content", () => {
    expect(estimateDifficulty("Advanced Multi-Region Architecture", "Complex setup")).toBe(
      DifficultyLevel.ADVANCED
    );
  });

  it("returns INTERMEDIATE for neutral content", () => {
    expect(estimateDifficulty("AWS Workshop", "Build an application")).toBe(
      DifficultyLevel.INTERMEDIATE
    );
  });
});

describe("WORKSHOP_CATEGORIES", () => {
  it("contains expected categories", () => {
    expect(WORKSHOP_CATEGORIES).toContain("Serverless");
    expect(WORKSHOP_CATEGORIES).toContain("Containers");
    expect(WORKSHOP_CATEGORIES).toContain("Machine Learning");
    expect(WORKSHOP_CATEGORIES).toContain("Security");
    expect(WORKSHOP_CATEGORIES).toContain("Database");
    expect(WORKSHOP_CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================
// WorkshopManager class tests
// ============================================================

describe("WorkshopManager", () => {
  let manager: WorkshopManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WorkshopManager();
  });

  // --- listWorkshops ---

  describe("listWorkshops", () => {
    it("returns all workshops when no filter is provided", async () => {
      const mockItems = [
        createMockDbItem({ workshopId: "ws-1", title: "Workshop 1" }),
        createMockDbItem({ workshopId: "ws-2", title: "Workshop 2" }),
      ];
      vi.mocked(dynamodb.scan).mockResolvedValueOnce(mockItems);

      const result = await manager.listWorkshops();

      expect(result).toHaveLength(2);
      expect(result[0].workshopId).toBe("ws-1");
      expect(result[1].workshopId).toBe("ws-2");
    });

    it("filters by category", async () => {
      const mockItems = [
        createMockDbItem({ workshopId: "ws-1", category: "Serverless" }),
        createMockDbItem({ workshopId: "ws-2", category: "Containers" }),
      ];
      vi.mocked(dynamodb.scan).mockResolvedValueOnce(mockItems);

      const result = await manager.listWorkshops({ category: "Serverless" });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe("Serverless");
    });

    it("filters by search term in title", async () => {
      const mockItems = [
        createMockDbItem({ workshopId: "ws-1", title: "Lambda Deep Dive" }),
        createMockDbItem({ workshopId: "ws-2", title: "ECS Workshop" }),
      ];
      vi.mocked(dynamodb.scan).mockResolvedValueOnce(mockItems);

      const result = await manager.listWorkshops({ searchTerm: "lambda" });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Lambda Deep Dive");
    });

    it("filters by search term in description", async () => {
      const mockItems = [
        createMockDbItem({ workshopId: "ws-1", title: "Workshop A", description: "Learn about serverless", category: "Compute" }),
        createMockDbItem({ workshopId: "ws-2", title: "Workshop B", description: "Learn about containers", category: "Compute" }),
      ];
      vi.mocked(dynamodb.scan).mockResolvedValueOnce(mockItems);

      const result = await manager.listWorkshops({ searchTerm: "serverless" });

      expect(result).toHaveLength(1);
      expect(result[0].workshopId).toBe("ws-1");
    });

    it("filters by cost range", async () => {
      const mockItems = [
        createMockDbItem({ workshopId: "ws-1", costBadge: CostRange.FREE }),
        createMockDbItem({ workshopId: "ws-2", costBadge: CostRange.HIGH }),
      ];
      vi.mocked(dynamodb.scan).mockResolvedValueOnce(mockItems);

      const result = await manager.listWorkshops({ costRange: CostRange.FREE });

      expect(result).toHaveLength(1);
      expect(result[0].costBadge).toBe(CostRange.FREE);
    });

    it("returns empty array when no workshops match filter", async () => {
      const mockItems = [
        createMockDbItem({ workshopId: "ws-1", category: "Serverless" }),
      ];
      vi.mocked(dynamodb.scan).mockResolvedValueOnce(mockItems);

      const result = await manager.listWorkshops({ category: "IoT" });

      expect(result).toHaveLength(0);
    });

    it("applies multiple filters with AND logic", async () => {
      const mockItems = [
        createMockDbItem({ workshopId: "ws-1", category: "Serverless", costBadge: CostRange.FREE, title: "Lambda Basics" }),
        createMockDbItem({ workshopId: "ws-2", category: "Serverless", costBadge: CostRange.HIGH, title: "Lambda Advanced" }),
        createMockDbItem({ workshopId: "ws-3", category: "Containers", costBadge: CostRange.FREE, title: "ECS Basics" }),
      ];
      vi.mocked(dynamodb.scan).mockResolvedValueOnce(mockItems);

      const result = await manager.listWorkshops({
        category: "Serverless",
        costRange: CostRange.FREE,
      });

      expect(result).toHaveLength(1);
      expect(result[0].workshopId).toBe("ws-1");
    });
  });

  // --- getWorkshop ---

  describe("getWorkshop", () => {
    it("returns a workshop by ID from DynamoDB", async () => {
      const mockItem = createMockDbItem();
      vi.mocked(dynamodb.get).mockResolvedValueOnce(mockItem);

      const result = await manager.getWorkshop("ws-test-workshop");

      expect(result.workshopId).toBe("ws-test-workshop");
      expect(result.info.title).toBe("Test Workshop");
      expect(result.info.category).toBe("Serverless");
      expect(result.instructions).toBe("Step 1: Do something");
      expect(result.sourceUrl).toBe("https://workshops.aws/test");
    });

    it("throws when workshop is not found", async () => {
      vi.mocked(dynamodb.get).mockResolvedValueOnce(undefined);

      await expect(manager.getWorkshop("ws-nonexistent")).rejects.toThrow(
        "Workshop not found: ws-nonexistent"
      );
    });

    it("caches workshop after first fetch", async () => {
      const mockItem = createMockDbItem();
      vi.mocked(dynamodb.get).mockResolvedValueOnce(mockItem);

      // First call fetches from DB
      await manager.getWorkshop("ws-test-workshop");
      // Second call should use cache
      const result = await manager.getWorkshop("ws-test-workshop");

      expect(dynamodb.get).toHaveBeenCalledTimes(1);
      expect(result.workshopId).toBe("ws-test-workshop");
    });

    it("deserializes resources and costAnalysis from JSON strings", async () => {
      const resources = [
        {
          resourceId: "r-1",
          resourceType: "EC2",
          configuration: { region: "us-east-1" },
          pricing: { hourlyRate: 0.1, dailyCost: 2.4, monthlyCost: 72, pricingModel: "On-Demand" },
          freeTierEligible: false,
          deploymentMethod: "CloudFormation",
        },
      ];
      const mockItem = createMockDbItem({
        resources: JSON.stringify(resources),
      });
      vi.mocked(dynamodb.get).mockResolvedValueOnce(mockItem);

      const result = await manager.getWorkshop("ws-test-workshop");

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].resourceType).toBe("EC2");
    });

    it("handles malformed JSON in resources gracefully", async () => {
      const mockItem = createMockDbItem({ resources: "not-valid-json" });
      vi.mocked(dynamodb.get).mockResolvedValueOnce(mockItem);

      const result = await manager.getWorkshop("ws-test-workshop");

      expect(result.resources).toEqual([]);
    });

    it("handles malformed JSON in costAnalysis gracefully", async () => {
      const mockItem = createMockDbItem({ costAnalysis: "not-valid-json" });
      vi.mocked(dynamodb.get).mockResolvedValueOnce(mockItem);

      const result = await manager.getWorkshop("ws-test-workshop");

      expect(result.costAnalysis).toBeDefined();
      expect(result.costAnalysis.totalCosts.monthlyCost).toBe(0);
    });
  });

  // --- syncWorkshops ---

  describe("syncWorkshops", () => {
    it("adds new workshops from catalog", async () => {
      const catalogEntries: CatalogEntry[] = [
        {
          title: "New Lambda Workshop",
          description: "Learn serverless",
          sourceUrl: "https://workshops.aws/lambda",
          estimatedDuration: 90,
        },
      ];

      // Mock fetchCatalog via axios
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: catalogEntries,
      });

      // No existing workshop
      vi.mocked(dynamodb.get).mockResolvedValue(undefined);
      // Count returns the items we just added
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([{}]);

      const result = await manager.syncWorkshops();

      expect(result.workshopsAdded).toBe(1);
      expect(result.workshopsUpdated).toBe(0);
      expect(dynamodb.put).toHaveBeenCalledTimes(1);

      const putCall = vi.mocked(dynamodb.put).mock.calls[0][0];
      expect(putCall.Item).toBeDefined();
      expect((putCall.Item as Record<string, unknown>).title).toBe("New Lambda Workshop");
      expect((putCall.Item as Record<string, unknown>).category).toBe("Serverless");
    });

    it("updates existing workshops from catalog", async () => {
      const catalogEntries: CatalogEntry[] = [
        {
          workshopId: "ws-existing",
          title: "Existing Workshop Updated",
          description: "Updated description",
        },
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: catalogEntries,
      });

      // Existing workshop found
      vi.mocked(dynamodb.get).mockResolvedValueOnce(
        createMockDbItem({ workshopId: "ws-existing", title: "Existing Workshop" })
      );
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([{}]);

      const result = await manager.syncWorkshops();

      expect(result.workshopsUpdated).toBe(1);
      expect(result.workshopsAdded).toBe(0);
    });

    it("returns empty sync result when catalog fetch fails", async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error("Network error"));
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([]);

      const result = await manager.syncWorkshops();

      expect(result.workshopsAdded).toBe(0);
      expect(result.workshopsUpdated).toBe(0);
      expect(result.totalWorkshops).toBe(0);
    });

    it("handles JSON array catalog response", async () => {
      const jsonCatalog = [
        { id: "ws-json-1", title: "JSON Workshop", description: "From JSON", url: "https://example.com", duration: 45 },
        { id: "ws-json-2", title: "Another Workshop", description: "Also JSON" },
      ];

      vi.mocked(axios.get).mockResolvedValueOnce({ data: jsonCatalog });
      vi.mocked(dynamodb.get).mockResolvedValue(undefined);
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([{}, {}]);

      const result = await manager.syncWorkshops();

      expect(result.workshopsAdded).toBe(2);
      expect(dynamodb.put).toHaveBeenCalledTimes(2);
    });

    it("handles HTML catalog response", async () => {
      const htmlCatalog = `
        <html>
          <body>
            <h2>Lambda Workshop</h2>
            <h3>ECS Deep Dive</h3>
          </body>
        </html>
      `;

      vi.mocked(axios.get).mockResolvedValueOnce({ data: htmlCatalog });
      vi.mocked(dynamodb.get).mockResolvedValue(undefined);
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([{}, {}]);

      const result = await manager.syncWorkshops();

      expect(result.workshopsAdded).toBe(2);
    });
  });

  // --- addCustomTutorial ---

  describe("addCustomTutorial", () => {
    it("fetches content and creates a workshop from URL", async () => {
      const htmlContent = `
        <html>
          <title>My Custom Lambda Tutorial</title>
          <meta name="description" content="Learn to build serverless apps">
          <body><p>Tutorial content here</p></body>
        </html>
      `;
      vi.mocked(axios.get).mockResolvedValueOnce({ data: htmlContent });

      const result = await manager.addCustomTutorial("https://example.com/tutorial");

      expect(result.workshopId).toMatch(/^custom-/);
      expect(result.info.title).toBe("My Custom Lambda Tutorial");
      expect(result.info.description).toBe("Learn to build serverless apps");
      expect(result.info.category).toBe("Serverless");
      expect(result.sourceUrl).toBe("https://example.com/tutorial");
      expect(dynamodb.put).toHaveBeenCalledTimes(1);
    });

    it("extracts title from h1 when no title tag", async () => {
      const htmlContent = `<html><body><h1>My H1 Title</h1><p>Content</p></body></html>`;
      vi.mocked(axios.get).mockResolvedValueOnce({ data: htmlContent });

      const result = await manager.addCustomTutorial("https://example.com/tutorial");

      expect(result.info.title).toBe("My H1 Title");
    });

    it("uses default title when none can be extracted", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: "" });

      const result = await manager.addCustomTutorial("https://example.com/tutorial");

      expect(result.info.title).toBe("Custom Tutorial");
    });

    it("throws when URL fetch fails", async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error("404 Not Found"));

      await expect(
        manager.addCustomTutorial("https://example.com/broken")
      ).rejects.toThrow("Failed to fetch tutorial");
    });

    it("handles JSON response from URL", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: { title: "JSON Tutorial", steps: ["step1", "step2"] },
      });

      const result = await manager.addCustomTutorial("https://api.example.com/tutorial");

      expect(result.workshopId).toMatch(/^custom-/);
      expect(result.instructions).toContain("JSON Tutorial");
    });

    it("sets default cost badge to FREE for new custom tutorials", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: "<html><title>Test</title></html>" });

      const result = await manager.addCustomTutorial("https://example.com/test");

      expect(result.info.costBadge).toBe(CostRange.FREE);
      expect(result.costAnalysis.freeTierEligible).toBe(true);
    });
  });

  // --- parseCatalogResponse ---

  describe("parseCatalogResponse", () => {
    it("parses JSON array response", () => {
      const data = [
        { id: "ws-1", title: "Workshop 1", description: "Desc 1", url: "https://example.com/1" },
        { id: "ws-2", title: "Workshop 2", description: "Desc 2" },
      ];

      const result = manager.parseCatalogResponse(data);

      expect(result).toHaveLength(2);
      expect(result[0].workshopId).toBe("ws-1");
      expect(result[0].title).toBe("Workshop 1");
      expect(result[1].workshopId).toBe("ws-2");
    });

    it("filters out invalid entries from JSON array", () => {
      const data = [
        { id: "ws-1", title: "Valid Workshop" },
        null,
        { noTitle: true },
        { title: "Another Valid" },
      ];

      const result = manager.parseCatalogResponse(data);

      expect(result).toHaveLength(2);
    });

    it("parses HTML string response", () => {
      const html = `<h2>Workshop Alpha</h2><p>desc</p><h3>Workshop Beta</h3>`;

      const result = manager.parseCatalogResponse(html);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Workshop Alpha");
      expect(result[1].title).toBe("Workshop Beta");
    });

    it("returns empty array for unsupported data types", () => {
      expect(manager.parseCatalogResponse(42)).toEqual([]);
      expect(manager.parseCatalogResponse(null)).toEqual([]);
      expect(manager.parseCatalogResponse(undefined)).toEqual([]);
    });
  });
});

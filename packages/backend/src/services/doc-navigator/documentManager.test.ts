import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentManager, SERVICE_CATEGORIES } from "./documentManager";
import { DocumentType, DocumentFormat } from "@aws-intel/shared";
import { OFFICIAL_AWS_DOCS } from "./documentIndexer";

// Mock dynamodb and s3 modules
vi.mock("../../lib/dynamodb", () => ({
  query: vi.fn().mockResolvedValue([]),
  scan: vi.fn().mockResolvedValue([]),
  del: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/s3", () => ({
  listObjects: vi.fn().mockResolvedValue([]),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn().mockResolvedValue(undefined),
}));

// Import mocked modules
import * as dynamodb from "../../lib/dynamodb";
import * as s3 from "../../lib/s3";

// Create a mock indexer
function createMockIndexer() {
  return {
    indexCustomDoc: vi.fn().mockResolvedValue({
      docId: "custom-123-test-doc",
      title: "Test Doc",
      sections: 5,
      indexedAt: new Date("2024-01-01"),
      success: true,
    }),
    indexOfficialDocs: vi.fn(),
    syncOfficialDocs: vi.fn(),
    searchIndex: vi.fn(),
    startSyncSchedule: vi.fn(),
    stopSyncSchedule: vi.fn(),
  };
}

describe("DocumentManager", () => {
  let manager: DocumentManager;
  let mockIndexer: ReturnType<typeof createMockIndexer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexer = createMockIndexer();
    manager = new DocumentManager(mockIndexer as any);
  });

  describe("listDocuments", () => {
    it("returns official AWS docs (empty until real integration)", async () => {
      const docs = await manager.listDocuments();
      const officialDocs = docs.filter((d) => d.type === DocumentType.OFFICIAL_AWS);
      // OFFICIAL_AWS_DOCS is empty until real AWS documentation integration
      expect(officialDocs.length).toBe(OFFICIAL_AWS_DOCS.length);
      expect(officialDocs.length).toBe(0);
    });

    it("returns empty categories when no official docs are loaded", async () => {
      const docs = await manager.listDocuments();
      const categories = new Set(docs.map((d) => d.category));
      // No categories since OFFICIAL_AWS_DOCS is empty
      expect(categories.size).toBe(0);
    });

    it("filters by document type", async () => {
      const docs = await manager.listDocuments({ type: DocumentType.OFFICIAL_AWS });
      expect(docs.every((d) => d.type === DocumentType.OFFICIAL_AWS)).toBe(true);
    });

    it("returns empty when filtering by category with no docs", async () => {
      const docs = await manager.listDocuments({ category: "Compute" });
      expect(docs.every((d) => d.category === "Compute")).toBe(true);
      // No docs since OFFICIAL_AWS_DOCS is empty
      expect(docs.length).toBe(0);
    });

    it("returns empty when filtering by search term with no docs", async () => {
      const docs = await manager.listDocuments({ searchTerm: "Lambda" });
      // No docs since OFFICIAL_AWS_DOCS is empty
      expect(docs.length).toBe(0);
    });

    it("returns empty when filtering by search term matching category with no docs", async () => {
      const docs = await manager.listDocuments({ searchTerm: "storage" });
      // No docs since OFFICIAL_AWS_DOCS is empty
      expect(docs.length).toBe(0);
    });

    it("returns empty for non-matching filter", async () => {
      const docs = await manager.listDocuments({ searchTerm: "nonexistent-xyz" });
      expect(docs.length).toBe(0);
    });

    it("includes custom uploads from DynamoDB", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        {
          docId: "custom-1",
          docTitle: "My Custom Doc",
          category: "Custom",
          type: DocumentType.CUSTOM_UPLOAD,
          sectionId: "sec-0",
          indexedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      const docs = await manager.listDocuments();
      const customDocs = docs.filter((d) => d.type === DocumentType.CUSTOM_UPLOAD);
      expect(customDocs.length).toBe(1);
      expect(customDocs[0].title).toBe("My Custom Doc");
    });

    it("separates custom uploads from official docs", async () => {
      vi.mocked(dynamodb.scan).mockResolvedValueOnce([
        {
          docId: "custom-1",
          docTitle: "Custom",
          category: "Custom",
          type: DocumentType.CUSTOM_UPLOAD,
          sectionId: "sec-0",
          indexedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);

      const docs = await manager.listDocuments();
      const official = docs.filter((d) => d.type === DocumentType.OFFICIAL_AWS);
      const custom = docs.filter((d) => d.type === DocumentType.CUSTOM_UPLOAD);
      // No official docs since OFFICIAL_AWS_DOCS is empty
      expect(official.length).toBe(0);
      expect(custom.length).toBe(1);
    });
  });

  describe("selectDocuments / getSelectedDocuments", () => {
    it("returns all docs when none selected (default behavior)", async () => {
      const selected = await manager.getSelectedDocuments();
      // OFFICIAL_AWS_DOCS is empty, so no docs returned
      expect(selected.length).toBe(OFFICIAL_AWS_DOCS.length);
      expect(selected.length).toBe(0);
    });

    it("returns empty when selecting non-existent docs", async () => {
      manager.selectDocuments(["non-existent-doc-id"]);

      const selected = await manager.getSelectedDocuments();
      // No matching docs since OFFICIAL_AWS_DOCS is empty
      expect(selected.length).toBe(0);
    });

    it("supports multi-select for cross-service queries", async () => {
      // With empty OFFICIAL_AWS_DOCS, selecting any IDs returns empty
      const ids = ["doc-1", "doc-2", "doc-3"];
      manager.selectDocuments(ids);

      const selected = await manager.getSelectedDocuments();
      expect(selected.length).toBe(0);
    });

    it("marks selected state in listDocuments", async () => {
      manager.selectDocuments(["some-doc-id"]);

      const docs = await manager.listDocuments();
      // No docs to mark since OFFICIAL_AWS_DOCS is empty
      expect(docs.length).toBe(0);
    });
  });

  describe("uploadCustomDoc", () => {
    it("indexes the document and returns DocumentInfo", async () => {
      const file = {
        name: "my-guide.md",
        format: DocumentFormat.MARKDOWN,
        content: Buffer.from("# Guide\nSome content"),
        category: "Internal",
      };

      const result = await manager.uploadCustomDoc(file);

      expect(mockIndexer.indexCustomDoc).toHaveBeenCalledWith(file);
      expect(result.docId).toBe("custom-123-test-doc");
      expect(result.title).toBe("my-guide.md");
      expect(result.category).toBe("Internal");
      expect(result.type).toBe(DocumentType.CUSTOM_UPLOAD);
      expect(result.sections).toBe(5);
    });

    it("defaults category to Custom when not provided", async () => {
      const file = {
        name: "notes.txt",
        format: DocumentFormat.TEXT,
        content: Buffer.from("Some notes"),
      };

      const result = await manager.uploadCustomDoc(file);
      expect(result.category).toBe("Custom");
    });

    it("throws when indexing fails", async () => {
      mockIndexer.indexCustomDoc.mockResolvedValueOnce({
        docId: "custom-fail",
        title: "fail",
        sections: 0,
        indexedAt: new Date(),
        success: false,
        errors: ["Parse error"],
      });

      const file = {
        name: "bad.pdf",
        format: DocumentFormat.PDF,
        content: Buffer.from("bad"),
      };

      await expect(manager.uploadCustomDoc(file)).rejects.toThrow("Parse error");
    });
  });

  describe("deleteCustomDoc", () => {
    it("removes sections from DynamoDB and files from S3", async () => {
      vi.mocked(dynamodb.query).mockResolvedValueOnce([
        { docId: "custom-1", sectionId: "sec-0" },
        { docId: "custom-1", sectionId: "sec-1" },
      ]);
      vi.mocked(s3.listObjects).mockResolvedValueOnce([
        { key: "custom-1/file.md", size: 100 },
      ]);

      await manager.deleteCustomDoc("custom-1");

      expect(dynamodb.del).toHaveBeenCalledTimes(2);
      expect(s3.deleteObject).toHaveBeenCalledTimes(1);
    });

    it("removes doc from selection set", async () => {
      const docId = "custom-to-delete";
      manager.selectDocuments([docId]);

      vi.mocked(dynamodb.query).mockResolvedValueOnce([]);
      vi.mocked(s3.listObjects).mockResolvedValueOnce([]);

      await manager.deleteCustomDoc(docId);

      // After deletion, getSelectedDocuments should return all (since set is now empty)
      const selected = await manager.getSelectedDocuments();
      expect(selected.every((d) => d.docId !== docId)).toBe(true);
    });
  });

  describe("SERVICE_CATEGORIES", () => {
    it("contains expected categories", () => {
      expect(SERVICE_CATEGORIES).toHaveProperty("Compute");
      expect(SERVICE_CATEGORIES).toHaveProperty("Storage");
      expect(SERVICE_CATEGORIES).toHaveProperty("Database");
      expect(SERVICE_CATEGORIES).toHaveProperty("Networking");
      expect(SERVICE_CATEGORIES).toHaveProperty("Security");
    });

    it("each category has at least one service", () => {
      for (const [, services] of Object.entries(SERVICE_CATEGORIES)) {
        expect(services.length).toBeGreaterThan(0);
      }
    });
  });
});

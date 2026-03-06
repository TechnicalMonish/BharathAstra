import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentService, splitTextIntoSections } from "./documentService";
import { ValidationError } from "../utils/errors";

// Mock pdf-parse
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

// Mock uuid to return predictable values
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

// Mock AWS SDK clients
const mockS3Send = vi.fn().mockResolvedValue({});
const mockDynamoSend = vi.fn().mockResolvedValue({});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn((params) => params),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({ send: mockDynamoSend })),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockDynamoSend })),
  },
  PutCommand: vi.fn((params) => params),
  GetCommand: vi.fn((params) => params),
}));

describe("DocumentService", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  describe("upload", () => {
    it("should reject unsupported file formats", async () => {
      const file = Buffer.from("content");
      await expect(
        service.upload(file, "test.doc", "application/msword"),
      ).rejects.toThrow(ValidationError);
    });

    it("should upload a TXT file successfully", async () => {
      const content = "Hello world, this is a test document.";
      const file = Buffer.from(content);

      const result = await service.upload(file, "test.txt", "text/plain");

      expect(result.status).toBe("success");
      expect(result.name).toBe("test.txt");
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
      expect(result.documentId).toBeDefined();
      expect(mockS3Send).toHaveBeenCalledOnce();
      expect(mockDynamoSend).toHaveBeenCalledOnce();
    });

    it("should upload a PDF file successfully", async () => {
      const pdfParse = (await import("pdf-parse")).default as ReturnType<
        typeof vi.fn
      >;
      pdfParse.mockResolvedValueOnce({
        text: "PDF content here",
        numpages: 5,
      });

      const file = Buffer.from("fake-pdf-content");
      const result = await service.upload(file, "doc.pdf", "application/pdf");

      expect(result.status).toBe("success");
      expect(result.name).toBe("doc.pdf");
      expect(result.pageCount).toBe(5);
      expect(mockS3Send).toHaveBeenCalledOnce();
      expect(mockDynamoSend).toHaveBeenCalledOnce();
    });

    it("should reject PDFs exceeding 100 pages", async () => {
      const pdfParse = (await import("pdf-parse")).default as ReturnType<
        typeof vi.fn
      >;
      pdfParse.mockResolvedValueOnce({
        text: "content",
        numpages: 101,
      });

      const file = Buffer.from("fake-pdf");
      await expect(
        service.upload(file, "big.pdf", "application/pdf"),
      ).rejects.toThrow(ValidationError);
    });

    it("should store file in S3 with correct key pattern", async () => {
      const file = Buffer.from("test content");
      await service.upload(file, "readme.txt", "text/plain");

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: "aws-doc-intelligence-uploads",
          Key: "documents/test-uuid-1234/readme.txt",
          ContentType: "text/plain",
        }),
      );
    });
  });

  describe("getDocument", () => {
    it("should retrieve document metadata from DynamoDB", async () => {
      const mockDoc = {
        documentId: "doc-123",
        name: "test.txt",
        pageCount: 1,
        format: "txt",
        s3Key: "documents/doc-123/test.txt",
        sections: [],
        uploadedAt: "2024-01-01T00:00:00.000Z",
      };
      mockDynamoSend.mockResolvedValueOnce({ Item: mockDoc });

      const result = await service.getDocument("doc-123");
      expect(result).toEqual(mockDoc);
    });

    it("should throw when document is not found", async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });
      await expect(service.getDocument("nonexistent")).rejects.toThrow(
        "not found",
      );
    });
  });
});

describe("splitTextIntoSections", () => {
  it("should split text by markdown headings", () => {
    const text =
      "# Introduction\nSome intro text.\n# Methods\nSome methods text.";
    const sections = splitTextIntoSections(text);

    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("Introduction");
    expect(sections[0].text).toBe("Some intro text.");
    expect(sections[1].heading).toBe("Methods");
    expect(sections[1].text).toBe("Some methods text.");
  });

  it("should split text by all-caps headings", () => {
    const text =
      "INTRODUCTION\nSome intro text.\nMETHODS AND RESULTS\nSome methods text.";
    const sections = splitTextIntoSections(text);

    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("INTRODUCTION");
    expect(sections[1].heading).toBe("METHODS AND RESULTS");
  });

  it("should split text by underline-style headings", () => {
    const text =
      "Introduction\n===\nSome intro text.\nMethods\n---\nSome methods text.";
    const sections = splitTextIntoSections(text);

    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("Introduction");
    expect(sections[1].heading).toBe("Methods");
  });

  it("should return a single section for text with no headings", () => {
    const text = "Just some plain text without any headings at all.";
    const sections = splitTextIntoSections(text);

    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("Introduction");
    expect(sections[0].text).toBe(text);
  });

  it("should return a default section for empty text", () => {
    const sections = splitTextIntoSections("");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("Document");
  });

  it("should assign empty embedding arrays to all sections", () => {
    const text = "# Section 1\nText 1\n# Section 2\nText 2";
    const sections = splitTextIntoSections(text);

    for (const section of sections) {
      expect(section.embedding).toEqual([]);
    }
  });

  it("should assign sectionId to each section", () => {
    const text = "# Heading\nContent here";
    const sections = splitTextIntoSections(text);

    for (const section of sections) {
      expect(section.sectionId).toBeDefined();
      expect(typeof section.sectionId).toBe("string");
    }
  });

  it("should assign pageNumber >= 1 to all sections", () => {
    const text = "# First\nContent\n# Second\nMore content";
    const sections = splitTextIntoSections(text);

    for (const section of sections) {
      expect(section.pageNumber).toBeGreaterThanOrEqual(1);
    }
  });
});

// Feature: aws-doc-intelligence, Property 1: Upload round-trip preserves document content
// **Validates: Requirements 1.1, 1.2**

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import { DocumentService, splitTextIntoSections } from "./documentService";

const { mockPdfParse, mockS3Send, mockDynamoSend } = vi.hoisted(() => ({
  mockPdfParse: vi.fn(),
  mockS3Send: vi.fn().mockResolvedValue({}),
  mockDynamoSend: vi.fn().mockResolvedValue({}),
}));

// Mock pdf-parse
vi.mock("pdf-parse", () => ({
  default: mockPdfParse,
}));

// Mock uuid to return predictable values
vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

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

// Generator: non-empty text content (simulating TXT file content)
const nonEmptyTextArb = fc
  .array(
    fc.stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,\n".split(
          "",
        ),
      ),
      { minLength: 1, maxLength: 200 },
    ),
    { minLength: 1, maxLength: 10 },
  )
  .map((parts) => parts.join("\n"))
  .filter((text) => text.trim().length > 0);

// Generator: valid filenames
const filenameArb = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_-".split("")),
    { minLength: 1, maxLength: 20 },
  )
  .filter((s) => s.trim().length > 0);

// Generator: random page count for PDF mocking (1-100)
const pageCountArb = fc.integer({ min: 1, max: 100 });

describe("Property 1: Upload round-trip preserves document content", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  it("TXT upload produces valid documentId, original filename, pageCount >= 1, and status success", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyTextArb,
        filenameArb,
        async (textContent, baseName) => {
          const filename = `${baseName}.txt`;
          const file = Buffer.from(textContent);

          const result = await service.upload(file, filename, "text/plain");

          // Valid documentId (non-empty string)
          expect(result.documentId).toBeDefined();
          expect(typeof result.documentId).toBe("string");
          expect(result.documentId.length).toBeGreaterThan(0);

          // Original filename preserved
          expect(result.name).toBe(filename);

          // Page count >= 1
          expect(result.pageCount).toBeGreaterThanOrEqual(1);

          // Status is "success"
          expect(result.status).toBe("success");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("PDF upload produces valid documentId, original filename, correct pageCount, and status success", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyTextArb,
        filenameArb,
        pageCountArb,
        async (textContent, baseName, numPages) => {
          const filename = `${baseName}.pdf`;
          const file = Buffer.from("fake-pdf-content");

          // Mock pdf-parse to return the generated text with the random page count
          mockPdfParse.mockResolvedValueOnce({
            text: textContent,
            numpages: numPages,
          });

          const result = await service.upload(
            file,
            filename,
            "application/pdf",
          );

          // Valid documentId
          expect(result.documentId).toBeDefined();
          expect(typeof result.documentId).toBe("string");
          expect(result.documentId.length).toBeGreaterThan(0);

          // Original filename preserved
          expect(result.name).toBe(filename);

          // Page count matches what pdf-parse returned
          expect(result.pageCount).toBe(numPages);

          // Status is "success"
          expect(result.status).toBe("success");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("splitTextIntoSections produces non-empty sections for any non-empty text", () => {
    fc.assert(
      fc.property(nonEmptyTextArb, (textContent) => {
        const sections = splitTextIntoSections(textContent);

        // At least one section
        expect(sections.length).toBeGreaterThanOrEqual(1);

        // Every section has required fields
        for (const section of sections) {
          expect(section.sectionId).toBeDefined();
          expect(typeof section.sectionId).toBe("string");
          expect(section.heading).toBeDefined();
          expect(typeof section.heading).toBe("string");
          expect(section.heading.length).toBeGreaterThan(0);
          expect(section.pageNumber).toBeGreaterThanOrEqual(1);
          expect(typeof section.text).toBe("string");
          expect(section.embedding).toBeDefined();
          expect(Array.isArray(section.embedding)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
// Feature: aws-doc-intelligence, Property 2: Unsupported format rejection
// **Validates: Requirements 1.3**

describe("Property 2: Unsupported format rejection", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  // Generator: MIME types that are NOT application/pdf or text/plain
  const unsupportedMimeTypeArb = fc
    .stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789/-+.".split("")),
      { minLength: 1, maxLength: 50 },
    )
    .filter((mime) => mime !== "application/pdf" && mime !== "text/plain");

  // Generator: random file content as Buffer
  const fileBufferArb = fc
    .uint8Array({ minLength: 1, maxLength: 100 })
    .map((arr) => Buffer.from(arr));

  // Generator: random filename
  const randomFilenameArb = fc
    .stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_-.".split("")),
      { minLength: 1, maxLength: 30 },
    )
    .filter((s) => s.trim().length > 0)
    .map((name) => `${name}.dat`);

  it("rejects upload with a ValidationError containing UNSUPPORTED_FORMAT code for any non-PDF/TXT MIME type", async () => {
    const { ValidationError, ErrorCodes } = await import("../utils/errors");

    await fc.assert(
      fc.asyncProperty(
        fileBufferArb,
        randomFilenameArb,
        unsupportedMimeTypeArb,
        async (file, filename, mimeType) => {
          try {
            await service.upload(file, filename, mimeType);
            // Should never reach here
            expect.unreachable(
              "Expected upload to throw for unsupported MIME type",
            );
          } catch (error) {
            // Must be a ValidationError
            expect(error).toBeInstanceOf(ValidationError);

            const validationError = error as InstanceType<
              typeof ValidationError
            >;

            // Error code must be UNSUPPORTED_FORMAT
            expect(validationError.code).toBe(ErrorCodes.UNSUPPORTED_FORMAT);

            // Error message must list supported formats
            expect(validationError.message).toContain("PDF");
            expect(validationError.message).toContain("TXT");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 3: Upload confirmation contains document metadata
// **Validates: Requirements 1.5**

describe("Property 3: Upload confirmation contains document metadata", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  // Generator: non-empty text content for documents
  const docTextArb = fc
    .array(
      fc.stringOf(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,\n".split(
            "",
          ),
        ),
        { minLength: 1, maxLength: 200 },
      ),
      { minLength: 1, maxLength: 10 },
    )
    .map((parts) => parts.join("\n"))
    .filter((text) => text.trim().length > 0);

  // Generator: valid base filenames
  const baseNameArb = fc
    .stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_-".split("")),
      { minLength: 1, maxLength: 20 },
    )
    .filter((s) => s.trim().length > 0);

  // Generator: random page count for PDF (1-100)
  const pdfPageCountArb = fc.integer({ min: 1, max: 100 });

  it("TXT upload response contains the original filename and accurate page count", async () => {
    await fc.assert(
      fc.asyncProperty(
        docTextArb,
        baseNameArb,
        async (textContent, baseName) => {
          const filename = `${baseName}.txt`;
          const file = Buffer.from(textContent);

          const result = await service.upload(file, filename, "text/plain");

          // Response must contain the original filename
          expect(result.name).toBe(filename);

          // Page count must be accurate: for TXT, 1 page per ~3000 chars, minimum 1
          const expectedPageCount = Math.max(
            1,
            Math.ceil(Buffer.from(textContent).toString("utf-8").length / 3000),
          );
          expect(result.pageCount).toBe(expectedPageCount);

          // Response must have status success
          expect(result.status).toBe("success");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("PDF upload response contains the original filename and accurate page count from parser", async () => {
    await fc.assert(
      fc.asyncProperty(
        docTextArb,
        baseNameArb,
        pdfPageCountArb,
        async (textContent, baseName, numPages) => {
          const filename = `${baseName}.pdf`;
          const file = Buffer.from("fake-pdf-content");

          // Mock pdf-parse to return the generated text with the random page count
          mockPdfParse.mockResolvedValueOnce({
            text: textContent,
            numpages: numPages,
          });

          const result = await service.upload(
            file,
            filename,
            "application/pdf",
          );

          // Response must contain the original filename exactly
          expect(result.name).toBe(filename);

          // Page count must match what pdf-parse reported
          expect(result.pageCount).toBe(numPages);

          // Response must have status success
          expect(result.status).toBe("success");
        },
      ),
      { numRuns: 100 },
    );
  });
});

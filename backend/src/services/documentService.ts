import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import pdfParse from "pdf-parse";
import { UploadResponse } from "../types";
import { DocumentMetadata, DocumentSection } from "../types/models";
import { validateFileFormat, validatePageCount } from "../utils/validation";
import { ServiceUnavailableError } from "../utils/errors";

const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE || "Documents";
const S3_BUCKET = process.env.S3_BUCKET || "aws-doc-intelligence-uploads";

export interface IDocumentService {
  upload(
    file: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<UploadResponse>;
  getDocument(documentId: string): Promise<DocumentMetadata>;
}

export class DocumentService implements IDocumentService {
  private s3Client: S3Client;
  private docClient: DynamoDBDocumentClient;

  constructor(s3Client?: S3Client, dynamoClient?: DynamoDBClient) {
    this.s3Client = s3Client || new S3Client({});
    const ddbClient = dynamoClient || new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(ddbClient);
  }

  async upload(
    file: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<UploadResponse> {
    // Validate file format
    validateFileFormat(mimeType);

    // Extract text and compute page count
    const { text, pageCount } = await this.extractText(file, mimeType);

    // Validate page count
    validatePageCount(pageCount);

    const documentId = uuidv4();
    const s3Key = `documents/${documentId}/${filename}`;

    // Upload raw file to S3
    await this.uploadToS3(file, s3Key, mimeType);

    // Split text into sections
    const sections = splitTextIntoSections(text);

    // Store metadata + sections in DynamoDB
    const metadata: DocumentMetadata = {
      documentId,
      name: filename,
      pageCount,
      format: mimeType === "application/pdf" ? "pdf" : "txt",
      s3Key,
      sections,
      uploadedAt: new Date().toISOString(),
    };

    await this.storeMetadata(metadata);

    return {
      documentId,
      name: filename,
      pageCount,
      status: "success",
    };
  }

  async getDocument(documentId: string): Promise<DocumentMetadata> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: DOCUMENTS_TABLE,
          Key: { documentId },
        }),
      );

      if (!result.Item) {
        throw new Error(`Document ${documentId} not found`);
      }

      return result.Item as DocumentMetadata;
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      throw new ServiceUnavailableError(
        "Service temporarily unavailable. Please retry in a few moments.",
      );
    }
  }

  private async extractText(
    file: Buffer,
    mimeType: string,
  ): Promise<{ text: string; pageCount: number }> {
    if (mimeType === "application/pdf") {
      return this.extractPdfText(file);
    }
    return this.extractTxtText(file);
  }

  private async extractPdfText(
    file: Buffer,
  ): Promise<{ text: string; pageCount: number }> {
    try {
      const parsed = await pdfParse(file);
      return {
        text: parsed.text,
        pageCount: parsed.numpages,
      };
    } catch {
      throw new ServiceUnavailableError(
        "Service temporarily unavailable. Please retry in a few moments.",
      );
    }
  }

  private extractTxtText(file: Buffer): { text: string; pageCount: number } {
    const text = file.toString("utf-8");
    // For TXT files, estimate 1 page per ~3000 characters, minimum 1 page
    const pageCount = Math.max(1, Math.ceil(text.length / 3000));
    return { text, pageCount };
  }

  private async uploadToS3(
    file: Buffer,
    s3Key: string,
    mimeType: string,
  ): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: file,
          ContentType: mimeType,
        }),
      );
    } catch {
      throw new ServiceUnavailableError(
        "Service temporarily unavailable. Please retry in a few moments.",
      );
    }
  }

  private async storeMetadata(metadata: DocumentMetadata): Promise<void> {
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: DOCUMENTS_TABLE,
          Item: metadata,
        }),
      );
    } catch {
      throw new ServiceUnavailableError(
        "Service temporarily unavailable. Please retry in a few moments.",
      );
    }
  }
}

/**
 * Determines if a line is a heading.
 * Matches:
 * - Lines starting with # (Markdown headings)
 * - All-caps lines (at least 3 chars, only letters/spaces/numbers)
 * - Lines followed by === or --- (detected via next line)
 */
function isHeadingLine(line: string, nextLine?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Markdown headings: lines starting with #
  if (/^#{1,6}\s+/.test(trimmed)) return true;

  // Underline-style headings: next line is all === or ---
  if (nextLine) {
    const nextTrimmed = nextLine.trim();
    if (/^={3,}$/.test(nextTrimmed) || /^-{3,}$/.test(nextTrimmed)) {
      return true;
    }
  }

  // All-caps lines (at least 3 word characters, no lowercase)
  if (
    trimmed.length >= 3 &&
    /^[A-Z0-9\s:.\-]+$/.test(trimmed) &&
    /[A-Z]{2,}/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Cleans a heading line by removing markdown # prefixes.
 */
function cleanHeading(line: string): string {
  return line.trim().replace(/^#{1,6}\s+/, "");
}

/**
 * Splits document text into sections based on headings.
 * Each section gets a sectionId, heading, pageNumber, text, and empty embedding array.
 */
export function splitTextIntoSections(text: string): DocumentSection[] {
  if (!text || !text.trim()) {
    return [
      {
        sectionId: uuidv4(),
        heading: "Document",
        pageNumber: 1,
        text: text || "",
        embedding: [],
      },
    ];
  }

  const lines = text.split("\n");
  const sections: DocumentSection[] = [];
  let currentHeading = "Introduction";
  let currentLines: string[] = [];
  let currentPage = 1;
  let headingPage = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined;

    if (isHeadingLine(line, nextLine)) {
      // Save previous section if it has content
      if (currentLines.length > 0) {
        const sectionText = currentLines.join("\n").trim();
        if (sectionText) {
          sections.push({
            sectionId: uuidv4(),
            heading: currentHeading,
            pageNumber: headingPage,
            text: sectionText,
            embedding: [],
          });
        }
      }

      currentHeading = cleanHeading(line);
      currentLines = [];
      headingPage = currentPage;

      // Skip the underline line for === or --- style headings
      if (nextLine) {
        const nextTrimmed = nextLine.trim();
        if (/^={3,}$/.test(nextTrimmed) || /^-{3,}$/.test(nextTrimmed)) {
          i++; // skip underline
        }
      }
    } else {
      currentLines.push(line);
    }

    // Estimate page breaks (~3000 chars per page)
    if (line.includes("\f")) {
      currentPage++;
    }
  }

  // Push the last section
  if (currentLines.length > 0) {
    const sectionText = currentLines.join("\n").trim();
    if (sectionText) {
      sections.push({
        sectionId: uuidv4(),
        heading: currentHeading,
        pageNumber: headingPage,
        text: sectionText,
        embedding: [],
      });
    }
  }

  // If no sections were created, create a single section with all text
  if (sections.length === 0) {
    sections.push({
      sectionId: uuidv4(),
      heading: "Document",
      pageNumber: 1,
      text: text.trim(),
      embedding: [],
    });
  }

  return sections;
}

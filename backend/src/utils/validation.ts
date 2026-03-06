import { ValidationError, ErrorCodes } from "./errors";

const SUPPORTED_MIME_TYPES = ["application/pdf", "text/plain"];
const MAX_PAGE_COUNT = 100;
const MAX_QUERY_LENGTH = 500;
const MAX_SPECIFICATION_LENGTH = 2000;

/**
 * Validates that the file MIME type is a supported format (PDF or TXT).
 * @throws ValidationError with UNSUPPORTED_FORMAT if the MIME type is not supported
 */
export function validateFileFormat(mimeType: string): void {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new ValidationError(
      `Unsupported file format. Supported formats: PDF (application/pdf), TXT (text/plain).`,
      ErrorCodes.UNSUPPORTED_FORMAT,
    );
  }
}

/**
 * Validates that the document page count does not exceed the maximum allowed.
 * @throws ValidationError with DOCUMENT_TOO_LARGE if page count exceeds 100
 */
export function validatePageCount(pageCount: number): void {
  if (pageCount > MAX_PAGE_COUNT) {
    throw new ValidationError(
      `Document exceeds the maximum allowed size of ${MAX_PAGE_COUNT} pages.`,
      ErrorCodes.DOCUMENT_TOO_LARGE,
    );
  }
}

/**
 * Validates that the query string is non-empty and within the max length.
 * @throws ValidationError with EMPTY_QUERY if empty, QUERY_TOO_LONG if > 500 chars
 */
export function validateQuery(query: string): void {
  if (!query || query.trim().length === 0) {
    throw new ValidationError("Query cannot be empty.", ErrorCodes.EMPTY_QUERY);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(
      `Query exceeds the maximum length of ${MAX_QUERY_LENGTH} characters.`,
      ErrorCodes.QUERY_TOO_LONG,
    );
  }
}

/**
 * Validates that the cost specification is non-empty and within the max length.
 * @throws ValidationError with EMPTY_QUERY if empty, SPECIFICATION_TOO_LONG if > 2000 chars
 */
export function validateCostSpecification(specification: string): void {
  if (!specification || specification.trim().length === 0) {
    throw new ValidationError(
      "Cost specification cannot be empty.",
      ErrorCodes.EMPTY_QUERY,
    );
  }
  if (specification.length > MAX_SPECIFICATION_LENGTH) {
    throw new ValidationError(
      `Cost specification exceeds the maximum length of ${MAX_SPECIFICATION_LENGTH} characters.`,
      ErrorCodes.SPECIFICATION_TOO_LONG,
    );
  }
}

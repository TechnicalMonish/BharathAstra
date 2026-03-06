import { Request, Response, NextFunction } from "express";
import { ErrorResponse } from "../types";
import { AppError, ErrorCodes } from "../utils/errors";

/**
 * Sanitize a string by removing sensitive internal details:
 * - AWS ARNs (arn:aws:...)
 * - AWS account IDs (12-digit numbers in ARN-like contexts)
 * - File paths (Unix and Windows)
 * - Stack traces
 * - Internal service names (e.g., "AmazonS3Exception", "DynamoDBClient")
 * - Exception class names
 */
export function sanitizeMessage(message: string): string {
  let sanitized = message;

  // Remove AWS ARNs - covers standard and S3-style ARNs (arn:aws:s3:::bucket)
  sanitized = sanitized.replace(
    /arn:aws[a-zA-Z-]*:[a-zA-Z0-9-]*:[a-zA-Z0-9-]*:[^:\s]*:[^\s,)}\]"']*/g,
    "[REDACTED_ARN]",
  );

  // Remove AWS account IDs (standalone 12-digit numbers)
  sanitized = sanitized.replace(/\b\d{12}\b/g, "[REDACTED_ACCOUNT_ID]");

  // Remove internal AWS SDK / service exception class names (before path stripping)
  sanitized = sanitized.replace(
    /\b[A-Z][a-zA-Z0-9]*(?:Exception|Error|Fault|Client|Service)\b/g,
    "[REDACTED]",
  );

  // Remove Unix file paths (e.g., /home/user/..., /var/log/...)
  sanitized = sanitized.replace(
    /(?:\/[a-zA-Z0-9._-]+){2,}(?:\/[a-zA-Z0-9._-]*)?/g,
    "[REDACTED_PATH]",
  );

  // Remove Windows file paths (e.g., C:\Users\..., D:\projects\...)
  sanitized = sanitized.replace(
    /[A-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/gi,
    "[REDACTED_PATH]",
  );

  // Remove stack trace lines (at Module._compile (...), at Object.<anonymous> (...))
  sanitized = sanitized.replace(/\s*at\s+[\w.<>\[\]]+\s*\([^)]*\)/g, "");
  sanitized = sanitized.replace(/\s*at\s+[\w.<>\[\]]+\s+[^\s]+:\d+:\d+/g, "");

  // Clean up multiple spaces and trim
  sanitized = sanitized.replace(/\s{2,}/g, " ").trim();

  return sanitized;
}

/**
 * Map known error types to user-friendly messages.
 * This ensures internal details never leak to the client.
 */
function getUserMessage(err: Error): string {
  if (err instanceof AppError) {
    // AppError messages are already user-facing safe
    return sanitizeMessage(err.message);
  }

  // For unknown errors, return a generic message
  return "Something went wrong. Please try again later.";
}

/**
 * Express error-handling middleware.
 * Catches all errors, sanitizes them, and returns a consistent ErrorResponse.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log the full error internally for debugging
  console.error("[ErrorHandler]", {
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...(err instanceof AppError && {
      code: err.code,
      statusCode: err.statusCode,
    }),
  });

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : ErrorCodes.INTERNAL_ERROR;
  const retryable = err instanceof AppError ? err.retryable : false;
  const message = getUserMessage(err);

  const response: ErrorResponse = {
    error: {
      code,
      message,
      retryable,
    },
  };

  res.status(statusCode).json(response);
}

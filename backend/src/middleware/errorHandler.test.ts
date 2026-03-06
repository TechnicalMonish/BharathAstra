import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { errorHandler, sanitizeMessage } from "./errorHandler";
import {
  ValidationError,
  ServiceUnavailableError,
  TimeoutError,
  ProcessingError,
  ErrorCodes,
} from "../utils/errors";

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const mockReq = {} as Request;
const mockNext = vi.fn() as NextFunction;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sanitizeMessage", () => {
  it("should strip AWS ARNs", () => {
    const msg = "Access denied for arn:aws:s3:::my-bucket/key";
    expect(sanitizeMessage(msg)).not.toContain("arn:aws");
  });

  it("should strip AWS account IDs (12-digit numbers)", () => {
    const msg = "Account 123456789012 is not authorized";
    expect(sanitizeMessage(msg)).not.toContain("123456789012");
  });

  it("should strip Unix file paths", () => {
    const msg = "Error at /home/user/project/src/index.ts";
    expect(sanitizeMessage(msg)).not.toContain("/home/user");
  });

  it("should strip Windows file paths", () => {
    const msg = "Error at C:\\Users\\dev\\project\\src\\index.ts";
    expect(sanitizeMessage(msg)).not.toContain("C:\\Users");
  });

  it("should strip stack trace lines", () => {
    const msg = "Error occurred at Object.<anonymous> (/app/src/index.ts:10:5)";
    const sanitized = sanitizeMessage(msg);
    expect(sanitized).not.toContain("Object.<anonymous>");
    expect(sanitized).not.toContain(":10:5");
  });

  it("should strip exception class names", () => {
    const msg = "AmazonS3Exception: bucket not found";
    const sanitized = sanitizeMessage(msg);
    expect(sanitized).not.toContain("AmazonS3Exception");
  });

  it("should strip internal service client names", () => {
    const msg = "DynamoDBClient failed to connect";
    const sanitized = sanitizeMessage(msg);
    expect(sanitized).not.toContain("DynamoDBClient");
  });

  it("should handle a message with multiple sensitive items", () => {
    const msg =
      "AmazonS3Exception at /home/user/app.ts for arn:aws:s3:::bucket in account 123456789012";
    const sanitized = sanitizeMessage(msg);
    expect(sanitized).not.toContain("AmazonS3Exception");
    expect(sanitized).not.toContain("/home/user");
    expect(sanitized).not.toContain("arn:aws");
    expect(sanitized).not.toContain("123456789012");
  });

  it("should return a clean message unchanged", () => {
    const msg = "File format not supported. Please upload PDF or TXT.";
    expect(sanitizeMessage(msg)).toBe(msg);
  });
});

describe("errorHandler middleware", () => {
  it("should return 400 for ValidationError", () => {
    const err = new ValidationError(
      "Unsupported file format. Supported formats: PDF, TXT",
      ErrorCodes.UNSUPPORTED_FORMAT,
    );
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "UNSUPPORTED_FORMAT",
        message: "Unsupported file format. Supported formats: PDF, TXT",
        retryable: false,
      },
    });
  });

  it("should return 503 for ServiceUnavailableError", () => {
    const err = new ServiceUnavailableError();
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message:
          "Service temporarily unavailable. Please retry in a few moments.",
        retryable: true,
      },
    });
  });

  it("should return 504 for TimeoutError", () => {
    const err = new TimeoutError();
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "TIMEOUT",
        message: "Search timed out. Please try again.",
        retryable: true,
      },
    });
  });

  it("should return 502 for ProcessingError", () => {
    const err = new ProcessingError();
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "PROCESSING_ERROR",
        message: "Unable to process your request. Please try again.",
        retryable: true,
      },
    });
  });

  it("should return 500 with generic message for unknown errors", () => {
    const err = new Error("Some internal crash with /var/log/app.log details");
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    const response = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response.error.code).toBe("INTERNAL_ERROR");
    expect(response.error.message).toBe(
      "Something went wrong. Please try again later.",
    );
    expect(response.error.retryable).toBe(false);
  });

  it("should sanitize AppError messages containing sensitive data", () => {
    const err = new ValidationError(
      "Failed for arn:aws:s3:::my-bucket/key at /home/user/app.ts",
      ErrorCodes.UNSUPPORTED_FORMAT,
    );
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    const response = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response.error.message).not.toContain("arn:aws");
    expect(response.error.message).not.toContain("/home/user");
  });

  it("should not expose stack traces for any error type", () => {
    const err = new Error("crash");
    err.stack =
      "Error: crash\n    at Object.<anonymous> (/app/src/index.ts:10:5)";
    const res = createMockRes();

    errorHandler(err, mockReq, res, mockNext);

    const response = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response.error.message).not.toContain("Object.<anonymous>");
    expect(response.error.message).not.toContain("/app/src");
  });
});

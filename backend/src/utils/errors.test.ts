import { describe, it, expect } from "vitest";
import {
  ErrorCodes,
  AppError,
  ValidationError,
  ServiceUnavailableError,
  TimeoutError,
  ProcessingError,
} from "./errors";

describe("ErrorCodes", () => {
  it("should define all required error codes", () => {
    expect(ErrorCodes.UNSUPPORTED_FORMAT).toBe("UNSUPPORTED_FORMAT");
    expect(ErrorCodes.DOCUMENT_TOO_LARGE).toBe("DOCUMENT_TOO_LARGE");
    expect(ErrorCodes.EMPTY_QUERY).toBe("EMPTY_QUERY");
    expect(ErrorCodes.QUERY_TOO_LONG).toBe("QUERY_TOO_LONG");
    expect(ErrorCodes.SPECIFICATION_TOO_LONG).toBe("SPECIFICATION_TOO_LONG");
    expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE");
    expect(ErrorCodes.TIMEOUT).toBe("TIMEOUT");
    expect(ErrorCodes.PROCESSING_ERROR).toBe("PROCESSING_ERROR");
    expect(ErrorCodes.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });
});

describe("ValidationError", () => {
  it("should create a validation error with correct defaults", () => {
    const err = new ValidationError(
      "File format not supported",
      ErrorCodes.UNSUPPORTED_FORMAT,
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("File format not supported");
    expect(err.code).toBe("UNSUPPORTED_FORMAT");
    expect(err.statusCode).toBe(400);
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("ValidationError");
  });

  it("should default to INTERNAL_ERROR code when none provided", () => {
    const err = new ValidationError("Something invalid");
    expect(err.code).toBe("INTERNAL_ERROR");
  });
});

describe("ServiceUnavailableError", () => {
  it("should create with default message and retryable=true", () => {
    const err = new ServiceUnavailableError();
    expect(err.message).toBe(
      "Service temporarily unavailable. Please retry in a few moments.",
    );
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
    expect(err.statusCode).toBe(503);
    expect(err.retryable).toBe(true);
  });

  it("should accept a custom message", () => {
    const err = new ServiceUnavailableError("S3 is down");
    expect(err.message).toBe("S3 is down");
  });
});

describe("TimeoutError", () => {
  it("should create with default message and retryable=true", () => {
    const err = new TimeoutError();
    expect(err.message).toBe("Search timed out. Please try again.");
    expect(err.code).toBe("TIMEOUT");
    expect(err.statusCode).toBe(504);
    expect(err.retryable).toBe(true);
  });
});

describe("ProcessingError", () => {
  it("should create with default message and retryable=true", () => {
    const err = new ProcessingError();
    expect(err.message).toBe(
      "Unable to process your request. Please try again.",
    );
    expect(err.code).toBe("PROCESSING_ERROR");
    expect(err.statusCode).toBe(502);
    expect(err.retryable).toBe(true);
  });
});

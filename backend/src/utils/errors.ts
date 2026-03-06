// Custom error classes and error codes for AWS Doc Intelligence

export const ErrorCodes = {
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  DOCUMENT_TOO_LARGE: "DOCUMENT_TOO_LARGE",
  EMPTY_QUERY: "EMPTY_QUERY",
  QUERY_TOO_LONG: "QUERY_TOO_LONG",
  SPECIFICATION_TOO_LONG: "SPECIFICATION_TOO_LONG",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  PROCESSING_ERROR: "PROCESSING_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    retryable: boolean,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCodes.INTERNAL_ERROR) {
    super(message, code, 400, false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = "Service temporarily unavailable. Please retry in a few moments.",
  ) {
    super(message, ErrorCodes.SERVICE_UNAVAILABLE, 503, true);
  }
}

export class TimeoutError extends AppError {
  constructor(message: string = "Search timed out. Please try again.") {
    super(message, ErrorCodes.TIMEOUT, 504, true);
  }
}

export class ProcessingError extends AppError {
  constructor(
    message: string = "Unable to process your request. Please try again.",
  ) {
    super(message, ErrorCodes.PROCESSING_ERROR, 502, true);
  }
}

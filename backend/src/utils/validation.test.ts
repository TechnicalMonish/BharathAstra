import { describe, it, expect } from "vitest";
import {
  validateFileFormat,
  validatePageCount,
  validateQuery,
  validateCostSpecification,
} from "./validation";
import { ValidationError, ErrorCodes } from "./errors";

describe("validateFileFormat", () => {
  it("accepts application/pdf", () => {
    expect(() => validateFileFormat("application/pdf")).not.toThrow();
  });

  it("accepts text/plain", () => {
    expect(() => validateFileFormat("text/plain")).not.toThrow();
  });

  it("rejects unsupported MIME types", () => {
    expect(() => validateFileFormat("image/png")).toThrow(ValidationError);
    try {
      validateFileFormat("image/png");
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.UNSUPPORTED_FORMAT);
      expect(err.message).toContain("Unsupported file format");
    }
  });

  it("rejects empty string", () => {
    expect(() => validateFileFormat("")).toThrow(ValidationError);
  });
});

describe("validatePageCount", () => {
  it("accepts page count of 1", () => {
    expect(() => validatePageCount(1)).not.toThrow();
  });

  it("accepts page count of 100", () => {
    expect(() => validatePageCount(100)).not.toThrow();
  });

  it("rejects page count of 101", () => {
    expect(() => validatePageCount(101)).toThrow(ValidationError);
    try {
      validatePageCount(101);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.DOCUMENT_TOO_LARGE);
    }
  });
});

describe("validateQuery", () => {
  it("accepts a valid query", () => {
    expect(() => validateQuery("AWS Lambda pricing")).not.toThrow();
  });

  it("accepts a query at max length (500 chars)", () => {
    const query = "a".repeat(500);
    expect(() => validateQuery(query)).not.toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => validateQuery("")).toThrow(ValidationError);
    try {
      validateQuery("");
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.EMPTY_QUERY);
    }
  });

  it("rejects a whitespace-only string", () => {
    expect(() => validateQuery("   ")).toThrow(ValidationError);
    try {
      validateQuery("   ");
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.EMPTY_QUERY);
    }
  });

  it("rejects a query exceeding 500 characters", () => {
    const query = "a".repeat(501);
    expect(() => validateQuery(query)).toThrow(ValidationError);
    try {
      validateQuery(query);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.QUERY_TOO_LONG);
    }
  });
});

describe("validateCostSpecification", () => {
  it("accepts a valid specification", () => {
    expect(() =>
      validateCostSpecification("I need S3 storage and a micro EC2 instance"),
    ).not.toThrow();
  });

  it("accepts a specification at max length (2000 chars)", () => {
    const spec = "a".repeat(2000);
    expect(() => validateCostSpecification(spec)).not.toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => validateCostSpecification("")).toThrow(ValidationError);
    try {
      validateCostSpecification("");
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.EMPTY_QUERY);
    }
  });

  it("rejects a whitespace-only string", () => {
    expect(() => validateCostSpecification("   ")).toThrow(ValidationError);
    try {
      validateCostSpecification("   ");
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.EMPTY_QUERY);
    }
  });

  it("rejects a specification exceeding 2000 characters", () => {
    const spec = "a".repeat(2001);
    expect(() => validateCostSpecification(spec)).toThrow(ValidationError);
    try {
      validateCostSpecification(spec);
    } catch (e) {
      const err = e as ValidationError;
      expect(err.code).toBe(ErrorCodes.SPECIFICATION_TOO_LONG);
    }
  });
});

// Feature: aws-doc-intelligence, Property 15: Error messages do not expose internal details
// **Validates: Requirements 8.1, 8.3**

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeMessage } from "./errorHandler";

// --- Generators for sensitive patterns ---

const alphaChars = fc.constantFrom(..."abcdefghijklmnop".split(""));
const digitChars = fc.constantFrom(..."0123456789".split(""));

const arnArb = fc
  .tuple(
    fc.constantFrom("s3", "lambda", "dynamodb", "iam", "ec2", "bedrock"),
    fc.constantFrom("us-east-1", "us-west-2", "ap-south-1", "eu-west-1", ""),
    fc.stringOf(digitChars, { minLength: 12, maxLength: 12 }),
    fc.stringOf(fc.constantFrom(..."abcdef0123-/:".split("")), {
      minLength: 4,
      maxLength: 30,
    }),
  )
  .map(([svc, region, acct, res]) => `arn:aws:${svc}:${region}:${acct}:${res}`);

const s3ArnArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(..."abcdefghijklm-".split("")), {
      minLength: 3,
      maxLength: 20,
    }),
    fc.stringOf(fc.constantFrom(..."abcdefghijklm/.".split("")), {
      minLength: 1,
      maxLength: 20,
    }),
  )
  .map(([bucket, key]) => `arn:aws:s3:::${bucket}/${key}`);

const accountIdArb = fc
  .stringOf(digitChars, { minLength: 12, maxLength: 12 })
  .filter((s) => s.length === 12);

const unixPathArb = fc
  .tuple(
    fc.constantFrom("/home", "/var", "/usr", "/app", "/opt", "/tmp"),
    fc.array(fc.stringOf(alphaChars, { minLength: 1, maxLength: 12 }), {
      minLength: 1,
      maxLength: 4,
    }),
  )
  .map(([root, segs]) => `${root}/${segs.join("/")}`);

const windowsPathArb = fc
  .tuple(
    fc.constantFrom("C", "D", "E"),
    fc.array(fc.stringOf(alphaChars, { minLength: 1, maxLength: 12 }), {
      minLength: 1,
      maxLength: 4,
    }),
  )
  .map(([drive, segs]) => `${drive}:\\${segs.join("\\")}`);

const stackTraceLineArb = fc
  .tuple(
    fc.constantFrom(
      "Object.<anonymous>",
      "Module._compile",
      "Function.Module._load",
      "Router.handle",
    ),
    unixPathArb,
    fc.integer({ min: 1, max: 500 }),
    fc.integer({ min: 1, max: 80 }),
  )
  .map(([fn, path, line, col]) => `at ${fn} (${path}:${line}:${col})`);

const exceptionClassArb = fc.constantFrom(
  "AmazonS3Exception",
  "DynamoDBClient",
  "BedrockRuntimeClient",
  "LambdaService",
  "S3ServiceException",
  "ResourceNotFoundException",
  "ThrottlingException",
  "AccessDeniedError",
  "InternalServerError",
  "ValidationException",
  "ServiceUnavailableFault",
  "CredentialsError",
  "DynamoDBService",
);

// --- Detection patterns for sensitive content ---

const sensitivePatterns = {
  arn: /arn:aws[a-zA-Z-]*:[a-zA-Z0-9-]*/,
  accountId: /\b\d{12}\b/,
  unixPath: /(?:\/[a-zA-Z0-9._-]+){2,}/,
  windowsPath: /[A-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+/i,
  stackTrace: /\bat\s+[\w.<>\[\]]+\s*\(/,
  exceptionClass:
    /\b[A-Z][a-zA-Z0-9]*(?:Exception|Error|Fault|Client|Service)\b/,
};

function assertNoSensitiveContent(sanitized: string): void {
  expect(sanitized).not.toMatch(sensitivePatterns.arn);
  expect(sanitized).not.toMatch(sensitivePatterns.accountId);
  expect(sanitized).not.toMatch(sensitivePatterns.unixPath);
  expect(sanitized).not.toMatch(sensitivePatterns.windowsPath);
  expect(sanitized).not.toMatch(sensitivePatterns.stackTrace);
  expect(sanitized).not.toMatch(sensitivePatterns.exceptionClass);
}

// --- Property tests ---

describe("Property 15: Error messages do not expose internal details", () => {
  it("should strip AWS ARNs from error messages", () => {
    fc.assert(
      fc.property(
        fc.oneof(arnArb, s3ArnArb),
        fc.string({ minLength: 0, maxLength: 50 }),
        (arn, prefix) => {
          const message = `${prefix} Failed due to ${arn} access denied`;
          const sanitized = sanitizeMessage(message);
          assertNoSensitiveContent(sanitized);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should strip AWS account IDs from error messages", () => {
    fc.assert(
      fc.property(accountIdArb, (accountId) => {
        const message = `Error in account ${accountId}: permission denied`;
        const sanitized = sanitizeMessage(message);
        expect(sanitized).not.toMatch(/\b\d{12}\b/);
      }),
      { numRuns: 100 },
    );
  });

  it("should strip Unix file paths from error messages", () => {
    fc.assert(
      fc.property(unixPathArb, (path) => {
        const message = `Error reading file at ${path}`;
        const sanitized = sanitizeMessage(message);
        expect(sanitized).not.toMatch(sensitivePatterns.unixPath);
      }),
      { numRuns: 100 },
    );
  });

  it("should strip Windows file paths from error messages", () => {
    fc.assert(
      fc.property(windowsPathArb, (path) => {
        const message = `Cannot find module at ${path}`;
        const sanitized = sanitizeMessage(message);
        expect(sanitized).not.toMatch(sensitivePatterns.windowsPath);
      }),
      { numRuns: 100 },
    );
  });

  it("should strip stack trace lines from error messages", () => {
    fc.assert(
      fc.property(
        fc.array(stackTraceLineArb, { minLength: 1, maxLength: 5 }),
        (stackLines) => {
          const message = `Unexpected error\n${stackLines.join("\n")}`;
          const sanitized = sanitizeMessage(message);
          expect(sanitized).not.toMatch(sensitivePatterns.stackTrace);
          expect(sanitized).not.toMatch(sensitivePatterns.unixPath);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should strip exception class names from error messages", () => {
    fc.assert(
      fc.property(exceptionClassArb, (exceptionName) => {
        const message = `${exceptionName}: request failed with status 500`;
        const sanitized = sanitizeMessage(message);
        expect(sanitized).not.toMatch(sensitivePatterns.exceptionClass);
      }),
      { numRuns: 100 },
    );
  });

  it("should strip all sensitive patterns from combined error messages", () => {
    fc.assert(
      fc.property(
        fc.oneof(arnArb, s3ArnArb),
        accountIdArb,
        unixPathArb,
        windowsPathArb,
        stackTraceLineArb,
        exceptionClassArb,
        (arn, accountId, unixPath, winPath, stackLine, exceptionName) => {
          const message = [
            `${exceptionName}: Failed to access resource`,
            `ARN: ${arn}`,
            `Account: ${accountId}`,
            `Source: ${unixPath}`,
            `Module: ${winPath}`,
            stackLine,
          ].join("\n");

          const sanitized = sanitizeMessage(message);
          assertNoSensitiveContent(sanitized);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return a non-empty string after sanitization", () => {
    fc.assert(
      fc.property(
        fc.oneof(arnArb, s3ArnArb),
        exceptionClassArb,
        stackTraceLineArb,
        (arn, exceptionName, stackLine) => {
          const message = `Something went wrong: ${exceptionName} at ${arn}\n${stackLine}`;
          const sanitized = sanitizeMessage(message);
          expect(typeof sanitized).toBe("string");
        },
      ),
      { numRuns: 100 },
    );
  });
});

import { describe, it, expect } from "vitest";
import { QueryProcessor } from "./queryProcessor";
import { QueryType } from "@aws-intel/shared";

describe("QueryProcessor", () => {
  const processor = new QueryProcessor();

  describe("processQuery", () => {
    it("returns a ProcessedQuery with all fields populated", () => {
      const result = processor.processQuery(
        "How do I give Lambda permission to read from S3?"
      );

      expect(result.originalQuestion).toBe(
        "How do I give Lambda permission to read from S3?"
      );
      expect(result.normalizedQuestion).toBeDefined();
      expect(result.awsServices).toEqual(
        expect.arrayContaining(["Lambda", "S3"])
      );
      expect(result.concepts).toEqual(
        expect.arrayContaining(["permissions"])
      );
      expect(result.queryType).toBe(QueryType.HOW_TO);
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it("normalizes the question to lowercase without filler words", () => {
      const result = processor.processQuery(
        "How do I configure the S3 bucket?"
      );

      expect(result.normalizedQuestion).not.toContain("how");
      expect(result.normalizedQuestion).not.toContain("the");
      expect(result.normalizedQuestion).toContain("s3");
      expect(result.normalizedQuestion).toContain("bucket");
    });

    it("extracts multiple AWS services from a query", () => {
      const result = processor.processQuery(
        "How to connect Lambda to DynamoDB and S3?"
      );

      expect(result.awsServices).toEqual(
        expect.arrayContaining(["Lambda", "DynamoDB", "S3"])
      );
    });

    it("extracts AWS services from informal language", () => {
      const result = processor.processQuery(
        "How do I set up a serverless API?"
      );

      expect(result.awsServices).toEqual(
        expect.arrayContaining(["Lambda", "API Gateway"])
      );
    });

    it("classifies HOW_TO queries", () => {
      expect(
        processor.processQuery("How do I create a Lambda function?").queryType
      ).toBe(QueryType.HOW_TO);
      expect(
        processor.processQuery("How can I set up S3?").queryType
      ).toBe(QueryType.HOW_TO);
    });

    it("classifies WHAT_IS queries", () => {
      expect(
        processor.processQuery("What is AWS Lambda?").queryType
      ).toBe(QueryType.WHAT_IS);
      expect(
        processor.processQuery("What are IAM roles?").queryType
      ).toBe(QueryType.WHAT_IS);
    });

    it("classifies TROUBLESHOOT queries", () => {
      expect(
        processor.processQuery("Why isn't my Lambda function working?").queryType
      ).toBe(QueryType.TROUBLESHOOT);
      expect(
        processor.processQuery("Fix S3 access denied error").queryType
      ).toBe(QueryType.TROUBLESHOOT);
    });

    it("classifies BEST_PRACTICE queries", () => {
      expect(
        processor.processQuery("Best practices for DynamoDB design?").queryType
      ).toBe(QueryType.BEST_PRACTICE);
      expect(
        processor.processQuery("Recommended approach for IAM policies?").queryType
      ).toBe(QueryType.BEST_PRACTICE);
    });

    it("classifies COMPARISON queries", () => {
      expect(
        processor.processQuery("Difference between ECS and EKS?").queryType
      ).toBe(QueryType.COMPARISON);
      expect(
        processor.processQuery("Compare RDS vs DynamoDB").queryType
      ).toBe(QueryType.COMPARISON);
    });

    it("defaults to HOW_TO for unclassified queries", () => {
      expect(
        processor.processQuery("Lambda S3 integration").queryType
      ).toBe(QueryType.HOW_TO);
    });

    it("extracts concepts from queries", () => {
      const result = processor.processQuery(
        "How to configure encryption for S3?"
      );
      expect(result.concepts).toEqual(
        expect.arrayContaining(["encryption"])
      );
    });

    it("includes service names as keywords", () => {
      const result = processor.processQuery("Set up Lambda with DynamoDB");
      expect(result.keywords).toEqual(
        expect.arrayContaining(["lambda", "dynamodb"])
      );
    });
  });

  describe("suggestCompletions", () => {
    it("returns default suggestions for empty input", () => {
      const suggestions = processor.suggestCompletions("");
      expect(suggestions.length).toBe(5);
    });

    it("filters suggestions matching partial input", () => {
      const suggestions = processor.suggestCompletions("Lambda");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(
        suggestions.some((s) => s.toLowerCase().includes("lambda"))
      ).toBe(true);
    });

    it("generates dynamic suggestions for detected services", () => {
      const suggestions = processor.suggestCompletions("DynamoDB");
      expect(
        suggestions.some((s) => s.includes("DynamoDB"))
      ).toBe(true);
    });

    it("returns at most 10 suggestions", () => {
      const suggestions = processor.suggestCompletions("How");
      expect(suggestions.length).toBeLessThanOrEqual(10);
    });

    it("returns default suggestions for whitespace-only input", () => {
      const suggestions = processor.suggestCompletions("   ");
      expect(suggestions.length).toBe(5);
    });
  });

  describe("mapToAWSTerms", () => {
    it("maps 'serverless' to Lambda, Fargate, API Gateway", () => {
      const terms = processor.mapToAWSTerms("serverless");
      expect(terms).toEqual(
        expect.arrayContaining(["Lambda", "Fargate", "API Gateway"])
      );
    });

    it("maps 'database' to DynamoDB, RDS, Aurora", () => {
      const terms = processor.mapToAWSTerms("database");
      expect(terms).toEqual(
        expect.arrayContaining(["DynamoDB", "RDS", "Aurora"])
      );
    });

    it("maps 'container' to ECS, EKS, Fargate", () => {
      const terms = processor.mapToAWSTerms("container");
      expect(terms).toEqual(
        expect.arrayContaining(["ECS", "EKS", "Fargate"])
      );
    });

    it("maps direct service names", () => {
      const terms = processor.mapToAWSTerms("lambda");
      expect(terms).toEqual(expect.arrayContaining(["Lambda"]));
    });

    it("maps 'permissions' to IAM", () => {
      const terms = processor.mapToAWSTerms("permissions");
      expect(terms).toEqual(expect.arrayContaining(["IAM"]));
    });

    it("returns empty array for unrecognized terms", () => {
      const terms = processor.mapToAWSTerms("xyznonexistent");
      expect(terms).toEqual([]);
    });

    it("handles mixed informal and formal terms", () => {
      const terms = processor.mapToAWSTerms("serverless lambda queue");
      expect(terms).toEqual(
        expect.arrayContaining(["Lambda", "SQS"])
      );
    });
  });
});

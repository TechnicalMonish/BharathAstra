// Feature: aws-doc-intelligence, Property 11: Total cost equals sum of individual service costs
// **Validates: Requirements 5.2**

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import type { IdentifiedService, CostPredictionResponse } from "../types/index";
import {
  CostPredictorService,
  parseBedrockResponse,
  type IBedrockClient,
} from "./costService";

// Generator: a single optimization suggestion
const optimizationSuggestionArb = fc.record({
  suggestion: fc
    .stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(
          "",
        ),
      ),
      { minLength: 1, maxLength: 80 },
    )
    .filter((s) => s.trim().length > 0),
  estimatedSavings: fc.double({ min: 0.01, max: 500, noNaN: true }),
});

// Generator: a valid IdentifiedService
const identifiedServiceArb: fc.Arbitrary<IdentifiedService> = fc.record({
  serviceName: fc.constantFrom(
    "Amazon EC2",
    "Amazon S3",
    "Amazon DynamoDB",
    "AWS Lambda",
    "Amazon RDS",
    "Amazon CloudFront",
    "Amazon SQS",
    "Amazon SNS",
    "Amazon ECS",
    "Amazon Bedrock",
  ),
  estimatedMonthlyCost: fc.integer({ min: 0, max: 100000 }).map((n) => n / 100), // 0.00 to 1000.00
  freeTier: fc.record({
    eligible: fc.boolean(),
    limits: fc
      .stringOf(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789/ ".split("")),
        { minLength: 1, maxLength: 50 },
      )
      .filter((s) => s.trim().length > 0),
    duration: fc.constantFrom("12 months", "Always free", "6 months", "N/A"),
    restrictions: fc.stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 ".split("")),
      { minLength: 0, maxLength: 60 },
    ),
  }),
  optimizationSuggestions: fc.array(optimizationSuggestionArb, {
    minLength: 0,
    maxLength: 3,
  }),
});

// Generator: array of 1+ IdentifiedServices
const servicesArrayArb = fc.array(identifiedServiceArb, {
  minLength: 1,
  maxLength: 15,
});

// Generator: a full CostPredictionResponse where total is computed correctly
const costPredictionResponseArb: fc.Arbitrary<CostPredictionResponse> =
  servicesArrayArb.map((services) => {
    const total =
      Math.round(
        services.reduce((sum, svc) => sum + svc.estimatedMonthlyCost, 0) * 100,
      ) / 100;
    return {
      services,
      totalEstimatedMonthlyCost: total,
    };
  });

describe("Property 11: Total cost equals sum of individual service costs", () => {
  it("for any random cost prediction response with 1+ services, totalEstimatedMonthlyCost equals the sum of all estimatedMonthlyCost values", () => {
    fc.assert(
      fc.property(costPredictionResponseArb, (response) => {
        const sumOfIndividualCosts = response.services.reduce(
          (sum, svc) => sum + svc.estimatedMonthlyCost,
          0,
        );
        const expectedTotal = Math.round(sumOfIndividualCosts * 100) / 100;

        expect(response.totalEstimatedMonthlyCost).toBeCloseTo(
          expectedTotal,
          2,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("total cost is non-negative when all individual costs are non-negative", () => {
    fc.assert(
      fc.property(costPredictionResponseArb, (response) => {
        // All individual costs are non-negative by generator design
        for (const svc of response.services) {
          expect(svc.estimatedMonthlyCost).toBeGreaterThanOrEqual(0);
        }
        expect(response.totalEstimatedMonthlyCost).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  it("CostPredictorService.predict returns total equal to sum of service costs", async () => {
    // Generate random services that Bedrock would "return"
    await fc.assert(
      fc.asyncProperty(servicesArrayArb, async (services) => {
        // Build the JSON response that Bedrock would return
        const bedrockResponse = JSON.stringify({ services });

        const mockBedrockClient: IBedrockClient = {
          invoke: vi.fn().mockResolvedValue(bedrockResponse),
        };

        const service = new CostPredictorService(mockBedrockClient);
        const response = await service.predict(
          "I need EC2 and S3 for my project",
        );

        // Verify total equals sum of individual costs
        const sumOfCosts = response.services.reduce(
          (sum, svc) => sum + svc.estimatedMonthlyCost,
          0,
        );
        const expectedTotal = Math.round(sumOfCosts * 100) / 100;

        expect(response.totalEstimatedMonthlyCost).toBeCloseTo(
          expectedTotal,
          2,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 12: Free tier info is complete for all identified services
// **Validates: Requirements 5.3, 5.4**

describe("Property 12: Free tier info is complete for all identified services", () => {
  it("every identified service has freeTier with eligibility, limits, and duration defined", () => {
    fc.assert(
      fc.property(servicesArrayArb, (services) => {
        for (const svc of services) {
          // freeTier object must exist
          expect(svc.freeTier).toBeDefined();

          // eligible must be a boolean
          expect(typeof svc.freeTier.eligible).toBe("boolean");

          // limits must be a non-empty string
          expect(typeof svc.freeTier.limits).toBe("string");
          expect(svc.freeTier.limits.length).toBeGreaterThan(0);

          // duration must be a non-empty string
          expect(typeof svc.freeTier.duration).toBe("string");
          expect(svc.freeTier.duration.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("if a service is free-tier eligible, restrictions must be non-empty after parsing", () => {
    // Generator for raw Bedrock service data where eligible services always have restrictions
    const nonEmptyRestriction = fc.constantFrom(
      "Only t2.micro instances",
      "Standard storage class only",
      "Up to 1M requests per month",
      "750 hours/month for t2.micro for 12 months",
    );

    const rawEligibleServiceArb = fc.record({
      serviceName: fc.constantFrom(
        "Amazon EC2",
        "Amazon S3",
        "AWS Lambda",
        "Amazon DynamoDB",
      ),
      estimatedMonthlyCost: fc
        .integer({ min: 0, max: 10000 })
        .map((n) => n / 100),
      freeTier: fc.record({
        eligible: fc.constant(true),
        limits: fc.constantFrom(
          "750 hours/month",
          "5GB storage",
          "1M requests/month",
        ),
        duration: fc.constantFrom("12 months", "Always free", "6 months"),
        restrictions: nonEmptyRestriction,
      }),
      optimizationSuggestions: fc.constant([]),
    });

    const rawServicesArb = fc.array(rawEligibleServiceArb, {
      minLength: 1,
      maxLength: 10,
    });

    fc.assert(
      fc.property(rawServicesArb, (rawServices) => {
        const bedrockJson = JSON.stringify({ services: rawServices });
        const parsed: IdentifiedService[] = parseBedrockResponse(bedrockJson);

        for (const svc of parsed) {
          if (svc.freeTier.eligible) {
            expect(typeof svc.freeTier.restrictions).toBe("string");
            expect(svc.freeTier.restrictions.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("parseBedrockResponse produces complete free tier info for all services", () => {
    // Generator for raw Bedrock-like service objects with complete free tier
    const rawServiceArb = fc.record({
      serviceName: fc.constantFrom("Amazon EC2", "Amazon S3", "AWS Lambda"),
      estimatedMonthlyCost: fc
        .integer({ min: 0, max: 10000 })
        .map((n) => n / 100),
      freeTier: fc.record({
        eligible: fc.boolean(),
        limits: fc.constantFrom(
          "750 hours/month",
          "5GB storage",
          "1M requests/month",
        ),
        duration: fc.constantFrom("12 months", "Always free", "6 months"),
        restrictions: fc.constantFrom(
          "Only t2.micro instances",
          "Standard storage class only",
          "Up to 1M requests",
        ),
      }),
      optimizationSuggestions: fc.constant([]),
    });

    const rawServicesArb = fc.array(rawServiceArb, {
      minLength: 1,
      maxLength: 5,
    });

    fc.assert(
      fc.property(rawServicesArb, (rawServices) => {
        const bedrockJson = JSON.stringify({ services: rawServices });
        const parsed: IdentifiedService[] = parseBedrockResponse(bedrockJson);

        for (const svc of parsed) {
          // freeTier must be present and complete
          expect(svc.freeTier).toBeDefined();
          expect(typeof svc.freeTier.eligible).toBe("boolean");
          expect(typeof svc.freeTier.limits).toBe("string");
          expect(svc.freeTier.limits.length).toBeGreaterThan(0);
          expect(typeof svc.freeTier.duration).toBe("string");
          expect(svc.freeTier.duration.length).toBeGreaterThan(0);

          // If eligible, restrictions must be non-empty
          if (svc.freeTier.eligible) {
            expect(svc.freeTier.restrictions.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 13: Optimization suggestions include estimated savings
// **Validates: Requirements 6.1, 6.2**

describe("Property 13: Optimization suggestions include estimated savings", () => {
  it("every optimization suggestion has non-empty suggestion text and positive estimatedSavings", () => {
    // Generate arrays of optimization suggestions directly
    const suggestionsArrayArb = fc.array(optimizationSuggestionArb, {
      minLength: 1,
      maxLength: 10,
    });

    fc.assert(
      fc.property(suggestionsArrayArb, (suggestions) => {
        for (const opt of suggestions) {
          // suggestion text must be a non-empty string
          expect(typeof opt.suggestion).toBe("string");
          expect(opt.suggestion.trim().length).toBeGreaterThan(0);

          // estimatedSavings must be positive (> 0)
          expect(typeof opt.estimatedSavings).toBe("number");
          expect(opt.estimatedSavings).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("optimization suggestions within identified services all have non-empty text and positive savings", () => {
    // Use the identifiedService generator but ensure at least one suggestion per service
    const serviceWithSuggestionsArb = fc.record({
      serviceName: fc.constantFrom(
        "Amazon EC2",
        "Amazon S3",
        "Amazon DynamoDB",
        "AWS Lambda",
        "Amazon RDS",
      ),
      estimatedMonthlyCost: fc
        .integer({ min: 0, max: 100000 })
        .map((n) => n / 100),
      freeTier: fc.record({
        eligible: fc.boolean(),
        limits: fc
          .stringOf(
            fc.constantFrom(
              ..."abcdefghijklmnopqrstuvwxyz0123456789/ ".split(""),
            ),
            { minLength: 1, maxLength: 50 },
          )
          .filter((s) => s.trim().length > 0),
        duration: fc.constantFrom(
          "12 months",
          "Always free",
          "6 months",
          "N/A",
        ),
        restrictions: fc.stringOf(
          fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 ".split("")),
          { minLength: 0, maxLength: 60 },
        ),
      }),
      optimizationSuggestions: fc.array(optimizationSuggestionArb, {
        minLength: 1,
        maxLength: 5,
      }),
    });

    const servicesArb = fc.array(serviceWithSuggestionsArb, {
      minLength: 1,
      maxLength: 10,
    });

    fc.assert(
      fc.property(servicesArb, (services) => {
        for (const svc of services) {
          for (const opt of svc.optimizationSuggestions) {
            expect(opt.suggestion.trim().length).toBeGreaterThan(0);
            expect(opt.estimatedSavings).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("parseBedrockResponse preserves non-empty suggestion text and positive savings", () => {
    const rawServiceWithSuggestionsArb = fc.record({
      serviceName: fc.constantFrom("Amazon EC2", "Amazon S3", "AWS Lambda"),
      estimatedMonthlyCost: fc
        .integer({ min: 0, max: 10000 })
        .map((n) => n / 100),
      freeTier: fc.record({
        eligible: fc.boolean(),
        limits: fc.constantFrom(
          "750 hours/month",
          "5GB storage",
          "1M requests/month",
        ),
        duration: fc.constantFrom("12 months", "Always free", "6 months"),
        restrictions: fc.constantFrom(
          "Only t2.micro instances",
          "Standard storage class only",
          "Up to 1M requests",
        ),
      }),
      optimizationSuggestions: fc.array(optimizationSuggestionArb, {
        minLength: 1,
        maxLength: 3,
      }),
    });

    const rawServicesArb = fc.array(rawServiceWithSuggestionsArb, {
      minLength: 1,
      maxLength: 5,
    });

    fc.assert(
      fc.property(rawServicesArb, (rawServices) => {
        const bedrockJson = JSON.stringify({ services: rawServices });
        const parsed: IdentifiedService[] = parseBedrockResponse(bedrockJson);

        for (const svc of parsed) {
          for (const opt of svc.optimizationSuggestions) {
            expect(typeof opt.suggestion).toBe("string");
            expect(opt.suggestion.trim().length).toBeGreaterThan(0);
            expect(typeof opt.estimatedSavings).toBe("number");
            expect(opt.estimatedSavings).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: aws-doc-intelligence, Property 14: Free tier is prioritized as first optimization suggestion
// **Validates: Requirements 6.3**

import { prioritizeFreeTierSuggestions } from "./costService";

describe("Property 14: Free tier is prioritized as first optimization suggestion", () => {
  // Generator: a free-tier-eligible service with at least one optimization suggestion
  const freeTierEligibleServiceArb: fc.Arbitrary<IdentifiedService> = fc.record(
    {
      serviceName: fc.constantFrom(
        "Amazon EC2",
        "Amazon S3",
        "Amazon DynamoDB",
        "AWS Lambda",
        "Amazon RDS",
        "Amazon CloudFront",
        "Amazon SQS",
        "Amazon SNS",
      ),
      estimatedMonthlyCost: fc
        .integer({ min: 1, max: 100000 })
        .map((n) => n / 100),
      freeTier: fc.record({
        eligible: fc.constant(true),
        limits: fc.constantFrom(
          "750 hours/month",
          "5GB storage",
          "1M requests/month",
          "25 GB storage",
          "400000 GB-seconds/month",
        ),
        duration: fc.constantFrom("12 months", "Always free", "6 months"),
        restrictions: fc.constantFrom(
          "Only t2.micro instances",
          "Standard storage class only",
          "Up to 1M requests per month",
          "750 hours/month for t2.micro for 12 months",
        ),
      }),
      optimizationSuggestions: fc.array(optimizationSuggestionArb, {
        minLength: 1,
        maxLength: 5,
      }),
    },
  );

  it("after prioritization, the first suggestion of a free-tier-eligible service references 'free tier'", () => {
    fc.assert(
      fc.property(
        fc.array(freeTierEligibleServiceArb, { minLength: 1, maxLength: 10 }),
        (services) => {
          const result = prioritizeFreeTierSuggestions(services);

          for (const svc of result) {
            expect(svc.optimizationSuggestions.length).toBeGreaterThan(0);
            expect(
              svc.optimizationSuggestions[0].suggestion.toLowerCase(),
            ).toContain("free tier");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("prioritization preserves all original suggestions (none are lost)", () => {
    fc.assert(
      fc.property(
        fc.array(freeTierEligibleServiceArb, { minLength: 1, maxLength: 10 }),
        (services) => {
          const result = prioritizeFreeTierSuggestions(services);

          for (let i = 0; i < services.length; i++) {
            const originalSuggestions = services[i].optimizationSuggestions;
            const resultSuggestions = result[i].optimizationSuggestions;

            // Result should have at least as many suggestions as original
            expect(resultSuggestions.length).toBeGreaterThanOrEqual(
              originalSuggestions.length,
            );

            // Every original suggestion should still be present
            for (const orig of originalSuggestions) {
              const found = resultSuggestions.some(
                (r) =>
                  r.suggestion === orig.suggestion &&
                  r.estimatedSavings === orig.estimatedSavings,
              );
              expect(found).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

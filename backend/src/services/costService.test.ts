import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CostPredictorService,
  IBedrockClient,
  buildCostPrompt,
  parseBedrockResponse,
  prioritizeFreeTierSuggestions,
} from "./costService";
import {
  ValidationError,
  ProcessingError,
  ServiceUnavailableError,
} from "../utils/errors";
import { IdentifiedService } from "../types/index";

/** Helper to create a mock Bedrock client */
function createMockBedrockClient(): IBedrockClient & {
  invoke: ReturnType<typeof vi.fn>;
} {
  return { invoke: vi.fn().mockResolvedValue("") };
}

/** Sample valid Bedrock response JSON */
function sampleBedrockResponse(
  services: Record<string, unknown>[] = [
    {
      serviceName: "Amazon S3",
      estimatedMonthlyCost: 2.3,
      freeTier: {
        eligible: true,
        limits: "5 GB standard storage",
        duration: "12 months from signup",
        restrictions: "5 GB of S3 standard storage for 12 months",
      },
      optimizationSuggestions: [
        {
          suggestion: "Use free tier for S3 standard storage",
          estimatedSavings: 2.3,
        },
      ],
    },
  ],
): string {
  return JSON.stringify({ services });
}

describe("CostPredictorService", () => {
  let mockClient: ReturnType<typeof createMockBedrockClient>;
  let service: CostPredictorService;

  beforeEach(() => {
    mockClient = createMockBedrockClient();
    service = new CostPredictorService(mockClient);
  });

  describe("predict", () => {
    it("should reject empty specification", async () => {
      await expect(service.predict("")).rejects.toThrow(ValidationError);
      expect(mockClient.invoke).not.toHaveBeenCalled();
    });

    it("should reject specification over 2000 chars", async () => {
      const longSpec = "a".repeat(2001);
      await expect(service.predict(longSpec)).rejects.toThrow(ValidationError);
      expect(mockClient.invoke).not.toHaveBeenCalled();
    });

    it("should return identified services with correct structure", async () => {
      mockClient.invoke.mockResolvedValueOnce(sampleBedrockResponse());

      const response = await service.predict("I need S3 storage");

      expect(response.services).toHaveLength(1);
      expect(response.services[0].serviceName).toBe("Amazon S3");
      expect(response.services[0].estimatedMonthlyCost).toBe(2.3);
      expect(response.services[0].freeTier.eligible).toBe(true);
      expect(response.services[0].freeTier.limits).toBe(
        "5 GB standard storage",
      );
      expect(response.services[0].freeTier.duration).toBe(
        "12 months from signup",
      );
      expect(response.services[0].freeTier.restrictions).toBe(
        "5 GB of S3 standard storage for 12 months",
      );
    });

    it("should calculate total cost as sum of individual service costs", async () => {
      mockClient.invoke.mockResolvedValueOnce(
        sampleBedrockResponse([
          {
            serviceName: "Amazon S3",
            estimatedMonthlyCost: 2.3,
            freeTier: {
              eligible: true,
              limits: "5 GB",
              duration: "12 months",
              restrictions: "Standard storage only",
            },
            optimizationSuggestions: [
              {
                suggestion: "Use free tier for S3",
                estimatedSavings: 2.3,
              },
            ],
          },
          {
            serviceName: "Amazon EC2",
            estimatedMonthlyCost: 8.5,
            freeTier: {
              eligible: true,
              limits: "750 hours/month t2.micro",
              duration: "12 months",
              restrictions: "t2.micro only",
            },
            optimizationSuggestions: [
              {
                suggestion: "Use free tier t2.micro",
                estimatedSavings: 8.5,
              },
            ],
          },
        ]),
      );

      const response = await service.predict("I need S3 and EC2");

      expect(response.totalEstimatedMonthlyCost).toBe(10.8);
      expect(response.services).toHaveLength(2);
    });

    it("should throw ValidationError when no services identified", async () => {
      mockClient.invoke.mockResolvedValueOnce(JSON.stringify({ services: [] }));

      await expect(
        service.predict("I want to build a website"),
      ).rejects.toThrow(ValidationError);
    });

    it("should throw ProcessingError when Bedrock returns invalid JSON", async () => {
      mockClient.invoke.mockResolvedValueOnce("not valid json at all");

      await expect(service.predict("I need S3")).rejects.toThrow(
        ProcessingError,
      );
    });

    it("should throw ProcessingError when Bedrock returns malformed structure", async () => {
      mockClient.invoke.mockResolvedValueOnce(
        JSON.stringify({ data: "wrong shape" }),
      );

      await expect(service.predict("I need S3")).rejects.toThrow(
        ProcessingError,
      );
    });

    it("should propagate ServiceUnavailableError from Bedrock client", async () => {
      mockClient.invoke.mockRejectedValueOnce(new ServiceUnavailableError());

      await expect(service.predict("I need S3")).rejects.toThrow(
        ServiceUnavailableError,
      );
    });

    it("should handle Bedrock response wrapped in markdown code blocks", async () => {
      const json = sampleBedrockResponse();
      mockClient.invoke.mockResolvedValueOnce("```json\n" + json + "\n```");

      const response = await service.predict("I need S3 storage");

      expect(response.services).toHaveLength(1);
      expect(response.services[0].serviceName).toBe("Amazon S3");
    });

    it("should prioritize free tier as first optimization suggestion for eligible services", async () => {
      mockClient.invoke.mockResolvedValueOnce(
        sampleBedrockResponse([
          {
            serviceName: "Amazon EC2",
            estimatedMonthlyCost: 8.5,
            freeTier: {
              eligible: true,
              limits: "750 hours/month",
              duration: "12 months",
              restrictions: "t2.micro only",
            },
            optimizationSuggestions: [
              {
                suggestion: "Use reserved instances for savings",
                estimatedSavings: 3.0,
              },
              {
                suggestion: "Use free tier t2.micro for dev",
                estimatedSavings: 8.5,
              },
            ],
          },
        ]),
      );

      const response = await service.predict("I need EC2");

      const ec2 = response.services[0];
      expect(
        ec2.optimizationSuggestions[0].suggestion
          .toLowerCase()
          .includes("free tier"),
      ).toBe(true);
    });

    it("should add free tier suggestion if missing for eligible services", async () => {
      mockClient.invoke.mockResolvedValueOnce(
        sampleBedrockResponse([
          {
            serviceName: "Amazon DynamoDB",
            estimatedMonthlyCost: 5.0,
            freeTier: {
              eligible: true,
              limits: "25 GB storage",
              duration: "Always free",
              restrictions: "25 read/write capacity units",
            },
            optimizationSuggestions: [
              {
                suggestion: "Use on-demand capacity mode",
                estimatedSavings: 2.0,
              },
            ],
          },
        ]),
      );

      const response = await service.predict("I need DynamoDB");

      const dynamo = response.services[0];
      expect(dynamo.optimizationSuggestions.length).toBeGreaterThanOrEqual(2);
      expect(
        dynamo.optimizationSuggestions[0].suggestion
          .toLowerCase()
          .includes("free tier"),
      ).toBe(true);
    });

    it("should pass specification to Bedrock in the prompt", async () => {
      mockClient.invoke.mockResolvedValueOnce(sampleBedrockResponse());

      await service.predict("I need S3 and Lambda");

      expect(mockClient.invoke).toHaveBeenCalledTimes(1);
      const prompt = mockClient.invoke.mock.calls[0][0];
      expect(prompt).toContain("I need S3 and Lambda");
    });
  });
});

describe("buildCostPrompt", () => {
  it("should include the specification in the prompt", () => {
    const prompt = buildCostPrompt("I need EC2 and S3");
    expect(prompt).toContain("I need EC2 and S3");
  });

  it("should instruct to return JSON format", () => {
    const prompt = buildCostPrompt("test");
    expect(prompt).toContain("JSON");
  });

  it("should instruct to prioritize free tier", () => {
    const prompt = buildCostPrompt("test");
    expect(prompt.toLowerCase()).toContain("free tier");
  });
});

describe("parseBedrockResponse", () => {
  it("should parse valid JSON response", () => {
    const services = parseBedrockResponse(sampleBedrockResponse());
    expect(services).toHaveLength(1);
    expect(services[0].serviceName).toBe("Amazon S3");
  });

  it("should parse JSON wrapped in markdown code blocks", () => {
    const json = sampleBedrockResponse();
    const services = parseBedrockResponse("```json\n" + json + "\n```");
    expect(services).toHaveLength(1);
  });

  it("should throw on invalid JSON", () => {
    expect(() => parseBedrockResponse("not json")).toThrow();
  });

  it("should throw on missing services array", () => {
    expect(() => parseBedrockResponse(JSON.stringify({ data: [] }))).toThrow(
      "missing services array",
    );
  });

  it("should handle missing optional fields with defaults", () => {
    const response = JSON.stringify({
      services: [
        {
          serviceName: "Amazon S3",
          estimatedMonthlyCost: 1.0,
          freeTier: { eligible: false },
          optimizationSuggestions: [],
        },
      ],
    });

    const services = parseBedrockResponse(response);
    expect(services[0].freeTier.limits).toBe("None");
    expect(services[0].freeTier.duration).toBe("N/A");
    expect(services[0].freeTier.restrictions).toBe("");
  });
});

describe("prioritizeFreeTierSuggestions", () => {
  it("should move free tier suggestion to first position", () => {
    const services: IdentifiedService[] = [
      {
        serviceName: "Amazon EC2",
        estimatedMonthlyCost: 10,
        freeTier: {
          eligible: true,
          limits: "750 hours",
          duration: "12 months",
          restrictions: "t2.micro only",
        },
        optimizationSuggestions: [
          { suggestion: "Use reserved instances", estimatedSavings: 3 },
          { suggestion: "Use free tier t2.micro", estimatedSavings: 10 },
        ],
      },
    ];

    const result = prioritizeFreeTierSuggestions(services);
    expect(
      result[0].optimizationSuggestions[0].suggestion
        .toLowerCase()
        .includes("free tier"),
    ).toBe(true);
  });

  it("should add free tier suggestion when missing for eligible services", () => {
    const services: IdentifiedService[] = [
      {
        serviceName: "Amazon S3",
        estimatedMonthlyCost: 5,
        freeTier: {
          eligible: true,
          limits: "5 GB",
          duration: "12 months",
          restrictions: "Standard storage",
        },
        optimizationSuggestions: [
          { suggestion: "Use Glacier for archival", estimatedSavings: 3 },
        ],
      },
    ];

    const result = prioritizeFreeTierSuggestions(services);
    expect(result[0].optimizationSuggestions.length).toBe(2);
    expect(
      result[0].optimizationSuggestions[0].suggestion
        .toLowerCase()
        .includes("free tier"),
    ).toBe(true);
  });

  it("should not modify non-eligible services", () => {
    const services: IdentifiedService[] = [
      {
        serviceName: "Amazon Redshift",
        estimatedMonthlyCost: 200,
        freeTier: {
          eligible: false,
          limits: "None",
          duration: "N/A",
          restrictions: "",
        },
        optimizationSuggestions: [
          { suggestion: "Use reserved nodes", estimatedSavings: 50 },
        ],
      },
    ];

    const result = prioritizeFreeTierSuggestions(services);
    expect(result[0].optimizationSuggestions).toHaveLength(1);
    expect(result[0].optimizationSuggestions[0].suggestion).toBe(
      "Use reserved nodes",
    );
  });

  it("should not modify services with no suggestions", () => {
    const services: IdentifiedService[] = [
      {
        serviceName: "Amazon S3",
        estimatedMonthlyCost: 2,
        freeTier: {
          eligible: true,
          limits: "5 GB",
          duration: "12 months",
          restrictions: "Standard",
        },
        optimizationSuggestions: [],
      },
    ];

    const result = prioritizeFreeTierSuggestions(services);
    expect(result[0].optimizationSuggestions).toHaveLength(0);
  });

  it("should keep free tier first when already in first position", () => {
    const services: IdentifiedService[] = [
      {
        serviceName: "Amazon EC2",
        estimatedMonthlyCost: 8,
        freeTier: {
          eligible: true,
          limits: "750 hours",
          duration: "12 months",
          restrictions: "t2.micro",
        },
        optimizationSuggestions: [
          { suggestion: "Use free tier t2.micro", estimatedSavings: 8 },
          { suggestion: "Use spot instances", estimatedSavings: 5 },
        ],
      },
    ];

    const result = prioritizeFreeTierSuggestions(services);
    expect(result[0].optimizationSuggestions).toHaveLength(2);
    expect(
      result[0].optimizationSuggestions[0].suggestion
        .toLowerCase()
        .includes("free tier"),
    ).toBe(true);
  });
});

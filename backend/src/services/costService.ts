import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { CostPredictionResponse, IdentifiedService } from "../types/index";
import { validateCostSpecification } from "../utils/validation";
import {
  ProcessingError,
  ServiceUnavailableError,
  ValidationError,
  ErrorCodes,
} from "../utils/errors";

/** Interface for the Bedrock client to allow mocking in tests */
export interface IBedrockClient {
  invoke(prompt: string): Promise<string>;
}

/** Default Bedrock client using AWS SDK v3 */
export class BedrockClient implements IBedrockClient {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(region?: string, modelId?: string) {
    this.client = new BedrockRuntimeClient({
      region: region || process.env.AWS_REGION || "us-east-1",
    });
    this.modelId = modelId || "anthropic.claude-3-haiku-20240307-v1:0";
  }

  async invoke(prompt: string): Promise<string> {
    try {
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.content?.[0]?.text || "";
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ThrottlingException") {
        throw new ServiceUnavailableError(
          "Service temporarily unavailable. Please retry in a few moments.",
        );
      }
      throw new ProcessingError(
        "Unable to process your request. Please try again.",
      );
    }
  }
}

/**
 * Build the structured prompt for Bedrock Claude to analyze AWS services
 * from a cost specification.
 */
export function buildCostPrompt(specification: string): string {
  return `You are an AWS cost estimation expert. Analyze the following project specification and identify all AWS services mentioned or implied.

For each identified AWS service, provide:
1. The service name
2. Estimated monthly cost in USD
3. Free tier eligibility (true/false)
4. Free tier limits (e.g., "750 hours/month for t2.micro")
5. Free tier duration (e.g., "12 months from signup")
6. Free tier restrictions (e.g., "Only t2.micro or t3.micro instances")
7. Cost optimization suggestions with estimated savings in USD

IMPORTANT: If a service is free-tier eligible, the FIRST optimization suggestion MUST be about using the free tier.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "services": [
    {
      "serviceName": "Amazon EC2",
      "estimatedMonthlyCost": 8.50,
      "freeTier": {
        "eligible": true,
        "limits": "750 hours/month of t2.micro or t3.micro",
        "duration": "12 months from signup",
        "restrictions": "Only t2.micro or t3.micro instances in the free tier"
      },
      "optimizationSuggestions": [
        {
          "suggestion": "Use free tier t2.micro instance for development workloads",
          "estimatedSavings": 8.50
        }
      ]
    }
  ]
}

If you cannot identify any AWS services from the specification, respond with:
{"services": []}

Project specification: ${specification}`;
}

/**
 * Parse the raw Bedrock response into a structured format.
 * Extracts JSON from the response text, handling potential markdown wrapping.
 */
export function parseBedrockResponse(
  responseText: string,
): IdentifiedService[] {
  const trimmed = responseText.trim();

  // Try to extract JSON from markdown code blocks if present
  let jsonStr = trimmed;
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  if (!parsed.services || !Array.isArray(parsed.services)) {
    throw new Error("Invalid response structure: missing services array");
  }

  return parsed.services.map((svc: Record<string, unknown>) => ({
    serviceName: String(svc.serviceName || ""),
    estimatedMonthlyCost: Number(svc.estimatedMonthlyCost) || 0,
    freeTier: {
      eligible: Boolean((svc.freeTier as Record<string, unknown>)?.eligible),
      limits: String(
        (svc.freeTier as Record<string, unknown>)?.limits || "None",
      ),
      duration: String(
        (svc.freeTier as Record<string, unknown>)?.duration || "N/A",
      ),
      restrictions: String(
        (svc.freeTier as Record<string, unknown>)?.restrictions || "",
      ),
    },
    optimizationSuggestions: Array.isArray(svc.optimizationSuggestions)
      ? (svc.optimizationSuggestions as Record<string, unknown>[]).map(
          (opt) => ({
            suggestion: String(opt.suggestion || ""),
            estimatedSavings: Number(opt.estimatedSavings) || 0,
          }),
        )
      : [],
  }));
}

/**
 * Ensure free tier is the first optimization suggestion for eligible services.
 * Requirement 6.3: Prioritize free tier as first suggestion.
 */
export function prioritizeFreeTierSuggestions(
  services: IdentifiedService[],
): IdentifiedService[] {
  return services.map((service) => {
    if (
      !service.freeTier.eligible ||
      service.optimizationSuggestions.length === 0
    ) {
      return service;
    }

    const suggestions = [...service.optimizationSuggestions];
    const freeTierIndex = suggestions.findIndex((s) =>
      s.suggestion.toLowerCase().includes("free tier"),
    );

    if (freeTierIndex > 0) {
      // Move free tier suggestion to first position
      const [freeTierSuggestion] = suggestions.splice(freeTierIndex, 1);
      suggestions.unshift(freeTierSuggestion);
    } else if (freeTierIndex === -1) {
      // Add a free tier suggestion as the first item
      suggestions.unshift({
        suggestion: `Use AWS Free Tier for ${service.serviceName} (${service.freeTier.limits})`,
        estimatedSavings: service.estimatedMonthlyCost,
      });
    }

    return { ...service, optimizationSuggestions: suggestions };
  });
}

/**
 * Cost Predictor Service implementing ICostPredictorService.
 * Uses Amazon Bedrock Claude to analyze project specifications and predict AWS costs.
 */
export class CostPredictorService {
  private readonly bedrockClient: IBedrockClient;

  constructor(bedrockClient?: IBedrockClient) {
    this.bedrockClient = bedrockClient || new BedrockClient();
  }

  async predict(specification: string): Promise<CostPredictionResponse> {
    validateCostSpecification(specification);

    const prompt = buildCostPrompt(specification);
    const responseText = await this.bedrockClient.invoke(prompt);

    let services: IdentifiedService[];
    try {
      services = parseBedrockResponse(responseText);
    } catch {
      throw new ProcessingError(
        "Unable to process your request. Please try again.",
      );
    }

    if (services.length === 0) {
      throw new ValidationError(
        "Could not identify any AWS services from your specification. Please provide more specific service names or descriptions.",
        ErrorCodes.EMPTY_QUERY,
      );
    }

    // Ensure free tier is prioritized (Requirement 6.3)
    services = prioritizeFreeTierSuggestions(services);

    // Calculate total cost as sum of individual costs (Property 11)
    const totalEstimatedMonthlyCost = services.reduce(
      (sum, svc) => sum + svc.estimatedMonthlyCost,
      0,
    );

    return {
      services,
      totalEstimatedMonthlyCost:
        Math.round(totalEstimatedMonthlyCost * 100) / 100,
    };
  }
}

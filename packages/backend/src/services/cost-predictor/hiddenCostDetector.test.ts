import { describe, it, expect, beforeEach } from "vitest";
import { HiddenCostDetector } from "./hiddenCostDetector";
import type { MentionedResources } from "./hiddenCostDetector";
import { TutorialFormat } from "@aws-intel/shared";
import type { Tutorial, CostAnalysis, AWSResource } from "@aws-intel/shared";

// --- Helpers ---

function makeResource(overrides: Partial<AWSResource> = {}): AWSResource {
  return {
    resourceId: "test-1",
    resourceType: "EC2",
    configuration: { region: "us-east-1" },
    pricing: {
      hourlyRate: 0.0116,
      dailyCost: 0.2784,
      monthlyCost: 8.468,
      pricingModel: "On-Demand",
    },
    freeTierEligible: true,
    deploymentMethod: "CloudFormation",
    ...overrides,
  };
}

function makeTutorial(content: string): Tutorial {
  return {
    content,
    format: TutorialFormat.INSTRUCTIONAL_TEXT,
  };
}

function makeCostAnalysis(resources: AWSResource[]): CostAnalysis {
  return {
    totalCosts: {
      hourlyRate: 0,
      dailyCost: 0,
      monthlyCost: 0,
      scenarios: [],
    },
    resources,
    hiddenCosts: [],
    freeTierEligible: true,
    warnings: [],
    generatedAt: new Date(),
  };
}

let detector: HiddenCostDetector;

beforeEach(() => {
  detector = new HiddenCostDetector();
});

// ============================================================
// checkTutorialDocumentation
// ============================================================

describe("checkTutorialDocumentation", () => {
  it("detects explicitly mentioned resources in tutorial text", () => {
    const tutorial = makeTutorial(
      "In this tutorial, we will create an EC2 instance and an S3 bucket."
    );
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.explicitlyMentioned).toContain("EC2");
    expect(result.explicitlyMentioned).toContain("S3");
  });

  it("detects NAT Gateway mentions", () => {
    const tutorial = makeTutorial("Deploy a NAT Gateway in the public subnet.");
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.explicitlyMentioned).toContain("NAT Gateway");
  });

  it("detects ALB mentions via full name", () => {
    const tutorial = makeTutorial(
      "Create an Application Load Balancer to distribute traffic."
    );
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.explicitlyMentioned).toContain("ALB");
  });

  it("detects cost mentions in tutorial", () => {
    const tutorial = makeTutorial(
      "This tutorial will cost approximately $5 per hour."
    );
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.costsMentioned).toBe(true);
  });

  it("returns costsMentioned false when no cost language present", () => {
    const tutorial = makeTutorial("Create an EC2 instance and deploy your app.");
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.costsMentioned).toBe(false);
  });

  it("detects free tier claims", () => {
    const tutorial = makeTutorial(
      "This workshop is completely free tier eligible."
    );
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.freeTierClaimed).toBe(true);
  });

  it("returns freeTierClaimed false when not claimed", () => {
    const tutorial = makeTutorial("Deploy a Lambda function.");
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.freeTierClaimed).toBe(false);
  });

  it("returns empty mentions for content with no AWS resources", () => {
    const tutorial = makeTutorial("Hello world, this is a generic tutorial.");
    const result = detector.checkTutorialDocumentation(tutorial);
    expect(result.explicitlyMentioned).toHaveLength(0);
    expect(result.costsMentioned).toBe(false);
    expect(result.freeTierClaimed).toBe(false);
  });
});

// ============================================================
// compareWithActualResources
// ============================================================

describe("compareWithActualResources", () => {
  it("flags resources deployed but not mentioned in tutorial", () => {
    const mentioned: MentionedResources = {
      explicitlyMentioned: ["EC2"],
      costsMentioned: false,
      freeTierClaimed: false,
    };
    const resources = [
      makeResource({ resourceType: "EC2", pricing: { hourlyRate: 0.0116, dailyCost: 0.28, monthlyCost: 8.47, pricingModel: "On-Demand" } }),
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ];

    const result = detector.compareWithActualResources(mentioned, resources);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const natHidden = result.find((h) => h.resource.resourceType === "NAT Gateway");
    expect(natHidden).toBeDefined();
    expect(natHidden!.reason).toContain("not mentioned");
  });

  it("flags resources claimed as free but not free tier eligible", () => {
    const mentioned: MentionedResources = {
      explicitlyMentioned: ["NAT Gateway"],
      costsMentioned: false,
      freeTierClaimed: true,
    };
    const resources = [
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ];

    const result = detector.compareWithActualResources(mentioned, resources);
    expect(result.length).toBe(1);
    expect(result[0].reason).toContain("not free tier eligible");
  });

  it("flags common hidden cost resources when costs not discussed", () => {
    const mentioned: MentionedResources = {
      explicitlyMentioned: ["EC2", "NAT Gateway"],
      costsMentioned: false,
      freeTierClaimed: false,
    };
    const resources = [
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ];

    const result = detector.compareWithActualResources(mentioned, resources);
    expect(result.length).toBe(1);
    expect(result[0].reason).toContain("commonly overlooked");
  });

  it("does not flag resources with zero cost", () => {
    const mentioned: MentionedResources = {
      explicitlyMentioned: [],
      costsMentioned: false,
      freeTierClaimed: false,
    };
    const resources = [
      makeResource({
        resourceType: "Lambda",
        pricing: { hourlyRate: 0, dailyCost: 0, monthlyCost: 0, pricingModel: "On-Demand" },
        freeTierEligible: true,
      }),
    ];

    const result = detector.compareWithActualResources(mentioned, resources);
    expect(result).toHaveLength(0);
  });

  it("does not flag mentioned resources when costs are discussed", () => {
    const mentioned: MentionedResources = {
      explicitlyMentioned: ["NAT Gateway"],
      costsMentioned: true,
      freeTierClaimed: false,
    };
    const resources = [
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ];

    const result = detector.compareWithActualResources(mentioned, resources);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when no resources are provided", () => {
    const mentioned: MentionedResources = {
      explicitlyMentioned: [],
      costsMentioned: false,
      freeTierClaimed: false,
    };
    const result = detector.compareWithActualResources(mentioned, []);
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// detectHiddenCosts (integration of check + compare)
// ============================================================

describe("detectHiddenCosts", () => {
  it("detects NAT Gateway as hidden cost when not mentioned in tutorial", () => {
    const tutorial = makeTutorial(
      "In this tutorial we create an EC2 instance and deploy a web app."
    );
    const natResource = makeResource({
      resourceId: "nat-1",
      resourceType: "NAT Gateway",
      pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
      freeTierEligible: false,
    });
    const analysis = makeCostAnalysis([
      makeResource({ resourceType: "EC2" }),
      natResource,
    ]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const natHidden = result.find((h) => h.resource.resourceType === "NAT Gateway");
    expect(natHidden).toBeDefined();
    expect(natHidden!.severity).toBe("medium");
  });

  it("detects ALB as hidden cost when not mentioned", () => {
    const tutorial = makeTutorial("Deploy your application using ECS and Fargate.");
    const albResource = makeResource({
      resourceId: "alb-1",
      resourceType: "ALB",
      pricing: { hourlyRate: 0.0225, dailyCost: 0.54, monthlyCost: 16.425, pricingModel: "On-Demand" },
      freeTierEligible: false,
    });
    const analysis = makeCostAnalysis([albResource]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    expect(result.length).toBe(1);
    expect(result[0].resource.resourceType).toBe("ALB");
  });

  it("detects Elastic IP as hidden cost", () => {
    const tutorial = makeTutorial("Launch an EC2 instance in a VPC.");
    const eipResource = makeResource({
      resourceId: "eip-1",
      resourceType: "Elastic IP",
      pricing: { hourlyRate: 0.005, dailyCost: 0.12, monthlyCost: 3.65, pricingModel: "On-Demand" },
      freeTierEligible: false,
    });
    const analysis = makeCostAnalysis([
      makeResource({ resourceType: "EC2" }),
      eipResource,
    ]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    const eipHidden = result.find((h) => h.resource.resourceType === "Elastic IP");
    expect(eipHidden).toBeDefined();
    expect(eipHidden!.severity).toBe("low");
  });

  it("returns results sorted by severity (high first)", () => {
    const tutorial = makeTutorial("Create an EC2 instance.");
    const analysis = makeCostAnalysis([
      makeResource({
        resourceId: "eip-1",
        resourceType: "Elastic IP",
        pricing: { hourlyRate: 0.005, dailyCost: 0.12, monthlyCost: 3.65, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
      makeResource({
        resourceId: "redshift-1",
        resourceType: "Redshift",
        pricing: { hourlyRate: 0.25, dailyCost: 6, monthlyCost: 182.5, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    expect(result.length).toBe(3);
    expect(result[0].severity).toBe("high");
    expect(result[0].resource.resourceType).toBe("Redshift");
    expect(result[1].severity).toBe("medium");
    expect(result[2].severity).toBe("low");
  });

  it("returns empty array when all resources are mentioned and costs discussed", () => {
    const tutorial = makeTutorial(
      "Create a NAT Gateway. This will cost approximately $32/month."
    );
    const analysis = makeCostAnalysis([
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    expect(result).toHaveLength(0);
  });

  it("flags free tier claim with non-free-tier resources", () => {
    const tutorial = makeTutorial(
      "This tutorial is free tier eligible. We will use a NAT Gateway and an ALB."
    );
    const analysis = makeCostAnalysis([
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
      makeResource({
        resourceId: "alb-1",
        resourceType: "ALB",
        pricing: { hourlyRate: 0.0225, dailyCost: 0.54, monthlyCost: 16.425, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    expect(result.length).toBe(2);
    result.forEach((h) => {
      expect(h.reason).toContain("not free tier eligible");
    });
  });

  it("classifies severity correctly by monthly cost", () => {
    const tutorial = makeTutorial("Deploy resources.");
    const analysis = makeCostAnalysis([
      makeResource({
        resourceId: "low-1",
        resourceType: "Elastic IP",
        pricing: { hourlyRate: 0.005, dailyCost: 0.12, monthlyCost: 3.65, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
      makeResource({
        resourceId: "med-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
      makeResource({
        resourceId: "high-1",
        resourceType: "Neptune",
        pricing: { hourlyRate: 0.348, dailyCost: 8.352, monthlyCost: 254.04, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    const low = result.find((h) => h.resource.resourceId === "low-1");
    const med = result.find((h) => h.resource.resourceId === "med-1");
    const high = result.find((h) => h.resource.resourceId === "high-1");
    expect(low!.severity).toBe("low");
    expect(med!.severity).toBe("medium");
    expect(high!.severity).toBe("high");
  });

  it("handles tutorial with no resources in analysis", () => {
    const tutorial = makeTutorial("This is a conceptual tutorial with no deployments.");
    const analysis = makeCostAnalysis([]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    expect(result).toHaveLength(0);
  });

  it("detects multiple common hidden costs: NAT Gateway, ALB, Elastic IP", () => {
    const tutorial = makeTutorial("Create an EC2 instance and set up a VPC.");
    const analysis = makeCostAnalysis([
      makeResource({ resourceType: "EC2" }),
      makeResource({
        resourceId: "nat-1",
        resourceType: "NAT Gateway",
        pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
      makeResource({
        resourceId: "alb-1",
        resourceType: "ALB",
        pricing: { hourlyRate: 0.0225, dailyCost: 0.54, monthlyCost: 16.425, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
      makeResource({
        resourceId: "eip-1",
        resourceType: "Elastic IP",
        pricing: { hourlyRate: 0.005, dailyCost: 0.12, monthlyCost: 3.65, pricingModel: "On-Demand" },
        freeTierEligible: false,
      }),
    ]);

    const result = detector.detectHiddenCosts(tutorial, analysis);
    const hiddenTypes = result.map((h) => h.resource.resourceType);
    expect(hiddenTypes).toContain("NAT Gateway");
    expect(hiddenTypes).toContain("ALB");
    expect(hiddenTypes).toContain("Elastic IP");
  });
});

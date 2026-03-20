import { describe, it, expect, beforeEach } from "vitest";
import {
  CleanupScriptGenerator,
  orderByDependencies,
  getActiveResources,
  calculateCostSavings,
  estimateCleanupTime,
  DEPENDENCY_GRAPH,
} from "./cleanupScriptGenerator";
import { CleanupMethod, ResourceStatus, SessionStatus } from "@aws-intel/shared";
import type {
  AWSResource,
  TrackedResource,
  TrackingSession,
} from "@aws-intel/shared";

// --- Test helpers ---

function makeResource(
  type: string,
  id: string = `${type.toLowerCase().replace(/\s/g, "-")}-001`,
  overrides: Partial<AWSResource> = {}
): AWSResource {
  return {
    resourceId: id,
    resourceType: type,
    configuration: { region: "us-east-1" },
    pricing: {
      hourlyRate: 0.045,
      dailyCost: 1.08,
      monthlyCost: 32.85,
      pricingModel: "On-Demand",
    },
    freeTierEligible: false,
    deploymentMethod: "CloudFormation",
    ...overrides,
  };
}

function makeTracked(
  resource: AWSResource,
  status: ResourceStatus = ResourceStatus.RUNNING,
  accumulatedCost: number = 5.0
): TrackedResource {
  return {
    resource,
    deployedAt: new Date("2025-01-01T00:00:00Z"),
    deletedAt: status === ResourceStatus.DELETED ? new Date("2025-01-02T00:00:00Z") : undefined,
    status,
    accumulatedCost,
  };
}

function makeSession(
  trackedResources: TrackedResource[],
  overrides: Partial<TrackingSession> = {}
): TrackingSession {
  return {
    sessionId: "session-001",
    userId: "user-001",
    workshopId: "workshop-serverless",
    workshopTitle: "Serverless Web Application",
    resources: trackedResources,
    startedAt: new Date("2025-01-01T00:00:00Z"),
    lastUpdated: new Date("2025-01-02T00:00:00Z"),
    status: SessionStatus.ACTIVE,
    accumulatedCost: trackedResources.reduce((s, r) => s + r.accumulatedCost, 0),
    projectedMonthlyCost: trackedResources.reduce((s, r) => s + r.resource.pricing.monthlyCost, 0),
    ...overrides,
  };
}

// ============================================================
// Helper function tests
// ============================================================

describe("getActiveResources", () => {
  it("returns only non-deleted resources", () => {
    const r1 = makeTracked(makeResource("EC2"), ResourceStatus.RUNNING);
    const r2 = makeTracked(makeResource("S3", "s3-001"), ResourceStatus.DELETED);
    const r3 = makeTracked(makeResource("Lambda", "lambda-001"), ResourceStatus.RUNNING);
    const session = makeSession([r1, r2, r3]);

    const active = getActiveResources(session);
    expect(active).toHaveLength(2);
    expect(active.every((r) => r.status !== ResourceStatus.DELETED)).toBe(true);
  });

  it("returns empty array when all resources are deleted", () => {
    const r1 = makeTracked(makeResource("EC2"), ResourceStatus.DELETED);
    const session = makeSession([r1]);
    expect(getActiveResources(session)).toHaveLength(0);
  });

  it("returns all resources when none are deleted", () => {
    const r1 = makeTracked(makeResource("EC2"));
    const r2 = makeTracked(makeResource("RDS", "rds-001"));
    const session = makeSession([r1, r2]);
    expect(getActiveResources(session)).toHaveLength(2);
  });
});

describe("calculateCostSavings", () => {
  it("calculates daily and monthly savings from active resources", () => {
    const r1 = makeTracked(makeResource("NAT Gateway", "nat-001"), ResourceStatus.RUNNING, 10);
    const r2 = makeTracked(makeResource("ALB", "alb-001", {
      pricing: { hourlyRate: 0.0225, dailyCost: 0.54, monthlyCost: 16.43, pricingModel: "On-Demand" },
    }), ResourceStatus.RUNNING, 5);

    const savings = calculateCostSavings([r1, r2], [r1, r2]);
    expect(savings.dailySavings).toBe(1.62);
    expect(savings.monthlySavings).toBe(49.28);
    expect(savings.totalAccumulatedCost).toBe(15);
  });

  it("returns zero savings for empty active resources", () => {
    const savings = calculateCostSavings([], []);
    expect(savings.dailySavings).toBe(0);
    expect(savings.monthlySavings).toBe(0);
    expect(savings.totalAccumulatedCost).toBe(0);
  });
});

describe("estimateCleanupTime", () => {
  it("returns 0 for zero resources", () => {
    expect(estimateCleanupTime(0, CleanupMethod.AWS_CLI)).toBe(0);
  });

  it("returns minimum time for small resource counts", () => {
    expect(estimateCleanupTime(1, CleanupMethod.CLOUDFORMATION)).toBe(2);
    expect(estimateCleanupTime(1, CleanupMethod.TERRAFORM)).toBe(2);
    expect(estimateCleanupTime(1, CleanupMethod.AWS_CLI)).toBe(2);
  });

  it("scales with resource count for CLI", () => {
    expect(estimateCleanupTime(5, CleanupMethod.AWS_CLI)).toBe(10);
  });
});

// ============================================================
// orderByDependencies tests
// ============================================================

describe("orderByDependencies", () => {
  it("returns empty array for empty input", () => {
    expect(orderByDependencies([])).toEqual([]);
  });

  it("orders EC2 before Elastic IP", () => {
    const eip = makeResource("Elastic IP", "eip-001");
    const ec2 = makeResource("EC2", "ec2-001");
    const ordered = orderByDependencies([eip, ec2]);
    const types = ordered.map((r) => r.resourceType);
    expect(types.indexOf("EC2")).toBeLessThan(types.indexOf("Elastic IP"));
  });

  it("orders NAT Gateway before Elastic IP", () => {
    const eip = makeResource("Elastic IP", "eip-001");
    const nat = makeResource("NAT Gateway", "nat-001");
    const ordered = orderByDependencies([eip, nat]);
    const types = ordered.map((r) => r.resourceType);
    expect(types.indexOf("NAT Gateway")).toBeLessThan(types.indexOf("Elastic IP"));
  });

  it("orders ALB before CloudFront", () => {
    const cf = makeResource("CloudFront", "cf-001");
    const alb = makeResource("ALB", "alb-001");
    const ordered = orderByDependencies([cf, alb]);
    const types = ordered.map((r) => r.resourceType);
    expect(types.indexOf("ALB")).toBeLessThan(types.indexOf("CloudFront"));
  });

  it("orders Lambda before API Gateway", () => {
    const apigw = makeResource("API Gateway", "apigw-001");
    const lambda = makeResource("Lambda", "lambda-001");
    const ordered = orderByDependencies([apigw, lambda]);
    const types = ordered.map((r) => r.resourceType);
    expect(types.indexOf("Lambda")).toBeLessThan(types.indexOf("API Gateway"));
  });

  it("orders EC2 before EFS", () => {
    const efs = makeResource("EFS", "efs-001");
    const ec2 = makeResource("EC2", "ec2-001");
    const ordered = orderByDependencies([efs, ec2]);
    const types = ordered.map((r) => r.resourceType);
    expect(types.indexOf("EC2")).toBeLessThan(types.indexOf("EFS"));
  });

  it("handles complex dependency chain: EC2 → Elastic IP, NAT Gateway → Elastic IP", () => {
    const eip = makeResource("Elastic IP", "eip-001");
    const ec2 = makeResource("EC2", "ec2-001");
    const nat = makeResource("NAT Gateway", "nat-001");
    const ordered = orderByDependencies([eip, ec2, nat]);
    const types = ordered.map((r) => r.resourceType);
    const eipIdx = types.indexOf("Elastic IP");
    expect(types.indexOf("EC2")).toBeLessThan(eipIdx);
    expect(types.indexOf("NAT Gateway")).toBeLessThan(eipIdx);
  });

  it("preserves resources with no dependencies", () => {
    const s3 = makeResource("S3", "s3-001");
    const dynamo = makeResource("DynamoDB", "ddb-001");
    const ordered = orderByDependencies([s3, dynamo]);
    expect(ordered).toHaveLength(2);
  });

  it("handles single resource", () => {
    const ec2 = makeResource("EC2", "ec2-001");
    const ordered = orderByDependencies([ec2]);
    expect(ordered).toHaveLength(1);
    expect(ordered[0].resourceType).toBe("EC2");
  });

  it("handles unknown resource types gracefully", () => {
    const unknown = makeResource("CustomService", "custom-001");
    const ec2 = makeResource("EC2", "ec2-001");
    const ordered = orderByDependencies([unknown, ec2]);
    expect(ordered).toHaveLength(2);
  });
});

// ============================================================
// CleanupScriptGenerator class tests
// ============================================================

describe("CleanupScriptGenerator", () => {
  let generator: CleanupScriptGenerator;

  beforeEach(() => {
    generator = new CleanupScriptGenerator();
  });

  // --- generateScript: AWS CLI ---

  describe("generateScript - AWS CLI", () => {
    it("generates a valid bash script with delete commands", () => {
      const resources = [
        makeTracked(makeResource("EC2", "i-12345")),
        makeTracked(makeResource("NAT Gateway", "nat-67890")),
      ];
      const session = makeSession(resources);

      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.method).toBe(CleanupMethod.AWS_CLI);
      expect(result.script).toContain("#!/bin/bash");
      expect(result.script).toContain("aws ec2 terminate-instances --instance-ids i-12345");
      expect(result.script).toContain("aws ec2 delete-nat-gateway --nat-gateway-id nat-67890");
      expect(result.script).toContain("Verifying all resources deleted");
    });

    it("includes workshop title in script header", () => {
      const session = makeSession([makeTracked(makeResource("S3", "my-bucket"))]);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);
      expect(result.script).toContain("Serverless Web Application");
    });

    it("includes verification commands", () => {
      const resources = [makeTracked(makeResource("EC2", "i-12345"))];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.verificationCommands.length).toBeGreaterThan(0);
      expect(result.verificationCommands.some((c) => c.includes("describe-instances"))).toBe(true);
    });

    it("calculates cost savings", () => {
      const resources = [
        makeTracked(makeResource("NAT Gateway", "nat-001"), ResourceStatus.RUNNING, 10),
      ];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.costSavings.dailySavings).toBeGreaterThan(0);
      expect(result.costSavings.monthlySavings).toBeGreaterThan(0);
      expect(result.costSavings.totalAccumulatedCost).toBe(10);
    });

    it("skips deleted resources", () => {
      const resources = [
        makeTracked(makeResource("EC2", "i-active"), ResourceStatus.RUNNING),
        makeTracked(makeResource("S3", "s3-deleted"), ResourceStatus.DELETED),
      ];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.script).toContain("i-active");
      expect(result.script).not.toContain("s3-deleted");
    });

    it("generates warnings for S3 buckets", () => {
      const resources = [makeTracked(makeResource("S3", "my-bucket"))];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.warnings.some((w) => w.includes("S3"))).toBe(true);
    });

    it("generates warnings for RDS instances", () => {
      const resources = [makeTracked(makeResource("RDS", "mydb"))];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.warnings.some((w) => w.includes("RDS") || w.includes("snapshot"))).toBe(true);
    });

    it("handles empty session with no active resources", () => {
      const session = makeSession([]);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.script).toContain("#!/bin/bash");
      expect(result.costSavings.dailySavings).toBe(0);
      expect(result.estimatedTime).toBe(0);
    });
  });

  // --- generateScript: CloudFormation ---

  describe("generateScript - CloudFormation", () => {
    it("generates CloudFormation stack deletion commands", () => {
      const resources = [makeTracked(makeResource("EC2", "i-12345"))];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.CLOUDFORMATION);

      expect(result.method).toBe(CleanupMethod.CLOUDFORMATION);
      expect(result.script).toContain("aws cloudformation delete-stack");
      expect(result.script).toContain("aws cloudformation wait stack-delete-complete");
    });

    it("uses workshop ID as stack name", () => {
      const session = makeSession([makeTracked(makeResource("EC2", "i-12345"))]);
      const result = generator.generateScript(session, CleanupMethod.CLOUDFORMATION);
      expect(result.script).toContain("workshop-serverless");
    });

    it("includes verification commands for CloudFormation", () => {
      const session = makeSession([makeTracked(makeResource("EC2", "i-12345"))]);
      const result = generator.generateScript(session, CleanupMethod.CLOUDFORMATION);

      expect(result.verificationCommands.length).toBeGreaterThan(0);
      expect(result.verificationCommands.some((c) => c.includes("cloudformation"))).toBe(true);
    });
  });

  // --- generateScript: Terraform ---

  describe("generateScript - Terraform", () => {
    it("generates Terraform destroy commands", () => {
      const resources = [makeTracked(makeResource("EC2", "i-12345"))];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.TERRAFORM);

      expect(result.method).toBe(CleanupMethod.TERRAFORM);
      expect(result.script).toContain("terraform destroy -auto-approve");
    });

    it("includes individual resource removal comments", () => {
      const resources = [
        makeTracked(makeResource("EC2", "i-12345")),
        makeTracked(makeResource("S3", "my-bucket")),
      ];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.TERRAFORM);

      expect(result.script).toContain("terraform state rm");
      expect(result.script).toContain("aws_instance");
      expect(result.script).toContain("aws_s3_bucket");
    });

    it("includes Terraform verification commands", () => {
      const session = makeSession([makeTracked(makeResource("EC2", "i-12345"))]);
      const result = generator.generateScript(session, CleanupMethod.TERRAFORM);

      expect(result.verificationCommands.length).toBeGreaterThan(0);
      expect(result.verificationCommands.some((c) => c.includes("terraform"))).toBe(true);
    });
  });

  // --- orderByDependencies method ---

  describe("orderByDependencies method", () => {
    it("delegates to the module-level function", () => {
      const resources = [
        makeResource("Elastic IP", "eip-001"),
        makeResource("EC2", "ec2-001"),
      ];
      const ordered = generator.orderByDependencies(resources);
      const types = ordered.map((r) => r.resourceType);
      expect(types.indexOf("EC2")).toBeLessThan(types.indexOf("Elastic IP"));
    });
  });

  // --- estimatedTime ---

  describe("estimatedTime", () => {
    it("returns positive estimated time for non-empty sessions", () => {
      const resources = [
        makeTracked(makeResource("EC2", "i-001")),
        makeTracked(makeResource("RDS", "rds-001")),
        makeTracked(makeResource("NAT Gateway", "nat-001")),
      ];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);
      expect(result.estimatedTime).toBeGreaterThan(0);
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("handles session with all resources already deleted", () => {
      const resources = [
        makeTracked(makeResource("EC2", "i-001"), ResourceStatus.DELETED, 10),
        makeTracked(makeResource("S3", "s3-001"), ResourceStatus.DELETED, 2),
      ];
      const session = makeSession(resources, { status: SessionStatus.COMPLETED });
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.costSavings.dailySavings).toBe(0);
      expect(result.costSavings.totalAccumulatedCost).toBe(12);
      expect(result.estimatedTime).toBe(0);
    });

    it("handles mixed active and deleted resources", () => {
      const resources = [
        makeTracked(makeResource("EC2", "i-active"), ResourceStatus.RUNNING, 5),
        makeTracked(makeResource("S3", "s3-deleted"), ResourceStatus.DELETED, 1),
        makeTracked(makeResource("NAT Gateway", "nat-active"), ResourceStatus.RUNNING, 8),
      ];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);

      expect(result.script).toContain("i-active");
      expect(result.script).toContain("nat-active");
      expect(result.script).not.toContain("s3-deleted");
      expect(result.costSavings.totalAccumulatedCost).toBe(14);
    });

    it("generates EKS warnings when EKS cluster present", () => {
      const resources = [makeTracked(makeResource("EKS", "my-cluster"))];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);
      expect(result.warnings.some((w) => w.includes("EKS"))).toBe(true);
    });

    it("generates NAT Gateway warnings", () => {
      const resources = [makeTracked(makeResource("NAT Gateway", "nat-001"))];
      const session = makeSession(resources);
      const result = generator.generateScript(session, CleanupMethod.AWS_CLI);
      expect(result.warnings.some((w) => w.includes("NAT Gateway"))).toBe(true);
    });

    it("all three methods produce scripts with cleanup complete message", () => {
      const resources = [makeTracked(makeResource("EC2", "i-001"))];
      const session = makeSession(resources);

      for (const method of [CleanupMethod.AWS_CLI, CleanupMethod.CLOUDFORMATION, CleanupMethod.TERRAFORM]) {
        const result = generator.generateScript(session, method);
        expect(result.script).toContain("Cleanup complete.");
      }
    });
  });
});

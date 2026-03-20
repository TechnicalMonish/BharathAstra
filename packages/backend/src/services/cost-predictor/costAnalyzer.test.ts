import { describe, it, expect, beforeEach } from "vitest";
import {
  CostAnalyzer,
  PRICING_TABLE,
  CFN_RESOURCE_MAP,
  TF_RESOURCE_MAP,
  CLI_COMMAND_MAP,
  lookupPricing,
  detectFormat,
  parseCloudFormation,
  parseTerraform,
  parseAWSCLI,
  parseInstructionalText,
  generateResourceId,
  resetResourceCounter,
} from "./costAnalyzer";
import { TutorialFormat } from "@aws-intel/shared";
import type { Tutorial, CostAnalysis } from "@aws-intel/shared";

// ============================================================
// Helper function tests
// ============================================================

describe("lookupPricing", () => {
  it("returns pricing for a known resource type", () => {
    const entry = lookupPricing("EC2");
    expect(entry.hourlyRate).toBeGreaterThan(0);
    expect(entry.freeTierEligible).toBe(true);
  });

  it("returns specific instance type pricing when available", () => {
    const entry = lookupPricing("EC2", "t2.large");
    expect(entry.hourlyRate).toBe(0.0928);
    expect(entry.freeTierEligible).toBe(false);
  });

  it("falls back to base type when instance type not found", () => {
    const entry = lookupPricing("EC2", "z99.mega");
    expect(entry.hourlyRate).toBe(PRICING_TABLE["EC2"].hourlyRate);
  });

  it("returns zero hourly rate for unknown resource types", () => {
    const entry = lookupPricing("UnknownService");
    expect(entry.hourlyRate).toBe(0);
    expect(entry.freeTierEligible).toBe(false);
  });

  it("returns free tier eligible for Lambda", () => {
    const entry = lookupPricing("Lambda");
    expect(entry.hourlyRate).toBe(0);
    expect(entry.freeTierEligible).toBe(true);
  });

  it("returns non-free-tier for NAT Gateway", () => {
    const entry = lookupPricing("NAT Gateway");
    expect(entry.hourlyRate).toBe(0.045);
    expect(entry.freeTierEligible).toBe(false);
  });
});

describe("detectFormat", () => {
  it("detects CloudFormation format", () => {
    const content = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
`;
    expect(detectFormat(content)).toBe(TutorialFormat.CLOUDFORMATION);
  });

  it("detects Terraform format", () => {
    const content = `
provider "aws" {
  region = "us-east-1"
}
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
}
`;
    expect(detectFormat(content)).toBe(TutorialFormat.TERRAFORM);
  });

  it("detects AWS CLI format", () => {
    const content = `
# Run the following command
aws ec2 run-instances --image-id ami-12345 --instance-type t2.micro
`;
    expect(detectFormat(content)).toBe(TutorialFormat.AWS_CLI);
  });

  it("detects mixed format", () => {
    const content = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  MyBucket:
    Type: AWS::S3::Bucket

Also run:
aws ec2 run-instances --instance-type t2.micro
`;
    expect(detectFormat(content)).toBe(TutorialFormat.MIXED);
  });

  it("defaults to instructional text for plain content", () => {
    const content = "This tutorial shows you how to use AWS services.";
    expect(detectFormat(content)).toBe(TutorialFormat.INSTRUCTIONAL_TEXT);
  });
});

describe("generateResourceId", () => {
  beforeEach(() => {
    resetResourceCounter();
  });

  it("generates unique IDs with resource type prefix", () => {
    const id1 = generateResourceId("EC2");
    const id2 = generateResourceId("EC2");
    expect(id1).toMatch(/^ec2-/);
    expect(id2).toMatch(/^ec2-/);
    expect(id1).not.toBe(id2);
  });

  it("handles resource types with spaces", () => {
    const id = generateResourceId("NAT Gateway");
    expect(id).toMatch(/^nat-gateway-/);
  });
});

// ============================================================
// Parser tests
// ============================================================

describe("parseCloudFormation", () => {
  beforeEach(() => {
    resetResourceCounter();
  });

  it("extracts EC2 instance from CloudFormation template", () => {
    const content = `
Resources:
  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: t2.micro
      ImageId: ami-12345
`;
    const resources = parseCloudFormation(content);
    expect(resources.length).toBeGreaterThanOrEqual(1);
    const ec2 = resources.find((r) => r.resourceType === "EC2");
    expect(ec2).toBeDefined();
    expect(ec2!.deploymentMethod).toBe("CloudFormation");
    expect(ec2!.configuration.instanceType).toBe("t2.micro");
  });

  it("extracts multiple resource types", () => {
    const content = `
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
  MyFunction:
    Type: AWS::Lambda::Function
  MyDB:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceClass: db.t3.medium
`;
    const resources = parseCloudFormation(content);
    const types = resources.map((r) => r.resourceType);
    expect(types).toContain("S3");
    expect(types).toContain("Lambda");
    expect(types).toContain("RDS");
  });

  it("extracts NAT Gateway from CloudFormation", () => {
    const content = `
Resources:
  NatGW:
    Type: AWS::EC2::NatGateway
    Properties:
      SubnetId: subnet-12345
`;
    const resources = parseCloudFormation(content);
    expect(resources.some((r) => r.resourceType === "NAT Gateway")).toBe(true);
  });

  it("returns empty array for content with no AWS resources", () => {
    const content = "This is just plain text with no CloudFormation.";
    expect(parseCloudFormation(content)).toEqual([]);
  });

  it("handles JSON-style CloudFormation templates", () => {
    const content = `{
  "Resources": {
    "MyInstance": {
      "Type": "AWS::EC2::Instance",
      "Properties": {
        "InstanceType": "t3.large"
      }
    }
  }
}`;
    const resources = parseCloudFormation(content);
    expect(resources.length).toBeGreaterThanOrEqual(1);
    expect(resources[0].resourceType).toBe("EC2");
  });
});

describe("parseTerraform", () => {
  beforeEach(() => {
    resetResourceCounter();
  });

  it("extracts EC2 instance from Terraform", () => {
    const content = `
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
}
`;
    const resources = parseTerraform(content);
    expect(resources.length).toBe(1);
    expect(resources[0].resourceType).toBe("EC2");
    expect(resources[0].deploymentMethod).toBe("Terraform");
    expect(resources[0].configuration.instanceType).toBe("t2.micro");
  });

  it("extracts multiple Terraform resources", () => {
    const content = `
resource "aws_instance" "web" {
  instance_type = "t3.medium"
}
resource "aws_s3_bucket" "data" {
  bucket = "my-bucket"
}
resource "aws_nat_gateway" "nat" {
  subnet_id = "subnet-123"
}
`;
    const resources = parseTerraform(content);
    const types = resources.map((r) => r.resourceType);
    expect(types).toContain("EC2");
    expect(types).toContain("S3");
    expect(types).toContain("NAT Gateway");
  });

  it("extracts RDS instance with instance type", () => {
    const content = `
resource "aws_db_instance" "main" {
  instance_class = "db.r5.large"
  engine         = "postgres"
}
`;
    const resources = parseTerraform(content);
    expect(resources.length).toBe(1);
    expect(resources[0].resourceType).toBe("RDS");
  });

  it("returns empty array for non-Terraform content", () => {
    expect(parseTerraform("just some text")).toEqual([]);
  });
});

describe("parseAWSCLI", () => {
  beforeEach(() => {
    resetResourceCounter();
  });

  it("extracts EC2 run-instances command", () => {
    const content = `
# Launch an EC2 instance
aws ec2 run-instances --image-id ami-12345 --instance-type t2.micro --count 1
`;
    const resources = parseAWSCLI(content);
    expect(resources.length).toBe(1);
    expect(resources[0].resourceType).toBe("EC2");
    expect(resources[0].deploymentMethod).toBe("AWS CLI");
  });

  it("extracts multiple CLI commands", () => {
    const content = `
aws s3 mb s3://my-bucket
aws rds create-db-instance --db-instance-identifier mydb --db-instance-class db.t3.micro
aws ec2 create-nat-gateway --subnet-id subnet-123
`;
    const resources = parseAWSCLI(content);
    const types = resources.map((r) => r.resourceType);
    expect(types).toContain("S3");
    expect(types).toContain("RDS");
    expect(types).toContain("NAT Gateway");
  });

  it("extracts EKS create-cluster command", () => {
    const content = "aws eks create-cluster --name my-cluster --role-arn arn:aws:iam::role";
    const resources = parseAWSCLI(content);
    expect(resources.some((r) => r.resourceType === "EKS")).toBe(true);
  });

  it("returns empty array for content without CLI commands", () => {
    expect(parseAWSCLI("no commands here")).toEqual([]);
  });
});

describe("parseInstructionalText", () => {
  beforeEach(() => {
    resetResourceCounter();
  });

  it("detects EC2 instance mentions", () => {
    const content = "In this tutorial, we will launch an EC2 instance to host our application.";
    const resources = parseInstructionalText(content);
    expect(resources.some((r) => r.resourceType === "EC2")).toBe(true);
  });

  it("detects multiple resource mentions", () => {
    const content = `
      First, create an S3 bucket for storage.
      Then, set up a DynamoDB table for the database.
      Finally, deploy a Lambda function to process events.
    `;
    const resources = parseInstructionalText(content);
    const types = resources.map((r) => r.resourceType);
    expect(types).toContain("S3");
    expect(types).toContain("DynamoDB");
    expect(types).toContain("Lambda");
  });

  it("detects NAT Gateway mentions", () => {
    const content = "The VPC requires a NAT Gateway for private subnet internet access.";
    const resources = parseInstructionalText(content);
    expect(resources.some((r) => r.resourceType === "NAT Gateway")).toBe(true);
  });

  it("detects ALB mentions", () => {
    const content = "Set up an Application Load Balancer to distribute traffic.";
    const resources = parseInstructionalText(content);
    expect(resources.some((r) => r.resourceType === "ALB")).toBe(true);
  });

  it("does not duplicate the same resource type", () => {
    const content = "Create an S3 bucket. Then create another S3 bucket for logs.";
    const resources = parseInstructionalText(content);
    const s3Resources = resources.filter((r) => r.resourceType === "S3");
    expect(s3Resources.length).toBe(1);
  });

  it("returns empty array for content with no resource mentions", () => {
    const content = "This is a general article about cloud computing concepts.";
    expect(parseInstructionalText(content)).toEqual([]);
  });

  it("sets deployment method to Instructional Text", () => {
    const content = "Deploy an EKS cluster for container orchestration.";
    const resources = parseInstructionalText(content);
    expect(resources[0].deploymentMethod).toBe("Instructional Text");
  });
});

// ============================================================
// CostAnalyzer class tests
// ============================================================

describe("CostAnalyzer", () => {
  let analyzer: CostAnalyzer;

  beforeEach(() => {
    analyzer = new CostAnalyzer();
    resetResourceCounter();
  });

  // --- scanContent ---

  describe("scanContent", () => {
    it("scans CloudFormation content and returns resources", () => {
      const content = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: t2.micro
`;
      const resources = analyzer.scanContent(content, TutorialFormat.CLOUDFORMATION);
      expect(resources.length).toBeGreaterThanOrEqual(1);
      expect(resources.some((r) => r.resourceType === "EC2")).toBe(true);
    });

    it("scans Terraform content and returns resources", () => {
      const content = `
resource "aws_instance" "web" {
  instance_type = "t3.large"
}
`;
      const resources = analyzer.scanContent(content, TutorialFormat.TERRAFORM);
      expect(resources.length).toBeGreaterThanOrEqual(1);
      expect(resources.some((r) => r.resourceType === "EC2")).toBe(true);
    });

    it("scans CLI content and returns resources", () => {
      const content = "aws ec2 run-instances --instance-type t2.micro";
      const resources = analyzer.scanContent(content, TutorialFormat.AWS_CLI);
      expect(resources.length).toBeGreaterThanOrEqual(1);
    });

    it("scans instructional text and returns resources", () => {
      const content = "Create an S3 bucket and a Lambda function for this project.";
      const resources = analyzer.scanContent(content, TutorialFormat.INSTRUCTIONAL_TEXT);
      expect(resources.some((r) => r.resourceType === "S3")).toBe(true);
      expect(resources.some((r) => r.resourceType === "Lambda")).toBe(true);
    });

    it("deduplicates resources across parsers for mixed content", () => {
      const content = `
Resources:
  MyBucket:
    Type: AWS::S3::Bucket

Also, create an S3 bucket for your data.
`;
      const resources = analyzer.scanContent(content, TutorialFormat.MIXED);
      const s3Resources = resources.filter((r) => r.resourceType === "S3");
      expect(s3Resources.length).toBe(1);
    });

    it("auto-detects format when not specified", () => {
      const content = `
resource "aws_instance" "web" {
  instance_type = "t2.micro"
}
`;
      const resources = analyzer.scanContent(content);
      expect(resources.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- calculateCosts ---

  describe("calculateCosts", () => {
    it("calculates correct hourly, daily, and monthly costs", () => {
      const resources = analyzer.scanContent(
        'Resources:\n  NatGW:\n    Type: AWS::EC2::NatGateway',
        TutorialFormat.CLOUDFORMATION
      );
      const natGw = resources.find((r) => r.resourceType === "NAT Gateway");
      expect(natGw).toBeDefined();

      const costs = analyzer.calculateCosts([natGw!]);
      expect(costs.hourlyRate).toBe(0.045);
      expect(costs.dailyCost).toBeCloseTo(0.045 * 24, 2);
      expect(costs.monthlyCost).toBeCloseTo(0.045 * 730, 2);
    });

    it("sums costs across multiple resources", () => {
      const resources = [
        {
          resourceId: "nat-1",
          resourceType: "NAT Gateway",
          configuration: { region: "us-east-1" },
          pricing: { hourlyRate: 0.045, dailyCost: 1.08, monthlyCost: 32.85, pricingModel: "On-Demand" },
          freeTierEligible: false,
          deploymentMethod: "CloudFormation",
        },
        {
          resourceId: "alb-1",
          resourceType: "ALB",
          configuration: { region: "us-east-1" },
          pricing: { hourlyRate: 0.0225, dailyCost: 0.54, monthlyCost: 16.425, pricingModel: "On-Demand" },
          freeTierEligible: false,
          deploymentMethod: "CloudFormation",
        },
      ];
      const costs = analyzer.calculateCosts(resources);

      const expectedHourly = 0.045 + 0.0225;
      expect(costs.hourlyRate).toBeCloseTo(expectedHourly, 4);
    });

    it("returns zero costs for empty resource list", () => {
      const costs = analyzer.calculateCosts([]);
      expect(costs.hourlyRate).toBe(0);
      expect(costs.dailyCost).toBe(0);
      expect(costs.monthlyCost).toBe(0);
    });

    it("generates three cost scenarios", () => {
      const content = 'Resources:\n  NatGW:\n    Type: AWS::EC2::NatGateway';
      const resources = analyzer.scanContent(content, TutorialFormat.CLOUDFORMATION);
      const costs = analyzer.calculateCosts(resources);

      expect(costs.scenarios).toHaveLength(3);
      expect(costs.scenarios[0].name).toBe("If deleted after workshop");
      expect(costs.scenarios[1].name).toBe("If left running 1 day");
      expect(costs.scenarios[2].name).toBe("If left running 1 month");
    });

    it("scenario costs are ordered: workshop <= 1 day <= 1 month", () => {
      const content = `
Resources:
  Instance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: m5.large
  NatGW:
    Type: AWS::EC2::NatGateway
`;
      const resources = analyzer.scanContent(content, TutorialFormat.CLOUDFORMATION);
      const costs = analyzer.calculateCosts(resources);

      expect(costs.scenarios[0].totalCost).toBeLessThanOrEqual(costs.scenarios[1].totalCost);
      expect(costs.scenarios[1].totalCost).toBeLessThanOrEqual(costs.scenarios[2].totalCost);
    });

    it("all costs are non-negative", () => {
      const content = `
Resources:
  Instance:
    Type: AWS::EC2::Instance
  Bucket:
    Type: AWS::S3::Bucket
  Function:
    Type: AWS::Lambda::Function
`;
      const resources = analyzer.scanContent(content, TutorialFormat.CLOUDFORMATION);
      const costs = analyzer.calculateCosts(resources);

      expect(costs.hourlyRate).toBeGreaterThanOrEqual(0);
      expect(costs.dailyCost).toBeGreaterThanOrEqual(0);
      expect(costs.monthlyCost).toBeGreaterThanOrEqual(0);
      for (const scenario of costs.scenarios) {
        expect(scenario.totalCost).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // --- analyzeTutorial ---

  describe("analyzeTutorial", () => {
    it("produces a complete CostAnalysis for a CloudFormation tutorial", async () => {
      const tutorial: Tutorial = {
        content: `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: t2.micro
  NatGW:
    Type: AWS::EC2::NatGateway
  MyBucket:
    Type: AWS::S3::Bucket
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.resources.length).toBeGreaterThanOrEqual(3);
      expect(analysis.totalCosts.hourlyRate).toBeGreaterThan(0);
      expect(analysis.totalCosts.scenarios).toHaveLength(3);
      expect(analysis.generatedAt).toBeInstanceOf(Date);
    });

    it("identifies free tier eligible resources", async () => {
      const tutorial: Tutorial = {
        content: `
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
  MyFunction:
    Type: AWS::Lambda::Function
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.freeTierEligible).toBe(true);
      for (const resource of analysis.resources) {
        expect(resource.freeTierEligible).toBe(true);
      }
    });

    it("marks analysis as not free tier eligible when expensive resources present", async () => {
      const tutorial: Tutorial = {
        content: `
Resources:
  NatGW:
    Type: AWS::EC2::NatGateway
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.freeTierEligible).toBe(false);
    });

    it("detects hidden costs for NAT Gateway", async () => {
      const tutorial: Tutorial = {
        content: `
Resources:
  NatGW:
    Type: AWS::EC2::NatGateway
    Properties:
      SubnetId: subnet-123
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.hiddenCosts.length).toBeGreaterThanOrEqual(1);
      expect(analysis.hiddenCosts[0].resource.resourceType).toBe("NAT Gateway");
      expect(analysis.hiddenCosts[0].impact).toBeGreaterThan(0);
    });

    it("generates warnings for expensive services", async () => {
      const tutorial: Tutorial = {
        content: `
Resources:
  NatGW:
    Type: AWS::EC2::NatGateway
  ALB:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.warnings.length).toBeGreaterThan(0);
      const expensiveWarning = analysis.warnings.find((w) =>
        w.message.includes("Most expensive")
      );
      expect(expensiveWarning).toBeDefined();
    });

    it("handles Terraform tutorials", async () => {
      const tutorial: Tutorial = {
        content: `
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t3.medium"
}
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
}
`,
        format: TutorialFormat.TERRAFORM,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.resources.length).toBeGreaterThanOrEqual(2);
      const types = analysis.resources.map((r) => r.resourceType);
      expect(types).toContain("EC2");
      expect(types).toContain("S3");
    });

    it("handles AWS CLI tutorials", async () => {
      const tutorial: Tutorial = {
        content: `
# Step 1: Create an S3 bucket
aws s3 mb s3://my-workshop-bucket

# Step 2: Launch an EC2 instance
aws ec2 run-instances --image-id ami-12345 --instance-type t2.micro --count 1

# Step 3: Create a DynamoDB table
aws dynamodb create-table --table-name MyTable --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH
`,
        format: TutorialFormat.AWS_CLI,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.resources.length).toBeGreaterThanOrEqual(2);
    });

    it("handles instructional text tutorials", async () => {
      const tutorial: Tutorial = {
        content: `
In this workshop, you will:
1. Create an S3 bucket for storing files
2. Set up a Lambda function to process uploads
3. Configure an API Gateway endpoint
4. Create a DynamoDB table for metadata
`,
        format: TutorialFormat.INSTRUCTIONAL_TEXT,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.resources.length).toBeGreaterThanOrEqual(3);
      expect(analysis.freeTierEligible).toBe(true);
    });

    it("returns empty analysis for content with no resources", async () => {
      const tutorial: Tutorial = {
        content: "This is a conceptual overview of cloud computing.",
        format: TutorialFormat.INSTRUCTIONAL_TEXT,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.resources).toHaveLength(0);
      expect(analysis.totalCosts.hourlyRate).toBe(0);
      expect(analysis.totalCosts.monthlyCost).toBe(0);
      expect(analysis.freeTierEligible).toBe(true);
    });

    it("highlights most expensive services in warnings", async () => {
      const tutorial: Tutorial = {
        content: `
Resources:
  Cluster:
    Type: AWS::EKS::Cluster
  NatGW:
    Type: AWS::EC2::NatGateway
  Bucket:
    Type: AWS::S3::Bucket
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      const expensiveWarning = analysis.warnings.find((w) =>
        w.message.includes("Most expensive")
      );
      expect(expensiveWarning).toBeDefined();
      // EKS is more expensive than NAT Gateway
      expect(expensiveWarning!.message).toContain("EKS");
    });

    it("warns about non-free-tier resources", async () => {
      const tutorial: Tutorial = {
        content: `
Resources:
  NatGW:
    Type: AWS::EC2::NatGateway
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      const nonFreeWarning = analysis.warnings.find((w) =>
        w.message.includes("not free tier eligible")
      );
      expect(nonFreeWarning).toBeDefined();
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("handles mixed format tutorial with all parser types", async () => {
      const tutorial: Tutorial = {
        content: `
# Workshop: Full Stack App

## Step 1: Deploy infrastructure with CloudFormation
Resources:
  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: t2.micro

## Step 2: Create additional resources via CLI
aws s3 mb s3://my-bucket
aws dynamodb create-table --table-name Users

## Step 3: Deploy with Terraform
resource "aws_lambda_function" "processor" {
  function_name = "data-processor"
}

Also set up an API Gateway endpoint for the frontend.
`,
        format: TutorialFormat.MIXED,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);

      expect(analysis.resources.length).toBeGreaterThanOrEqual(3);
    });

    it("cost scenario ordering holds for free-tier-only resources", async () => {
      const tutorial: Tutorial = {
        content: `
Resources:
  Bucket:
    Type: AWS::S3::Bucket
  Function:
    Type: AWS::Lambda::Function
`,
        format: TutorialFormat.CLOUDFORMATION,
      };

      const analysis = await analyzer.analyzeTutorial(tutorial);
      const scenarios = analysis.totalCosts.scenarios;

      expect(scenarios[0].totalCost).toBeLessThanOrEqual(scenarios[1].totalCost);
      expect(scenarios[1].totalCost).toBeLessThanOrEqual(scenarios[2].totalCost);
    });
  });
});

// ============================================================
// Mapping coverage tests
// ============================================================

describe("resource mapping tables", () => {
  it("CFN_RESOURCE_MAP covers common AWS resource types", () => {
    expect(CFN_RESOURCE_MAP["AWS::EC2::Instance"]).toBe("EC2");
    expect(CFN_RESOURCE_MAP["AWS::RDS::DBInstance"]).toBe("RDS");
    expect(CFN_RESOURCE_MAP["AWS::EC2::NatGateway"]).toBe("NAT Gateway");
    expect(CFN_RESOURCE_MAP["AWS::Lambda::Function"]).toBe("Lambda");
    expect(CFN_RESOURCE_MAP["AWS::S3::Bucket"]).toBe("S3");
    expect(CFN_RESOURCE_MAP["AWS::EKS::Cluster"]).toBe("EKS");
  });

  it("TF_RESOURCE_MAP covers common Terraform resource types", () => {
    expect(TF_RESOURCE_MAP["aws_instance"]).toBe("EC2");
    expect(TF_RESOURCE_MAP["aws_db_instance"]).toBe("RDS");
    expect(TF_RESOURCE_MAP["aws_nat_gateway"]).toBe("NAT Gateway");
    expect(TF_RESOURCE_MAP["aws_lambda_function"]).toBe("Lambda");
    expect(TF_RESOURCE_MAP["aws_s3_bucket"]).toBe("S3");
    expect(TF_RESOURCE_MAP["aws_eks_cluster"]).toBe("EKS");
  });

  it("CLI_COMMAND_MAP covers common AWS CLI commands", () => {
    expect(CLI_COMMAND_MAP["ec2 run-instances"]).toBe("EC2");
    expect(CLI_COMMAND_MAP["rds create-db-instance"]).toBe("RDS");
    expect(CLI_COMMAND_MAP["s3 mb"]).toBe("S3");
    expect(CLI_COMMAND_MAP["eks create-cluster"]).toBe("EKS");
    expect(CLI_COMMAND_MAP["lambda create-function"]).toBe("Lambda");
  });

  it("PRICING_TABLE has entries for all common resource types", () => {
    const expectedTypes = ["EC2", "RDS", "NAT Gateway", "ALB", "Lambda", "S3", "DynamoDB", "EKS"];
    for (const type of expectedTypes) {
      expect(PRICING_TABLE[type]).toBeDefined();
    }
  });
});

import {
  TutorialFormat,
  type Tutorial,
  type CostAnalysis,
  type AWSResource,
  type CostBreakdown,
  type CostScenario,
  type ResourcePricing,
  type ResourceConfig,
  type HiddenCost,
  type CostWarning,
} from "@aws-intel/shared";

// --- Local pricing lookup table (approximate hourly rates in USD) ---

export interface PricingEntry {
  hourlyRate: number;
  freeTierEligible: boolean;
  freeTierLimit?: string;
  description: string;
}

export const PRICING_TABLE: Record<string, PricingEntry> = {
  "EC2": { hourlyRate: 0.0116, freeTierEligible: true, freeTierLimit: "750 hrs/month t2.micro", description: "Elastic Compute Cloud" },
  "EC2:t2.micro": { hourlyRate: 0.0116, freeTierEligible: true, freeTierLimit: "750 hrs/month", description: "EC2 t2.micro" },
  "EC2:t2.small": { hourlyRate: 0.023, freeTierEligible: false, description: "EC2 t2.small" },
  "EC2:t2.medium": { hourlyRate: 0.0464, freeTierEligible: false, description: "EC2 t2.medium" },
  "EC2:t2.large": { hourlyRate: 0.0928, freeTierEligible: false, description: "EC2 t2.large" },
  "EC2:t3.micro": { hourlyRate: 0.0104, freeTierEligible: true, freeTierLimit: "750 hrs/month", description: "EC2 t3.micro" },
  "EC2:t3.small": { hourlyRate: 0.0208, freeTierEligible: false, description: "EC2 t3.small" },
  "EC2:t3.medium": { hourlyRate: 0.0416, freeTierEligible: false, description: "EC2 t3.medium" },
  "EC2:t3.large": { hourlyRate: 0.0832, freeTierEligible: false, description: "EC2 t3.large" },
  "EC2:m5.large": { hourlyRate: 0.096, freeTierEligible: false, description: "EC2 m5.large" },
  "EC2:m5.xlarge": { hourlyRate: 0.192, freeTierEligible: false, description: "EC2 m5.xlarge" },
  "RDS": { hourlyRate: 0.017, freeTierEligible: true, freeTierLimit: "750 hrs/month db.t2.micro", description: "Relational Database Service" },
  "RDS:db.t2.micro": { hourlyRate: 0.017, freeTierEligible: true, freeTierLimit: "750 hrs/month", description: "RDS db.t2.micro" },
  "RDS:db.t3.micro": { hourlyRate: 0.017, freeTierEligible: true, freeTierLimit: "750 hrs/month", description: "RDS db.t3.micro" },
  "RDS:db.t3.small": { hourlyRate: 0.034, freeTierEligible: false, description: "RDS db.t3.small" },
  "RDS:db.t3.medium": { hourlyRate: 0.068, freeTierEligible: false, description: "RDS db.t3.medium" },
  "RDS:db.r5.large": { hourlyRate: 0.24, freeTierEligible: false, description: "RDS db.r5.large" },
  "NAT Gateway": { hourlyRate: 0.045, freeTierEligible: false, description: "NAT Gateway" },
  "ALB": { hourlyRate: 0.0225, freeTierEligible: false, description: "Application Load Balancer" },
  "NLB": { hourlyRate: 0.0225, freeTierEligible: false, description: "Network Load Balancer" },
  "ELB": { hourlyRate: 0.025, freeTierEligible: false, description: "Classic Load Balancer" },
  "Elastic IP": { hourlyRate: 0.005, freeTierEligible: false, description: "Elastic IP (unattached)" },
  "ECS": { hourlyRate: 0.0, freeTierEligible: true, description: "ECS (control plane free, compute separate)" },
  "EKS": { hourlyRate: 0.10, freeTierEligible: false, description: "Elastic Kubernetes Service" },
  "Lambda": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "1M requests/month", description: "AWS Lambda" },
  "S3": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "5 GB storage", description: "Simple Storage Service" },
  "DynamoDB": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "25 GB storage, 25 WCU/RCU", description: "DynamoDB" },
  "CloudFront": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "1 TB data transfer/month", description: "CloudFront CDN" },
  "API Gateway": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "1M API calls/month", description: "API Gateway" },
  "SNS": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "1M publishes/month", description: "Simple Notification Service" },
  "SQS": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "1M requests/month", description: "Simple Queue Service" },
  "ElastiCache": { hourlyRate: 0.017, freeTierEligible: true, freeTierLimit: "750 hrs/month cache.t2.micro", description: "ElastiCache" },
  "ElastiCache:cache.t2.micro": { hourlyRate: 0.017, freeTierEligible: true, freeTierLimit: "750 hrs/month", description: "ElastiCache cache.t2.micro" },
  "ElastiCache:cache.r5.large": { hourlyRate: 0.166, freeTierEligible: false, description: "ElastiCache cache.r5.large" },
  "Redshift": { hourlyRate: 0.25, freeTierEligible: false, description: "Amazon Redshift" },
  "CloudWatch": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "10 custom metrics", description: "CloudWatch" },
  "Fargate": { hourlyRate: 0.04048, freeTierEligible: false, description: "AWS Fargate (per vCPU-hour)" },
  "SageMaker": { hourlyRate: 0.0464, freeTierEligible: true, freeTierLimit: "250 hrs/month ml.t2.medium", description: "SageMaker Notebook" },
  "Neptune": { hourlyRate: 0.348, freeTierEligible: false, description: "Amazon Neptune" },
  "DocumentDB": { hourlyRate: 0.28, freeTierEligible: false, description: "Amazon DocumentDB" },
  "OpenSearch": { hourlyRate: 0.036, freeTierEligible: true, freeTierLimit: "750 hrs/month t2.small.search", description: "OpenSearch Service" },
  "Kinesis": { hourlyRate: 0.015, freeTierEligible: false, description: "Kinesis Data Streams (per shard)" },
  "MSK": { hourlyRate: 0.21, freeTierEligible: false, description: "Managed Streaming for Kafka" },
  "VPN Gateway": { hourlyRate: 0.05, freeTierEligible: false, description: "VPN Gateway" },
  "Transit Gateway": { hourlyRate: 0.05, freeTierEligible: false, description: "Transit Gateway" },
  "EFS": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "5 GB storage", description: "Elastic File System" },
  "EBS": { hourlyRate: 0.0, freeTierEligible: true, freeTierLimit: "30 GB storage", description: "Elastic Block Store" },
  "Glue": { hourlyRate: 0.44, freeTierEligible: false, description: "AWS Glue ETL" },
};

// --- Common hidden cost resource types ---

const HIDDEN_COST_RESOURCES = [
  "NAT Gateway",
  "ALB",
  "NLB",
  "ELB",
  "Elastic IP",
  "CloudWatch",
  "EBS",
  "VPN Gateway",
  "Transit Gateway",
];

// --- CloudFormation resource type to our resource type mapping ---

export const CFN_RESOURCE_MAP: Record<string, string> = {
  "AWS::EC2::Instance": "EC2",
  "AWS::RDS::DBInstance": "RDS",
  "AWS::EC2::NatGateway": "NAT Gateway",
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "ALB",
  "AWS::ElasticLoadBalancing::LoadBalancer": "ELB",
  "AWS::EC2::EIP": "Elastic IP",
  "AWS::ECS::Cluster": "ECS",
  "AWS::ECS::Service": "ECS",
  "AWS::EKS::Cluster": "EKS",
  "AWS::Lambda::Function": "Lambda",
  "AWS::S3::Bucket": "S3",
  "AWS::DynamoDB::Table": "DynamoDB",
  "AWS::CloudFront::Distribution": "CloudFront",
  "AWS::ApiGateway::RestApi": "API Gateway",
  "AWS::ApiGatewayV2::Api": "API Gateway",
  "AWS::SNS::Topic": "SNS",
  "AWS::SQS::Queue": "SQS",
  "AWS::ElastiCache::CacheCluster": "ElastiCache",
  "AWS::ElastiCache::ReplicationGroup": "ElastiCache",
  "AWS::Redshift::Cluster": "Redshift",
  "AWS::SageMaker::NotebookInstance": "SageMaker",
  "AWS::Neptune::DBCluster": "Neptune",
  "AWS::DocDB::DBCluster": "DocumentDB",
  "AWS::OpenSearchService::Domain": "OpenSearch",
  "AWS::Elasticsearch::Domain": "OpenSearch",
  "AWS::Kinesis::Stream": "Kinesis",
  "AWS::MSK::Cluster": "MSK",
  "AWS::EC2::VPNGateway": "VPN Gateway",
  "AWS::EC2::TransitGateway": "Transit Gateway",
  "AWS::EFS::FileSystem": "EFS",
  "AWS::CloudWatch::Alarm": "CloudWatch",
  "AWS::Glue::Job": "Glue",
};


// --- Terraform resource type to our resource type mapping ---

export const TF_RESOURCE_MAP: Record<string, string> = {
  "aws_instance": "EC2",
  "aws_db_instance": "RDS",
  "aws_nat_gateway": "NAT Gateway",
  "aws_lb": "ALB",
  "aws_alb": "ALB",
  "aws_elb": "ELB",
  "aws_eip": "Elastic IP",
  "aws_ecs_cluster": "ECS",
  "aws_ecs_service": "ECS",
  "aws_eks_cluster": "EKS",
  "aws_lambda_function": "Lambda",
  "aws_s3_bucket": "S3",
  "aws_dynamodb_table": "DynamoDB",
  "aws_cloudfront_distribution": "CloudFront",
  "aws_api_gateway_rest_api": "API Gateway",
  "aws_apigatewayv2_api": "API Gateway",
  "aws_sns_topic": "SNS",
  "aws_sqs_queue": "SQS",
  "aws_elasticache_cluster": "ElastiCache",
  "aws_elasticache_replication_group": "ElastiCache",
  "aws_redshift_cluster": "Redshift",
  "aws_sagemaker_notebook_instance": "SageMaker",
  "aws_neptune_cluster": "Neptune",
  "aws_docdb_cluster": "DocumentDB",
  "aws_opensearch_domain": "OpenSearch",
  "aws_elasticsearch_domain": "OpenSearch",
  "aws_kinesis_stream": "Kinesis",
  "aws_msk_cluster": "MSK",
  "aws_vpn_gateway": "VPN Gateway",
  "aws_ec2_transit_gateway": "Transit Gateway",
  "aws_efs_file_system": "EFS",
  "aws_cloudwatch_metric_alarm": "CloudWatch",
  "aws_glue_job": "Glue",
};

// --- AWS CLI command to resource type mapping ---

export const CLI_COMMAND_MAP: Record<string, string> = {
  "ec2 run-instances": "EC2",
  "ec2 create-nat-gateway": "NAT Gateway",
  "ec2 allocate-address": "Elastic IP",
  "ec2 create-vpc-endpoint": "VPN Gateway",
  "ec2 create-transit-gateway": "Transit Gateway",
  "rds create-db-instance": "RDS",
  "rds create-db-cluster": "RDS",
  "elbv2 create-load-balancer": "ALB",
  "elb create-load-balancer": "ELB",
  "ecs create-cluster": "ECS",
  "ecs create-service": "ECS",
  "eks create-cluster": "EKS",
  "lambda create-function": "Lambda",
  "s3 mb": "S3",
  "s3api create-bucket": "S3",
  "dynamodb create-table": "DynamoDB",
  "cloudfront create-distribution": "CloudFront",
  "apigateway create-rest-api": "API Gateway",
  "sns create-topic": "SNS",
  "sqs create-queue": "SQS",
  "elasticache create-cache-cluster": "ElastiCache",
  "elasticache create-replication-group": "ElastiCache",
  "redshift create-cluster": "Redshift",
  "sagemaker create-notebook-instance": "SageMaker",
  "neptune create-db-cluster": "Neptune",
  "opensearch create-domain": "OpenSearch",
  "kinesis create-stream": "Kinesis",
  "kafka create-cluster": "MSK",
  "efs create-file-system": "EFS",
  "glue create-job": "Glue",
};

// --- NLP keyword patterns for instructional text ---

const RESOURCE_KEYWORDS: Record<string, string[]> = {
  "EC2": ["ec2 instance", "ec2", "virtual machine", "compute instance"],
  "RDS": ["rds instance", "rds", "relational database", "mysql instance", "postgres instance", "aurora"],
  "NAT Gateway": ["nat gateway"],
  "ALB": ["application load balancer", "alb"],
  "NLB": ["network load balancer", "nlb"],
  "ELB": ["elastic load balancer", "classic load balancer", "elb"],
  "Elastic IP": ["elastic ip", "eip"],
  "ECS": ["ecs cluster", "ecs service", "ecs"],
  "EKS": ["eks cluster", "eks", "kubernetes"],
  "Lambda": ["lambda function", "lambda"],
  "S3": ["s3 bucket", "s3"],
  "DynamoDB": ["dynamodb table", "dynamodb"],
  "CloudFront": ["cloudfront distribution", "cloudfront"],
  "API Gateway": ["api gateway"],
  "SNS": ["sns topic", "sns"],
  "SQS": ["sqs queue", "sqs"],
  "ElastiCache": ["elasticache", "redis cluster", "memcached"],
  "Redshift": ["redshift cluster", "redshift"],
  "SageMaker": ["sagemaker notebook", "sagemaker"],
  "Neptune": ["neptune"],
  "DocumentDB": ["documentdb"],
  "OpenSearch": ["opensearch", "elasticsearch"],
  "Kinesis": ["kinesis stream", "kinesis"],
  "MSK": ["msk", "managed kafka"],
  "EFS": ["efs", "elastic file system"],
  "EBS": ["ebs volume", "ebs"],
  "CloudWatch": ["cloudwatch"],
  "Fargate": ["fargate"],
  "Glue": ["glue job", "glue"],
  "VPN Gateway": ["vpn gateway"],
  "Transit Gateway": ["transit gateway"],
};

// --- Helper: generate a unique resource ID ---

let resourceCounter = 0;

export function generateResourceId(resourceType: string): string {
  resourceCounter++;
  const prefix = resourceType.toLowerCase().replace(/\s+/g, "-");
  return `${prefix}-${resourceCounter}`;
}

export function resetResourceCounter(): void {
  resourceCounter = 0;
}

// --- Helper: look up pricing for a resource type with optional instance type ---

export function lookupPricing(resourceType: string, instanceType?: string): PricingEntry {
  // Try specific instance type first
  if (instanceType) {
    const specificKey = `${resourceType}:${instanceType}`;
    if (PRICING_TABLE[specificKey]) {
      return PRICING_TABLE[specificKey];
    }
  }

  // Fall back to base resource type
  if (PRICING_TABLE[resourceType]) {
    return PRICING_TABLE[resourceType];
  }

  // Default unknown resource
  return {
    hourlyRate: 0.0,
    freeTierEligible: false,
    description: `Unknown resource: ${resourceType}`,
  };
}

// --- Helper: build ResourcePricing from a PricingEntry ---

function buildResourcePricing(entry: PricingEntry): ResourcePricing {
  return {
    hourlyRate: entry.hourlyRate,
    dailyCost: Math.round(entry.hourlyRate * 24 * 10000) / 10000,
    monthlyCost: Math.round(entry.hourlyRate * 730 * 10000) / 10000,
    pricingModel: "On-Demand",
  };
}

// --- Helper: detect tutorial format ---

export function detectFormat(content: string): TutorialFormat {
  const hasCloudFormation =
    content.includes("AWSTemplateFormatVersion") ||
    content.includes("AWS::") ||
    /Resources:\s*\n/m.test(content);
  const hasTerraform =
    content.includes("resource \"aws_") ||
    content.includes("provider \"aws\"") ||
    /terraform\s*\{/.test(content);
  const hasCli =
    /aws\s+\w+\s+(create|run|allocate|put|mb)\b/.test(content);
  const hasInstructional =
    /\b(create|deploy|launch|set up|provision)\b.*\b(instance|bucket|cluster|function|table|gateway)\b/i.test(content);

  const formats: TutorialFormat[] = [];
  if (hasCloudFormation) formats.push(TutorialFormat.CLOUDFORMATION);
  if (hasTerraform) formats.push(TutorialFormat.TERRAFORM);
  if (hasCli) formats.push(TutorialFormat.AWS_CLI);
  if (hasInstructional) formats.push(TutorialFormat.INSTRUCTIONAL_TEXT);

  if (formats.length === 0) return TutorialFormat.INSTRUCTIONAL_TEXT;
  if (formats.length === 1) return formats[0];
  return TutorialFormat.MIXED;
}


// --- Parsers ---

/**
 * Parse CloudFormation template content to extract AWS resources.
 */
export function parseCloudFormation(content: string): AWSResource[] {
  const resources: AWSResource[] = [];

  // Match "Type: AWS::Service::Resource" patterns in YAML/JSON
  const typeRegex = /["']?Type["']?\s*[:=]\s*["']?(AWS::[A-Za-z0-9:]+)["']?/g;
  let match: RegExpExecArray | null;

  const seenTypes = new Set<string>();

  while ((match = typeRegex.exec(content)) !== null) {
    const cfnType = match[1];
    const resourceType = CFN_RESOURCE_MAP[cfnType];
    if (!resourceType) continue;

    // Avoid duplicating the same resource type from the same template section
    const key = `${cfnType}-${match.index}`;
    if (seenTypes.has(key)) continue;
    seenTypes.add(key);

    // Try to extract instance type from nearby content
    const instanceType = extractInstanceTypeNear(content, match.index);
    const pricingEntry = lookupPricing(resourceType, instanceType);
    const pricing = buildResourcePricing(pricingEntry);

    const config: ResourceConfig = {
      region: "us-east-1",
    };
    if (instanceType) config.instanceType = instanceType;

    resources.push({
      resourceId: generateResourceId(resourceType),
      resourceType,
      configuration: config,
      pricing,
      freeTierEligible: pricingEntry.freeTierEligible,
      deploymentMethod: "CloudFormation",
    });
  }

  return resources;
}

/**
 * Parse Terraform content to extract AWS resources.
 */
export function parseTerraform(content: string): AWSResource[] {
  const resources: AWSResource[] = [];

  // Match resource "aws_xxx" "name" { ... } blocks
  const resourceRegex = /resource\s+"(aws_[a-z0-9_]+)"\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = resourceRegex.exec(content)) !== null) {
    const tfType = match[1];
    const resourceType = TF_RESOURCE_MAP[tfType];
    if (!resourceType) continue;

    const instanceType = extractInstanceTypeNear(content, match.index);
    const pricingEntry = lookupPricing(resourceType, instanceType);
    const pricing = buildResourcePricing(pricingEntry);

    const config: ResourceConfig = {
      region: "us-east-1",
    };
    if (instanceType) config.instanceType = instanceType;

    resources.push({
      resourceId: generateResourceId(resourceType),
      resourceType,
      configuration: config,
      pricing,
      freeTierEligible: pricingEntry.freeTierEligible,
      deploymentMethod: "Terraform",
    });
  }

  return resources;
}

/**
 * Parse AWS CLI commands to extract resource creation commands.
 */
export function parseAWSCLI(content: string): AWSResource[] {
  const resources: AWSResource[] = [];

  for (const [command, resourceType] of Object.entries(CLI_COMMAND_MAP)) {
    // Match "aws <command>" pattern
    const escapedCmd = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`aws\\s+${escapedCmd}\\b`, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const instanceType = extractInstanceTypeNear(content, match.index);
      const pricingEntry = lookupPricing(resourceType, instanceType);
      const pricing = buildResourcePricing(pricingEntry);

      const config: ResourceConfig = {
        region: "us-east-1",
      };
      if (instanceType) config.instanceType = instanceType;

      resources.push({
        resourceId: generateResourceId(resourceType),
        resourceType,
        configuration: config,
        pricing,
        freeTierEligible: pricingEntry.freeTierEligible,
        deploymentMethod: "AWS CLI",
      });
    }
  }

  return resources;
}

/**
 * Parse instructional text for resource mentions using keyword matching (NLP-like).
 */
export function parseInstructionalText(content: string): AWSResource[] {
  const resources: AWSResource[] = [];
  const lowerContent = content.toLowerCase();
  const foundTypes = new Set<string>();

  // Sort keywords by length descending so longer phrases match first
  const entries = Object.entries(RESOURCE_KEYWORDS).sort(
    (a, b) => Math.max(...b[1].map((k) => k.length)) - Math.max(...a[1].map((k) => k.length))
  );

  for (const [resourceType, keywords] of entries) {
    if (foundTypes.has(resourceType)) continue;

    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        foundTypes.add(resourceType);

        const pricingEntry = lookupPricing(resourceType);
        const pricing = buildResourcePricing(pricingEntry);

        resources.push({
          resourceId: generateResourceId(resourceType),
          resourceType,
          configuration: { region: "us-east-1" },
          pricing,
          freeTierEligible: pricingEntry.freeTierEligible,
          deploymentMethod: "Instructional Text",
        });
        break;
      }
    }
  }

  return resources;
}

/**
 * Extract instance type from content near a given position.
 * Looks for patterns like "t2.micro", "db.t3.medium", "cache.r5.large", etc.
 */
function extractInstanceTypeNear(content: string, position: number): string | undefined {
  // Look within 500 chars after the match
  const searchWindow = content.slice(position, position + 500);
  const instanceTypeRegex = /(?:db\.|cache\.|ml\.)?[a-z][0-9][a-z]?\.\w+/i;
  const match = searchWindow.match(instanceTypeRegex);
  return match ? match[0] : undefined;
}

/**
 * Deduplicate resources by type and deployment method.
 * If the same resource type appears from multiple parsers, keep the one
 * with the most specific configuration (has instanceType).
 */
function deduplicateResources(resources: AWSResource[]): AWSResource[] {
  const byTypeAndMethod = new Map<string, AWSResource>();

  for (const resource of resources) {
    const key = `${resource.resourceType}:${resource.deploymentMethod}`;
    const existing = byTypeAndMethod.get(key);

    if (!existing) {
      byTypeAndMethod.set(key, resource);
    } else if (resource.configuration.instanceType && !existing.configuration.instanceType) {
      // Prefer the one with instance type info
      byTypeAndMethod.set(key, resource);
    }
  }

  // Also deduplicate across deployment methods — keep the most specific
  const byType = new Map<string, AWSResource>();
  for (const resource of byTypeAndMethod.values()) {
    const existing = byType.get(resource.resourceType);
    if (!existing) {
      byType.set(resource.resourceType, resource);
    } else if (
      resource.configuration.instanceType &&
      !existing.configuration.instanceType
    ) {
      byType.set(resource.resourceType, resource);
    } else if (
      resource.deploymentMethod !== "Instructional Text" &&
      existing.deploymentMethod === "Instructional Text"
    ) {
      // Prefer structured parsers over instructional text
      byType.set(resource.resourceType, resource);
    }
  }

  return Array.from(byType.values());
}


// --- CostAnalyzer class ---

export class CostAnalyzer {
  /**
   * Analyze a tutorial and produce a full CostAnalysis.
   * Requirements: 30.2, 30.3, 31.1-31.5, 32.1-32.5
   */
  async analyzeTutorial(tutorial: Tutorial): Promise<CostAnalysis> {
    resetResourceCounter();

    const resources = this.scanContent(tutorial.content, tutorial.format);
    const totalCosts = this.calculateCosts(resources);
    const hiddenCosts = this.detectHiddenCosts(tutorial.content, resources);
    const warnings = this.generateWarnings(resources, hiddenCosts);
    const freeTierEligible = resources.length === 0 || resources.every((r) => r.freeTierEligible);

    return {
      totalCosts,
      resources,
      hiddenCosts,
      freeTierEligible,
      warnings,
      generatedAt: new Date(),
    };
  }

  /**
   * Scan tutorial content and extract all AWS resources.
   * Uses format-specific parsers and deduplicates results.
   * Requirements: 30.2, 32.2
   */
  scanContent(content: string, format?: TutorialFormat): AWSResource[] {
    const detectedFormat = format ?? detectFormat(content);
    let allResources: AWSResource[] = [];

    if (
      detectedFormat === TutorialFormat.CLOUDFORMATION ||
      detectedFormat === TutorialFormat.MIXED
    ) {
      allResources.push(...parseCloudFormation(content));
    }

    if (
      detectedFormat === TutorialFormat.TERRAFORM ||
      detectedFormat === TutorialFormat.MIXED
    ) {
      allResources.push(...parseTerraform(content));
    }

    if (
      detectedFormat === TutorialFormat.AWS_CLI ||
      detectedFormat === TutorialFormat.MIXED
    ) {
      allResources.push(...parseAWSCLI(content));
    }

    // Always try instructional text as a fallback
    allResources.push(...parseInstructionalText(content));

    return deduplicateResources(allResources);
  }

  /**
   * Calculate cost breakdown for a set of resources.
   * Generates hourly, daily, monthly costs and three scenarios.
   * Requirements: 31.2, 31.4
   */
  calculateCosts(resources: AWSResource[]): CostBreakdown {
    let totalHourly = 0;

    for (const resource of resources) {
      totalHourly += resource.pricing.hourlyRate;
    }

    const hourlyRate = Math.round(totalHourly * 10000) / 10000;
    const dailyCost = Math.round(totalHourly * 24 * 10000) / 10000;
    const monthlyCost = Math.round(totalHourly * 730 * 10000) / 10000;

    const scenarios = this.generateScenarios(resources, hourlyRate);

    return {
      hourlyRate,
      dailyCost,
      monthlyCost,
      scenarios,
    };
  }

  /**
   * Generate three cost scenarios:
   * 1. "If deleted after workshop" — assume 2 hours of usage
   * 2. "If left running 1 day" — 24 hours
   * 3. "If left running 1 month" — 730 hours
   * Requirements: 31.4
   */
  private generateScenarios(resources: AWSResource[], hourlyRate: number): CostScenario[] {
    const workshopHours = 2;

    return [
      {
        name: "If deleted after workshop",
        totalCost: Math.round(hourlyRate * workshopHours * 10000) / 10000,
        description: `Cost if all resources are deleted after a ${workshopHours}-hour workshop session`,
      },
      {
        name: "If left running 1 day",
        totalCost: Math.round(hourlyRate * 24 * 10000) / 10000,
        description: "Cost if all resources are left running for 24 hours",
      },
      {
        name: "If left running 1 month",
        totalCost: Math.round(hourlyRate * 730 * 10000) / 10000,
        description: "Cost if all resources are left running for 1 month (730 hours)",
      },
    ];
  }

  /**
   * Detect hidden costs — resources that incur costs but may not be
   * explicitly mentioned in the tutorial text.
   * Requirements: 33.1, 33.4
   */
  private detectHiddenCosts(content: string, resources: AWSResource[]): HiddenCost[] {
    const hiddenCosts: HiddenCost[] = [];
    const lowerContent = content.toLowerCase();

    for (const resource of resources) {
      if (!HIDDEN_COST_RESOURCES.includes(resource.resourceType)) continue;
      if (resource.pricing.hourlyRate <= 0) continue;

      // Check if the resource type is explicitly mentioned in the tutorial text
      const keywords = RESOURCE_KEYWORDS[resource.resourceType] ?? [];
      const isMentioned = keywords.some((kw) => lowerContent.includes(kw));

      // If the resource was found via structured parsing (CFN/TF/CLI) but
      // not mentioned in the instructional text, it's a hidden cost
      if (
        resource.deploymentMethod !== "Instructional Text" ||
        !isMentioned
      ) {
        const monthlyCost = resource.pricing.monthlyCost;
        const severity: "high" | "medium" | "low" =
          monthlyCost > 50 ? "high" : monthlyCost > 10 ? "medium" : "low";

        hiddenCosts.push({
          resource,
          reason: `${resource.resourceType} may incur costs not explicitly discussed in the tutorial`,
          impact: monthlyCost,
          severity,
        });
      }
    }

    return hiddenCosts;
  }

  /**
   * Generate warnings for the cost report.
   * Highlights most expensive services and free tier considerations.
   * Requirements: 31.3, 31.5
   */
  private generateWarnings(resources: AWSResource[], hiddenCosts: HiddenCost[]): CostWarning[] {
    const warnings: CostWarning[] = [];

    // Find the most expensive resources
    const sorted = [...resources].sort(
      (a, b) => b.pricing.monthlyCost - a.pricing.monthlyCost
    );
    const expensive = sorted.filter((r) => r.pricing.monthlyCost > 0);

    if (expensive.length > 0) {
      const top = expensive.slice(0, 3);
      warnings.push({
        message: `Most expensive services: ${top.map((r) => `${r.resourceType} ($${r.pricing.monthlyCost.toFixed(2)}/mo)`).join(", ")}`,
        affectedResources: top.map((r) => r.resourceId),
        severity: top[0].pricing.monthlyCost > 50 ? "critical" : "warning",
      });
    }

    // Warn about hidden costs
    if (hiddenCosts.length > 0) {
      warnings.push({
        message: `${hiddenCosts.length} hidden cost(s) detected that may not be mentioned in the tutorial`,
        affectedResources: hiddenCosts.map((hc) => hc.resource.resourceId),
        severity: hiddenCosts.some((hc) => hc.severity === "high") ? "critical" : "warning",
      });
    }

    // Warn about non-free-tier resources
    const nonFreeTier = resources.filter((r) => !r.freeTierEligible && r.pricing.hourlyRate > 0);
    if (nonFreeTier.length > 0) {
      warnings.push({
        message: `${nonFreeTier.length} resource(s) are not free tier eligible and will incur costs immediately`,
        affectedResources: nonFreeTier.map((r) => r.resourceId),
        severity: "info",
      });
    }

    return warnings;
  }
}

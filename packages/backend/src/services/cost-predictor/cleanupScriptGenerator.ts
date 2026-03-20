import type {
  AWSResource,
  TrackedResource,
  TrackingSession,
  CleanupScript,
  CostSavings,
} from "@aws-intel/shared";
import { CleanupMethod, ResourceStatus } from "@aws-intel/shared";

// --- Dependency graph: resource type → types that must be deleted BEFORE it ---
// If "EC2" depends on ["Security Group"], it means EC2 must be deleted before Security Group.

export const DEPENDENCY_GRAPH: Record<string, string[]> = {
  "EC2": [],
  "RDS": [],
  "ALB": [],
  "NLB": [],
  "ELB": [],
  "NAT Gateway": [],
  "EKS": [],
  "ECS": [],
  "Lambda": [],
  "Elastic IP": ["EC2", "NAT Gateway"],
  "S3": [],
  "DynamoDB": [],
  "CloudFront": ["S3", "ALB"],
  "API Gateway": ["Lambda"],
  "SNS": [],
  "SQS": [],
  "ElastiCache": [],
  "Redshift": [],
  "SageMaker": [],
  "Neptune": [],
  "DocumentDB": [],
  "OpenSearch": [],
  "Kinesis": [],
  "MSK": [],
  "EFS": ["EC2"],
  "EBS": ["EC2"],
  "CloudWatch": [],
  "Fargate": [],
  "Glue": [],
  "VPN Gateway": [],
  "Transit Gateway": ["VPN Gateway"],
};

// --- AWS CLI delete commands per resource type ---

const CLI_DELETE_COMMANDS: Record<string, (r: AWSResource) => string> = {
  "EC2": (r) => `aws ec2 terminate-instances --instance-ids ${r.resourceId}`,
  "RDS": (r) => `aws rds delete-db-instance --db-instance-identifier ${r.resourceId} --skip-final-snapshot`,
  "ALB": (r) => `aws elbv2 delete-load-balancer --load-balancer-arn ${r.resourceId}`,
  "NLB": (r) => `aws elbv2 delete-load-balancer --load-balancer-arn ${r.resourceId}`,
  "ELB": (r) => `aws elb delete-load-balancer --load-balancer-name ${r.resourceId}`,
  "NAT Gateway": (r) => `aws ec2 delete-nat-gateway --nat-gateway-id ${r.resourceId}`,
  "EKS": (r) => `aws eks delete-cluster --name ${r.resourceId}`,
  "ECS": (r) => `aws ecs delete-cluster --cluster ${r.resourceId}`,
  "Lambda": (r) => `aws lambda delete-function --function-name ${r.resourceId}`,
  "Elastic IP": (r) => `aws ec2 release-address --allocation-id ${r.resourceId}`,
  "S3": (r) => `aws s3 rb s3://${r.resourceId} --force`,
  "DynamoDB": (r) => `aws dynamodb delete-table --table-name ${r.resourceId}`,
  "CloudFront": (r) => `aws cloudfront delete-distribution --id ${r.resourceId}`,
  "API Gateway": (r) => `aws apigateway delete-rest-api --rest-api-id ${r.resourceId}`,
  "SNS": (r) => `aws sns delete-topic --topic-arn ${r.resourceId}`,
  "SQS": (r) => `aws sqs delete-queue --queue-url ${r.resourceId}`,
  "ElastiCache": (r) => `aws elasticache delete-cache-cluster --cache-cluster-id ${r.resourceId}`,
  "Redshift": (r) => `aws redshift delete-cluster --cluster-identifier ${r.resourceId} --skip-final-cluster-snapshot`,
  "SageMaker": (r) => `aws sagemaker delete-notebook-instance --notebook-instance-name ${r.resourceId}`,
  "Neptune": (r) => `aws neptune delete-db-cluster --db-cluster-identifier ${r.resourceId} --skip-final-snapshot`,
  "DocumentDB": (r) => `aws docdb delete-db-cluster --db-cluster-identifier ${r.resourceId} --skip-final-snapshot`,
  "OpenSearch": (r) => `aws opensearch delete-domain --domain-name ${r.resourceId}`,
  "Kinesis": (r) => `aws kinesis delete-stream --stream-name ${r.resourceId}`,
  "MSK": (r) => `aws kafka delete-cluster --cluster-arn ${r.resourceId}`,
  "EFS": (r) => `aws efs delete-file-system --file-system-id ${r.resourceId}`,
  "EBS": (r) => `aws ec2 delete-volume --volume-id ${r.resourceId}`,
  "CloudWatch": (r) => `aws cloudwatch delete-alarms --alarm-names ${r.resourceId}`,
  "Fargate": (r) => `aws ecs delete-service --cluster default --service ${r.resourceId} --force`,
  "Glue": (r) => `aws glue delete-job --job-name ${r.resourceId}`,
  "VPN Gateway": (r) => `aws ec2 delete-vpn-gateway --vpn-gateway-id ${r.resourceId}`,
  "Transit Gateway": (r) => `aws ec2 delete-transit-gateway --transit-gateway-id ${r.resourceId}`,
};

// --- CLI verification commands per resource type ---

const CLI_VERIFY_COMMANDS: Record<string, (r: AWSResource) => string> = {
  "EC2": (r) => `aws ec2 describe-instances --instance-ids ${r.resourceId} --query "Reservations[].Instances[].State.Name"`,
  "RDS": (r) => `aws rds describe-db-instances --db-instance-identifier ${r.resourceId}`,
  "ALB": (r) => `aws elbv2 describe-load-balancers --load-balancer-arns ${r.resourceId}`,
  "NLB": (r) => `aws elbv2 describe-load-balancers --load-balancer-arns ${r.resourceId}`,
  "NAT Gateway": (r) => `aws ec2 describe-nat-gateways --nat-gateway-ids ${r.resourceId}`,
  "EKS": (r) => `aws eks describe-cluster --name ${r.resourceId}`,
  "S3": (r) => `aws s3 ls s3://${r.resourceId}`,
  "Lambda": (r) => `aws lambda get-function --function-name ${r.resourceId}`,
};


// --- Terraform resource type mapping (our type → terraform type) ---

const TF_RESOURCE_TYPE_MAP: Record<string, string> = {
  "EC2": "aws_instance",
  "RDS": "aws_db_instance",
  "ALB": "aws_lb",
  "NLB": "aws_lb",
  "ELB": "aws_elb",
  "NAT Gateway": "aws_nat_gateway",
  "EKS": "aws_eks_cluster",
  "ECS": "aws_ecs_cluster",
  "Lambda": "aws_lambda_function",
  "Elastic IP": "aws_eip",
  "S3": "aws_s3_bucket",
  "DynamoDB": "aws_dynamodb_table",
  "CloudFront": "aws_cloudfront_distribution",
  "API Gateway": "aws_api_gateway_rest_api",
  "SNS": "aws_sns_topic",
  "SQS": "aws_sqs_queue",
  "ElastiCache": "aws_elasticache_cluster",
  "Redshift": "aws_redshift_cluster",
  "SageMaker": "aws_sagemaker_notebook_instance",
  "Neptune": "aws_neptune_cluster",
  "DocumentDB": "aws_docdb_cluster",
  "OpenSearch": "aws_opensearch_domain",
  "Kinesis": "aws_kinesis_stream",
  "MSK": "aws_msk_cluster",
  "EFS": "aws_efs_file_system",
  "EBS": "aws_ebs_volume",
  "CloudWatch": "aws_cloudwatch_metric_alarm",
  "Fargate": "aws_ecs_service",
  "Glue": "aws_glue_job",
  "VPN Gateway": "aws_vpn_gateway",
  "Transit Gateway": "aws_ec2_transit_gateway",
};

// --- Helper: get active (non-deleted) resources from a session ---

export function getActiveResources(session: TrackingSession): TrackedResource[] {
  return session.resources.filter((r) => r.status !== ResourceStatus.DELETED);
}

// --- Helper: calculate cost savings from deleting active resources ---

export function calculateCostSavings(
  activeResources: TrackedResource[],
  allResources: TrackedResource[]
): CostSavings {
  const dailySavings = activeResources.reduce(
    (sum, r) => sum + r.resource.pricing.dailyCost,
    0
  );
  const monthlySavings = activeResources.reduce(
    (sum, r) => sum + r.resource.pricing.monthlyCost,
    0
  );
  const totalAccumulatedCost = allResources.reduce(
    (sum, r) => sum + r.accumulatedCost,
    0
  );

  return {
    dailySavings: Math.round(dailySavings * 100) / 100,
    monthlySavings: Math.round(monthlySavings * 100) / 100,
    totalAccumulatedCost: Math.round(totalAccumulatedCost * 100) / 100,
  };
}

// --- Helper: estimate cleanup time in minutes based on resource count ---

export function estimateCleanupTime(resourceCount: number, method: CleanupMethod): number {
  if (resourceCount === 0) return 0;
  switch (method) {
    case CleanupMethod.CLOUDFORMATION:
      return Math.max(2, resourceCount * 1);
    case CleanupMethod.TERRAFORM:
      return Math.max(2, resourceCount * 1);
    case CleanupMethod.AWS_CLI:
      return Math.max(1, resourceCount * 2);
  }
}

// --- Core: topological sort of resources by dependency ---

export function orderByDependencies(resources: AWSResource[]): AWSResource[] {
  if (resources.length === 0) return [];

  const typeSet = new Set(resources.map((r) => r.resourceType));

  // Build adjacency: for each resource type present, find which other present types must come after it
  // A depends on B means A must be deleted BEFORE B → A comes first in the order
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const type of typeSet) {
    inDegree.set(type, 0);
    adjacency.set(type, []);
  }

  // For each type, its dependents (types listed in DEPENDENCY_GRAPH[type]) must be deleted first
  // i.e., if Elastic IP depends on [EC2, NAT Gateway], then EC2 and NAT Gateway come before Elastic IP
  for (const type of typeSet) {
    const deps = (DEPENDENCY_GRAPH[type] ?? []).filter((d) => typeSet.has(d));
    for (const dep of deps) {
      // dep → type (dep must come before type)
      adjacency.get(dep)!.push(type);
      inDegree.set(type, (inDegree.get(type) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [type, degree] of inDegree) {
    if (degree === 0) queue.push(type);
  }

  const sortedTypes: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sortedTypes.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // If there are types not in sortedTypes (cycle), append them at the end
  for (const type of typeSet) {
    if (!sortedTypes.includes(type)) {
      sortedTypes.push(type);
    }
  }

  // Order resources according to sorted type order
  const typeOrder = new Map(sortedTypes.map((t, i) => [t, i]));
  return [...resources].sort(
    (a, b) => (typeOrder.get(a.resourceType) ?? 999) - (typeOrder.get(b.resourceType) ?? 999)
  );
}

// --- Script generators ---

function generateCLIScript(
  session: TrackingSession,
  orderedResources: AWSResource[]
): string {
  const lines: string[] = [
    "#!/bin/bash",
    `# Cleanup script for workshop: ${session.workshopTitle}`,
    `# Generated: ${new Date().toISOString().split("T")[0]}`,
    `# Session: ${session.sessionId}`,
    "",
    "set -e",
    "",
  ];

  for (const resource of orderedResources) {
    const cmdFn = CLI_DELETE_COMMANDS[resource.resourceType];
    const cmd = cmdFn
      ? cmdFn(resource)
      : `# No delete command available for ${resource.resourceType} (${resource.resourceId})`;
    lines.push(`# Delete ${resource.resourceType}: ${resource.resourceId}`);
    lines.push(cmd);
    lines.push("");
  }

  lines.push("# Verification");
  lines.push('echo "Verifying all resources deleted..."');
  for (const resource of orderedResources) {
    const verifyFn = CLI_VERIFY_COMMANDS[resource.resourceType];
    if (verifyFn) {
      lines.push(verifyFn(resource));
    }
  }
  lines.push("");
  lines.push('echo "Cleanup complete."');

  return lines.join("\n");
}

function generateCloudFormationScript(
  session: TrackingSession,
  _orderedResources: AWSResource[]
): string {
  const stackName = session.workshopId.replace(/[^a-zA-Z0-9-]/g, "-");
  const lines: string[] = [
    "#!/bin/bash",
    `# CloudFormation cleanup for workshop: ${session.workshopTitle}`,
    `# Generated: ${new Date().toISOString().split("T")[0]}`,
    `# Session: ${session.sessionId}`,
    "",
    "set -e",
    "",
    `# Delete CloudFormation stack`,
    `aws cloudformation delete-stack --stack-name ${stackName}`,
    "",
    `# Wait for stack deletion to complete`,
    `echo "Waiting for stack deletion..."`,
    `aws cloudformation wait stack-delete-complete --stack-name ${stackName}`,
    "",
    `# Verify stack deleted`,
    `aws cloudformation describe-stacks --stack-name ${stackName} 2>&1 || echo "Stack deleted successfully."`,
    "",
    'echo "Cleanup complete."',
  ];

  return lines.join("\n");
}

function generateTerraformScript(
  session: TrackingSession,
  orderedResources: AWSResource[]
): string {
  const lines: string[] = [
    "#!/bin/bash",
    `# Terraform cleanup for workshop: ${session.workshopTitle}`,
    `# Generated: ${new Date().toISOString().split("T")[0]}`,
    `# Session: ${session.sessionId}`,
    "",
    "set -e",
    "",
    "# Destroy all Terraform-managed resources",
    "terraform destroy -auto-approve",
    "",
    "# Verify resources destroyed",
    "terraform plan -detailed-exitcode || true",
    "",
  ];

  // Also list individual resource removal commands as comments
  if (orderedResources.length > 0) {
    lines.push("# Individual resource removal (if needed):");
    for (const resource of orderedResources) {
      const tfType = TF_RESOURCE_TYPE_MAP[resource.resourceType] ?? resource.resourceType.toLowerCase();
      lines.push(`# terraform state rm ${tfType}.${resource.resourceId.replace(/[^a-zA-Z0-9_]/g, "_")}`);
    }
    lines.push("");
  }

  lines.push('echo "Cleanup complete."');

  return lines.join("\n");
}

// --- Generate verification commands ---

function generateVerificationCommands(
  orderedResources: AWSResource[],
  method: CleanupMethod
): string[] {
  if (method === CleanupMethod.CLOUDFORMATION) {
    const commands: string[] = [];
    // For CloudFormation, the main verification is checking the stack status
    commands.push("aws cloudformation list-stacks --stack-status-filter DELETE_COMPLETE");
    return commands;
  }

  if (method === CleanupMethod.TERRAFORM) {
    return [
      "terraform plan -detailed-exitcode",
      "terraform state list",
    ];
  }

  // AWS CLI: per-resource verification
  const commands: string[] = [];
  for (const resource of orderedResources) {
    const verifyFn = CLI_VERIFY_COMMANDS[resource.resourceType];
    if (verifyFn) {
      commands.push(verifyFn(resource));
    }
  }
  return commands;
}

// --- Generate warnings ---

function generateWarnings(orderedResources: AWSResource[]): string[] {
  const warnings: string[] = [];

  const hasS3 = orderedResources.some((r) => r.resourceType === "S3");
  if (hasS3) {
    warnings.push("S3 buckets must be emptied before deletion. The script uses --force flag.");
  }

  const hasRDS = orderedResources.some((r) => r.resourceType === "RDS");
  if (hasRDS) {
    warnings.push("RDS deletion skips final snapshot. Create a manual snapshot if data is needed.");
  }

  const hasEKS = orderedResources.some((r) => r.resourceType === "EKS");
  if (hasEKS) {
    warnings.push("EKS cluster deletion may take 10-15 minutes. Ensure all node groups are deleted first.");
  }

  const hasNAT = orderedResources.some((r) => r.resourceType === "NAT Gateway");
  if (hasNAT) {
    warnings.push("NAT Gateway deletion may take a few minutes. Associated Elastic IPs will not be released automatically.");
  }

  return warnings;
}

// --- CleanupScriptGenerator class ---

export class CleanupScriptGenerator {
  /**
   * Generate a cleanup script for a tracking session.
   * Requirements: 36.1, 36.2, 36.3, 36.4, 36.5
   */
  generateScript(session: TrackingSession, method: CleanupMethod): CleanupScript {
    const activeTracked = getActiveResources(session);
    const activeResources = activeTracked.map((tr) => tr.resource);
    const ordered = orderByDependencies(activeResources);

    let script: string;
    switch (method) {
      case CleanupMethod.AWS_CLI:
        script = generateCLIScript(session, ordered);
        break;
      case CleanupMethod.CLOUDFORMATION:
        script = generateCloudFormationScript(session, ordered);
        break;
      case CleanupMethod.TERRAFORM:
        script = generateTerraformScript(session, ordered);
        break;
    }

    const verificationCommands = generateVerificationCommands(ordered, method);
    const costSavings = calculateCostSavings(activeTracked, session.resources);
    const estimatedTime = estimateCleanupTime(ordered.length, method);
    const warnings = generateWarnings(ordered);

    return {
      method,
      script,
      verificationCommands,
      estimatedTime,
      costSavings,
      warnings,
    };
  }

  /**
   * Order resources by dependencies for safe deletion.
   * Requirements: 36.2
   */
  orderByDependencies(resources: AWSResource[]): AWSResource[] {
    return orderByDependencies(resources);
  }
}

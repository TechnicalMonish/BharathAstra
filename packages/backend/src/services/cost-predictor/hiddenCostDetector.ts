import type {
  Tutorial,
  CostAnalysis,
  AWSResource,
  HiddenCost,
} from "@aws-intel/shared";
import { PRICING_TABLE, lookupPricing } from "./costAnalyzer";

// --- Interfaces ---

export interface MentionedResources {
  explicitlyMentioned: string[];
  costsMentioned: boolean;
  freeTierClaimed: boolean;
}

// --- Resource keyword patterns for tutorial text parsing ---

const RESOURCE_MENTION_PATTERNS: Record<string, RegExp[]> = {
  "NAT Gateway": [/\bnat\s*gateway\b/i],
  "ALB": [/\bapplication\s*load\s*balancer\b/i, /\balb\b/i],
  "NLB": [/\bnetwork\s*load\s*balancer\b/i, /\bnlb\b/i],
  "ELB": [/\belastic\s*load\s*balancer\b/i, /\bclassic\s*load\s*balancer\b/i, /\belb\b/i],
  "Elastic IP": [/\belastic\s*ip\b/i, /\beip\b/i],
  "EC2": [/\bec2\s*instance\b/i, /\bec2\b/i],
  "RDS": [/\brds\s*instance\b/i, /\brds\b/i, /\brelational\s*database\s*service\b/i],
  "ECS": [/\becs\s*cluster\b/i, /\becs\b/i],
  "EKS": [/\beks\s*cluster\b/i, /\beks\b/i, /\bkubernetes\b/i],
  "Lambda": [/\blambda\s*function\b/i, /\blambda\b/i],
  "S3": [/\bs3\s*bucket\b/i, /\bs3\b/i],
  "DynamoDB": [/\bdynamodb\s*table\b/i, /\bdynamodb\b/i],
  "CloudFront": [/\bcloudfront\b/i],
  "API Gateway": [/\bapi\s*gateway\b/i],
  "SNS": [/\bsns\s*topic\b/i, /\bsns\b/i],
  "SQS": [/\bsqs\s*queue\b/i, /\bsqs\b/i],
  "ElastiCache": [/\belasticache\b/i, /\bredis\s*cluster\b/i, /\bmemcached\b/i],
  "Redshift": [/\bredshift\b/i],
  "SageMaker": [/\bsagemaker\b/i],
  "Neptune": [/\bneptune\b/i],
  "DocumentDB": [/\bdocumentdb\b/i],
  "OpenSearch": [/\bopensearch\b/i, /\belasticsearch\b/i],
  "Kinesis": [/\bkinesis\b/i],
  "MSK": [/\bmsk\b/i, /\bmanaged\s*kafka\b/i],
  "EFS": [/\befs\b/i, /\belastic\s*file\s*system\b/i],
  "EBS": [/\bebs\s*volume\b/i, /\bebs\b/i],
  "CloudWatch": [/\bcloudwatch\b/i],
  "Fargate": [/\bfargate\b/i],
  "Glue": [/\bglue\s*job\b/i, /\bglue\b/i],
  "VPN Gateway": [/\bvpn\s*gateway\b/i],
  "Transit Gateway": [/\btransit\s*gateway\b/i],
};

// Cost-related patterns in tutorial text
const COST_MENTION_PATTERNS: RegExp[] = [
  /\bcost\b/i,
  /\bpric(?:e|ing)\b/i,
  /\bcharg(?:e|es|ed)\b/i,
  /\bbill(?:ing|ed)?\b/i,
  /\$\d/,
  /\bper\s*hour\b/i,
  /\bmonthly\s*cost\b/i,
  /\bhourly\s*rate\b/i,
];

const FREE_TIER_PATTERNS: RegExp[] = [
  /\bfree\s*tier\b/i,
  /\bno\s*cost\b/i,
  /\bfree\s*of\s*charge\b/i,
  /\bat\s*no\s*charge\b/i,
  /\bcompletely\s*free\b/i,
  /\bwon'?t\s*cost\b/i,
  /\bwill\s*not\s*cost\b/i,
];

// Common hidden cost resource types that are frequently overlooked
const COMMON_HIDDEN_COST_TYPES = [
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

// --- HiddenCostDetector class ---

export class HiddenCostDetector {
  /**
   * Detect hidden costs in a tutorial by comparing what the tutorial mentions
   * with what resources are actually deployed.
   * Requirements: 33.1, 33.2, 33.4, 33.5
   */
  detectHiddenCosts(tutorial: Tutorial, analysis: CostAnalysis): HiddenCost[] {
    const mentioned = this.checkTutorialDocumentation(tutorial);
    const hiddenCosts = this.compareWithActualResources(mentioned, analysis.resources);
    return this.sortBySeverity(hiddenCosts);
  }

  /**
   * Parse tutorial text for explicit resource mentions and cost mentions.
   * Requirements: 33.1, 33.3
   */
  checkTutorialDocumentation(tutorial: Tutorial): MentionedResources {
    const content = tutorial.content;
    const explicitlyMentioned: string[] = [];

    // Check which resource types are explicitly mentioned in the tutorial text
    for (const [resourceType, patterns] of Object.entries(RESOURCE_MENTION_PATTERNS)) {
      const isMentioned = patterns.some((pattern) => pattern.test(content));
      if (isMentioned) {
        explicitlyMentioned.push(resourceType);
      }
    }

    // Check if the tutorial mentions costs at all
    const costsMentioned = COST_MENTION_PATTERNS.some((pattern) => pattern.test(content));

    // Check if the tutorial claims free tier eligibility
    const freeTierClaimed = FREE_TIER_PATTERNS.some((pattern) => pattern.test(content));

    return {
      explicitlyMentioned,
      costsMentioned,
      freeTierClaimed,
    };
  }

  /**
   * Compare mentioned resources with actual deployed resources to find hidden costs.
   * Flags resources deployed but not mentioned, and resources claimed as free but costing money.
   * Requirements: 33.1, 33.2, 33.3, 33.4, 33.5
   */
  compareWithActualResources(
    mentioned: MentionedResources,
    actualResources: AWSResource[]
  ): HiddenCost[] {
    const hiddenCosts: HiddenCost[] = [];

    for (const resource of actualResources) {
      const isExplicitlyMentioned = mentioned.explicitlyMentioned.includes(resource.resourceType);
      const monthlyCost = resource.pricing.monthlyCost;

      // Skip resources with zero cost
      if (monthlyCost <= 0) continue;

      // Flag 1: Resource deployed but not mentioned in tutorial
      if (!isExplicitlyMentioned) {
        hiddenCosts.push({
          resource,
          reason: `${resource.resourceType} will be deployed but is not mentioned in the tutorial documentation`,
          impact: monthlyCost,
          severity: this.classifySeverity(monthlyCost),
        });
        continue;
      }

      // Flag 2: Resource claimed as "free" but actually costs money
      if (mentioned.freeTierClaimed && !resource.freeTierEligible) {
        hiddenCosts.push({
          resource,
          reason: `Tutorial claims free tier eligibility, but ${resource.resourceType} is not free tier eligible (estimated $${monthlyCost.toFixed(2)}/month)`,
          impact: monthlyCost,
          severity: this.classifySeverity(monthlyCost),
        });
        continue;
      }

      // Flag 3: Common hidden cost resource that is mentioned but costs are not discussed
      if (
        COMMON_HIDDEN_COST_TYPES.includes(resource.resourceType) &&
        !mentioned.costsMentioned
      ) {
        hiddenCosts.push({
          resource,
          reason: `${resource.resourceType} is a commonly overlooked cost source and the tutorial does not discuss costs`,
          impact: monthlyCost,
          severity: this.classifySeverity(monthlyCost),
        });
      }
    }

    return hiddenCosts;
  }

  /**
   * Classify severity based on monthly cost impact.
   * high: > $50/month, medium: > $10/month, low: <= $10/month
   */
  private classifySeverity(monthlyCost: number): "high" | "medium" | "low" {
    if (monthlyCost > 50) return "high";
    if (monthlyCost > 10) return "medium";
    return "low";
  }

  /**
   * Sort hidden costs by severity (high first) then by impact (descending).
   */
  private sortBySeverity(hiddenCosts: HiddenCost[]): HiddenCost[] {
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...hiddenCosts].sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.impact - a.impact;
    });
  }
}

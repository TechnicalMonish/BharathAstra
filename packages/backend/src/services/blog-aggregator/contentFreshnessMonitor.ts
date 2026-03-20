import { type ContentItem } from "@aws-intel/shared";

// --- Types ---

export interface FreshnessWarning {
  service: string;
  message: string;
  alternative?: string;
}

export interface FreshnessReport {
  itemId: string;
  warnings: FreshnessWarning[];
  hasDeprecatedReferences: boolean;
}

// --- Deprecated services map ---

const DEPRECATED_SERVICES: Record<string, { message: string; alternative: string }> = {
  "simpledb": {
    message: "Amazon SimpleDB is a legacy service",
    alternative: "DynamoDB",
  },
  "elastic transcoder": {
    message: "Amazon Elastic Transcoder is being replaced",
    alternative: "AWS Elemental MediaConvert",
  },
  "opsworks": {
    message: "AWS OpsWorks Stacks is in maintenance mode",
    alternative: "AWS Systems Manager",
  },
  "cloud9": {
    message: "AWS Cloud9 is no longer available to new customers",
    alternative: "VS Code with AWS Toolkit or Amazon CodeCatalyst",
  },
  "codecommit": {
    message: "AWS CodeCommit is no longer available to new customers",
    alternative: "GitHub, GitLab, or Amazon CodeCatalyst",
  },
  "cloudtrail data events v1": {
    message: "CloudTrail data events v1 format is deprecated",
    alternative: "CloudTrail data events v2",
  },
  "aws sdk v2": {
    message: "AWS SDK for JavaScript v2 is in maintenance mode",
    alternative: "AWS SDK for JavaScript v3",
  },
  "sdk v2": {
    message: "AWS SDK v2 is in maintenance mode",
    alternative: "AWS SDK v3",
  },
  "amazon mq": {
    message: "Consider newer messaging alternatives",
    alternative: "Amazon SQS, SNS, or EventBridge",
  },
  "elastic beanstalk": {
    message: "AWS Elastic Beanstalk is still supported but consider modern alternatives",
    alternative: "AWS App Runner or ECS with Fargate",
  },
  "cloudformation": {
    message: "CloudFormation is still supported but CDK is the recommended approach",
    alternative: "AWS CDK",
  },
};

// --- Helpers ---

function findDeprecatedReferences(content: string): FreshnessWarning[] {
  const warnings: FreshnessWarning[] = [];
  const lower = content.toLowerCase();

  for (const [service, info] of Object.entries(DEPRECATED_SERVICES)) {
    if (lower.includes(service)) {
      warnings.push({
        service,
        message: info.message,
        alternative: info.alternative,
      });
    }
  }

  return warnings;
}

// --- ContentFreshnessMonitor class ---

export class ContentFreshnessMonitor {
  /**
   * Check a content item for references to deprecated or outdated services.
   */
  checkFreshness(item: ContentItem): FreshnessReport {
    const textToCheck = `${item.title} ${item.content}`;
    const warnings = findDeprecatedReferences(textToCheck);

    return {
      itemId: item.id,
      warnings,
      hasDeprecatedReferences: warnings.length > 0,
    };
  }

  /**
   * Check multiple items and return reports only for those with warnings.
   */
  checkMultiple(items: ContentItem[]): FreshnessReport[] {
    return items
      .map((item) => this.checkFreshness(item))
      .filter((report) => report.hasDeprecatedReferences);
  }

  /**
   * Get the list of known deprecated services.
   */
  getDeprecatedServices(): string[] {
    return Object.keys(DEPRECATED_SERVICES);
  }

  /**
   * Get the suggested alternative for a deprecated service.
   */
  getAlternative(service: string): string | undefined {
    const lower = service.toLowerCase();
    return DEPRECATED_SERVICES[lower]?.alternative;
  }
}

export { DEPRECATED_SERVICES, findDeprecatedReferences };

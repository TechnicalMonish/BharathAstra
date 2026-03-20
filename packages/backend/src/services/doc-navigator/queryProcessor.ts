import { QueryType, type ProcessedQuery } from "@aws-intel/shared";

// --- Filler words to remove during normalization ---

const FILLER_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "out", "off",
  "over", "under", "again", "further", "then", "once", "here", "there",
  "all", "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "that", "this",
  "it", "its", "i", "me", "my", "we", "our", "you", "your", "he", "him",
  "his", "she", "her", "they", "them", "their", "what", "which", "who",
  "how", "when", "where", "why",
  "please", "help", "want", "like", "know", "tell", "show", "explain",
]);

// --- AWS service name recognition ---

const AWS_SERVICE_NAMES: Record<string, string> = {
  "lambda": "Lambda",
  "s3": "S3",
  "iam": "IAM",
  "ec2": "EC2",
  "dynamodb": "DynamoDB",
  "dynamo": "DynamoDB",
  "rds": "RDS",
  "ecs": "ECS",
  "eks": "EKS",
  "fargate": "Fargate",
  "cloudfront": "CloudFront",
  "cloudwatch": "CloudWatch",
  "cloudformation": "CloudFormation",
  "cloudtrail": "CloudTrail",
  "sqs": "SQS",
  "sns": "SNS",
  "api gateway": "API Gateway",
  "apigateway": "API Gateway",
  "vpc": "VPC",
  "route 53": "Route 53",
  "route53": "Route 53",
  "elb": "ELB",
  "alb": "ALB",
  "kms": "KMS",
  "secrets manager": "Secrets Manager",
  "waf": "WAF",
  "cognito": "Cognito",
  "sagemaker": "SageMaker",
  "bedrock": "Bedrock",
  "athena": "Athena",
  "glue": "Glue",
  "kinesis": "Kinesis",
  "eventbridge": "EventBridge",
  "step functions": "Step Functions",
  "stepfunctions": "Step Functions",
  "aurora": "Aurora",
  "elasticache": "ElastiCache",
  "redshift": "Redshift",
  "neptune": "Neptune",
  "documentdb": "DocumentDB",
  "lightsail": "Lightsail",
  "batch": "Batch",
  "ebs": "EBS",
  "efs": "EFS",
  "codepipeline": "CodePipeline",
  "codebuild": "CodeBuild",
  "codedeploy": "CodeDeploy",
  "codecommit": "CodeCommit",
  "x-ray": "X-Ray",
  "xray": "X-Ray",
  "systems manager": "Systems Manager",
  "ssm": "Systems Manager",
  "guardduty": "GuardDuty",
  "shield": "Shield",
  "config": "Config",
  "emr": "EMR",
  "quicksight": "QuickSight",
  "lake formation": "Lake Formation",
  "comprehend": "Comprehend",
  "rekognition": "Rekognition",
  "textract": "Textract",
  "direct connect": "Direct Connect",
  "storage gateway": "Storage Gateway",
  "backup": "Backup",
  "mq": "MQ",
  "amplify": "Amplify",
  "appsync": "AppSync",
  "elastic beanstalk": "Elastic Beanstalk",
  "beanstalk": "Elastic Beanstalk",
};

// --- Synonym dictionary: informal → formal AWS terms ---

const AWS_SYNONYM_MAP: Record<string, string[]> = {
  "serverless": ["Lambda", "Fargate", "API Gateway"],
  "server": ["EC2"],
  "bucket": ["S3"],
  "storage": ["S3", "EBS", "EFS"],
  "database": ["DynamoDB", "RDS", "Aurora"],
  "db": ["DynamoDB", "RDS"],
  "queue": ["SQS"],
  "notification": ["SNS"],
  "message": ["SQS", "SNS"],
  "messaging": ["SQS", "SNS", "EventBridge"],
  "container": ["ECS", "EKS", "Fargate"],
  "docker": ["ECS", "EKS"],
  "kubernetes": ["EKS"],
  "k8s": ["EKS"],
  "cdn": ["CloudFront"],
  "cache": ["ElastiCache", "CloudFront"],
  "caching": ["ElastiCache", "CloudFront"],
  "dns": ["Route 53"],
  "domain": ["Route 53"],
  "load balancer": ["ELB", "ALB"],
  "load balancing": ["ELB", "ALB"],
  "permission": ["IAM"],
  "permissions": ["IAM"],
  "access control": ["IAM"],
  "role": ["IAM"],
  "policy": ["IAM"],
  "encryption": ["KMS"],
  "secret": ["Secrets Manager"],
  "secrets": ["Secrets Manager"],
  "monitoring": ["CloudWatch"],
  "logging": ["CloudWatch", "CloudTrail"],
  "logs": ["CloudWatch"],
  "metrics": ["CloudWatch"],
  "alarm": ["CloudWatch"],
  "alarms": ["CloudWatch"],
  "infrastructure as code": ["CloudFormation"],
  "iac": ["CloudFormation"],
  "template": ["CloudFormation"],
  "event": ["EventBridge"],
  "events": ["EventBridge"],
  "stream": ["Kinesis"],
  "streaming": ["Kinesis"],
  "search": ["CloudSearch", "OpenSearch"],
  "ml": ["SageMaker", "Bedrock"],
  "machine learning": ["SageMaker", "Bedrock"],
  "ai": ["Bedrock", "SageMaker"],
  "function": ["Lambda"],
  "functions": ["Lambda"],
  "virtual machine": ["EC2"],
  "vm": ["EC2"],
  "instance": ["EC2"],
  "instances": ["EC2"],
  "object storage": ["S3"],
  "file storage": ["EFS"],
  "block storage": ["EBS"],
  "nosql": ["DynamoDB"],
  "relational database": ["RDS", "Aurora"],
  "sql": ["RDS", "Aurora"],
  "firewall": ["WAF", "Security Groups"],
  "auth": ["Cognito", "IAM"],
  "authentication": ["Cognito"],
  "authorization": ["IAM"],
  "ci/cd": ["CodePipeline", "CodeBuild", "CodeDeploy"],
  "pipeline": ["CodePipeline"],
  "deploy": ["CodeDeploy"],
  "deployment": ["CodeDeploy", "CloudFormation"],
  "build": ["CodeBuild"],
  "workflow": ["Step Functions"],
  "state machine": ["Step Functions"],
  "etl": ["Glue"],
  "data lake": ["Lake Formation"],
  "analytics": ["Athena", "QuickSight"],
  "data warehouse": ["Redshift"],
  "graph database": ["Neptune"],
  "api": ["API Gateway"],
  "rest api": ["API Gateway"],
  "websocket": ["API Gateway"],
  "cost": ["Cost Explorer", "Budgets"],
  "billing": ["Cost Explorer", "Budgets"],
  "scaling": ["Auto Scaling"],
  "autoscaling": ["Auto Scaling"],
  "auto scaling": ["Auto Scaling"],
};

// --- Query type classification patterns ---

const QUERY_TYPE_PATTERNS: { type: QueryType; patterns: RegExp[] }[] = [
  {
    type: QueryType.HOW_TO,
    patterns: [
      /^how\b/i,
      /\bhow (do|can|to|should)\b/i,
      /\bset up\b/i,
      /\bconfigure\b/i,
      /\bcreate\b/i,
      /\bimplement\b/i,
      /\benable\b/i,
      /\bsteps?\b/i,
    ],
  },
  {
    type: QueryType.WHAT_IS,
    patterns: [
      /^what (is|are)\b/i,
      /\bdefine\b/i,
      /\bdefinition\b/i,
      /\bexplain\b/i,
      /\bdescribe\b/i,
      /\bmeaning\b/i,
    ],
  },
  {
    type: QueryType.TROUBLESHOOT,
    patterns: [
      /\bwhy (isn't|isnt|doesn't|doesnt|can't|cant|won't|wont|not)\b/i,
      /\berror\b/i,
      /\bfail(ed|ing|s)?\b/i,
      /\bfix\b/i,
      /\btroubleshoot\b/i,
      /\bdebug\b/i,
      /\bissue\b/i,
      /\bproblem\b/i,
      /\bnot working\b/i,
      /\bbroke(n)?\b/i,
    ],
  },
  {
    type: QueryType.BEST_PRACTICE,
    patterns: [
      /\bbest (practices?|way|approach)\b/i,
      /\brecommend(ed|ation)?\b/i,
      /\boptimal\b/i,
      /\boptimize\b/i,
      /\bshould i\b/i,
      /\badvice\b/i,
      /\bpattern\b/i,
    ],
  },
  {
    type: QueryType.COMPARISON,
    patterns: [
      /\bdifference(s)? between\b/i,
      /\bcompare\b/i,
      /\bcomparison\b/i,
      /\bvs\.?\b/i,
      /\bversus\b/i,
      /\bor\b.*\bwhich\b/i,
      /\bwhich\b.*\bor\b/i,
      /\bbetter\b/i,
    ],
  },
];

// --- Common AWS query suggestions for auto-complete ---

const COMMON_QUERY_SUGGESTIONS = [
  "How do I create a Lambda function",
  "How do I set up an S3 bucket",
  "How do I configure IAM roles",
  "How do I deploy with CloudFormation",
  "How do I set up a VPC",
  "How do I connect Lambda to DynamoDB",
  "How do I enable CloudWatch logging",
  "How do I configure API Gateway",
  "How do I set up ECS with Fargate",
  "How do I use SQS with Lambda",
  "What is the difference between ECS and EKS",
  "What is AWS Lambda",
  "What is DynamoDB",
  "What is IAM",
  "Best practices for S3 security",
  "Best practices for Lambda performance",
  "Best practices for DynamoDB design",
  "Troubleshoot Lambda timeout errors",
  "Troubleshoot S3 access denied",
  "Troubleshoot IAM permission issues",
  "Compare RDS vs DynamoDB",
  "Compare ECS vs EKS",
  "Compare S3 storage classes",
];

// --- Concept extraction patterns ---

const CONCEPT_KEYWORDS: Record<string, string> = {
  "permission": "permissions",
  "permissions": "permissions",
  "access": "access control",
  "access control": "access control",
  "encryption": "encryption",
  "encrypt": "encryption",
  "security": "security",
  "secure": "security",
  "scaling": "scaling",
  "scale": "scaling",
  "autoscaling": "auto scaling",
  "performance": "performance",
  "latency": "latency",
  "throughput": "throughput",
  "availability": "high availability",
  "high availability": "high availability",
  "ha": "high availability",
  "backup": "backup",
  "disaster recovery": "disaster recovery",
  "dr": "disaster recovery",
  "replication": "replication",
  "migration": "migration",
  "migrate": "migration",
  "networking": "networking",
  "network": "networking",
  "subnet": "networking",
  "routing": "networking",
  "cost": "cost optimization",
  "pricing": "cost optimization",
  "optimization": "optimization",
  "optimize": "optimization",
  "deployment": "deployment",
  "deploy": "deployment",
  "cicd": "CI/CD",
  "ci/cd": "CI/CD",
  "testing": "testing",
  "test": "testing",
  "monitoring": "monitoring",
  "monitor": "monitoring",
  "logging": "logging",
  "log": "logging",
  "trigger": "event triggers",
  "triggers": "event triggers",
  "timeout": "timeout",
  "throttle": "throttling",
  "throttling": "throttling",
  "concurrency": "concurrency",
  "memory": "memory",
  "storage": "storage",
  "configuration": "configuration",
  "configure": "configuration",
  "setup": "configuration",
  "integration": "integration",
  "integrate": "integration",
  "cross-account": "cross-account access",
  "cross account": "cross-account access",
  "vpc peering": "VPC peering",
  "peering": "VPC peering",
};

// --- QueryProcessor class ---

export class QueryProcessor {
  /**
   * Process a natural language question into a structured ProcessedQuery.
   */
  processQuery(question: string): ProcessedQuery {
    const normalizedQuestion = this.normalizeQuestion(question);
    const awsServices = this.extractAWSServices(question);
    const concepts = this.extractConcepts(normalizedQuestion);
    const queryType = this.classifyQueryType(question);
    const keywords = this.extractKeywords(normalizedQuestion, awsServices);

    return {
      originalQuestion: question,
      normalizedQuestion,
      awsServices,
      concepts,
      queryType,
      keywords,
    };
  }

  /**
   * Generate auto-complete suggestions based on a partial query string.
   */
  suggestCompletions(partial: string): string[] {
    if (!partial || partial.trim().length === 0) {
      return COMMON_QUERY_SUGGESTIONS.slice(0, 5);
    }

    const lower = partial.toLowerCase().trim();

    // Filter suggestions that match the partial input
    const matches = COMMON_QUERY_SUGGESTIONS.filter((s) =>
      s.toLowerCase().includes(lower)
    );

    // Also generate dynamic suggestions based on detected AWS services
    const services = this.extractAWSServices(partial);
    const dynamic: string[] = [];
    for (const service of services) {
      dynamic.push(
        `How do I set up ${service}`,
        `What is ${service}`,
        `Best practices for ${service}`,
      );
    }

    // Combine, deduplicate, and limit
    const combined = [...new Set([...matches, ...dynamic])];
    return combined.slice(0, 10);
  }

  /**
   * Map informal language to formal AWS terminology.
   */
  mapToAWSTerms(informal: string): string[] {
    const lower = informal.toLowerCase().trim();
    const terms = new Set<string>();

    // Check multi-word synonyms first (longer matches take priority)
    const sortedKeys = Object.keys(AWS_SYNONYM_MAP).sort(
      (a, b) => b.length - a.length
    );

    for (const key of sortedKeys) {
      if (lower.includes(key)) {
        for (const term of AWS_SYNONYM_MAP[key]) {
          terms.add(term);
        }
      }
    }

    // Also check direct service name matches
    const serviceMatches = this.extractAWSServices(informal);
    for (const service of serviceMatches) {
      terms.add(service);
    }

    return Array.from(terms);
  }

  // --- Private helpers ---

  /**
   * Normalize a question: lowercase, remove filler words, collapse whitespace.
   */
  private normalizeQuestion(question: string): string {
    const lower = question.toLowerCase().trim();
    // Remove punctuation except hyphens and slashes (for terms like CI/CD, x-ray)
    const cleaned = lower.replace(/[^a-z0-9\s\-\/]/g, " ");
    const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
    const filtered = words.filter((w) => !FILLER_WORDS.has(w));
    return filtered.join(" ");
  }

  /**
   * Extract AWS service names from a query string.
   */
  private extractAWSServices(query: string): string[] {
    const lower = query.toLowerCase();
    const found = new Set<string>();

    // Check multi-word service names first (longer matches take priority)
    const sortedKeys = Object.keys(AWS_SERVICE_NAMES).sort(
      (a, b) => b.length - a.length
    );

    for (const key of sortedKeys) {
      // Use word boundary matching for short keys to avoid false positives
      if (key.length <= 3) {
        const regex = new RegExp(`\\b${key}\\b`, "i");
        if (regex.test(lower)) {
          found.add(AWS_SERVICE_NAMES[key]);
        }
      } else {
        if (lower.includes(key)) {
          found.add(AWS_SERVICE_NAMES[key]);
        }
      }
    }

    // Also check synonym map for indirect service references
    for (const [key, services] of Object.entries(AWS_SYNONYM_MAP)) {
      if (key.length <= 3) {
        const regex = new RegExp(`\\b${key}\\b`, "i");
        if (regex.test(lower)) {
          for (const service of services) {
            found.add(service);
          }
        }
      } else if (lower.includes(key)) {
        for (const service of services) {
          found.add(service);
        }
      }
    }

    return Array.from(found);
  }

  /**
   * Extract key concepts from a normalized query.
   */
  private extractConcepts(normalizedQuery: string): string[] {
    const concepts = new Set<string>();

    // Check multi-word concepts first
    const sortedKeys = Object.keys(CONCEPT_KEYWORDS).sort(
      (a, b) => b.length - a.length
    );

    for (const key of sortedKeys) {
      if (normalizedQuery.includes(key)) {
        concepts.add(CONCEPT_KEYWORDS[key]);
      }
    }

    return Array.from(concepts);
  }

  /**
   * Classify the query type based on pattern matching.
   */
  private classifyQueryType(question: string): QueryType {
    for (const { type, patterns } of QUERY_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(question)) {
          return type;
        }
      }
    }
    // Default to HOW_TO for unclassified queries
    return QueryType.HOW_TO;
  }

  /**
   * Extract search keywords from the normalized query.
   */
  private extractKeywords(
    normalizedQuery: string,
    awsServices: string[]
  ): string[] {
    const words = normalizedQuery.split(/\s+/).filter((w) => w.length > 1);
    const keywords = new Set<string>(words);

    // Add lowercase service names as keywords
    for (const service of awsServices) {
      keywords.add(service.toLowerCase());
    }

    return Array.from(keywords);
  }
}

// Export constants for testing
export {
  FILLER_WORDS,
  AWS_SERVICE_NAMES,
  AWS_SYNONYM_MAP,
  QUERY_TYPE_PATTERNS,
  COMMON_QUERY_SUGGESTIONS,
  CONCEPT_KEYWORDS,
};

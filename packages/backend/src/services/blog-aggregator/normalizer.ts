import {
  ContentSource,
  DifficultyLevel,
  AuthorityLevel,
  type ContentItem,
  type ContentMetadata,
  type AuthorInfo,
  type SourceResult,
} from "@aws-intel/shared";

// --- Constants ---

const MAX_CONTENT_WORDS = 500;

const AWS_SERVICES = [
  "Lambda", "S3", "EC2", "DynamoDB", "RDS", "Aurora", "ECS", "EKS",
  "Fargate", "API Gateway", "CloudFront", "Route53", "IAM", "KMS",
  "SQS", "SNS", "Step Functions", "CloudFormation", "CDK", "CloudWatch",
  "Kinesis", "Redshift", "ElastiCache", "Elastic Beanstalk", "SageMaker",
  "Bedrock", "Cognito", "AppSync", "EventBridge", "Secrets Manager",
  "VPC", "ALB", "NLB", "EFS", "EBS", "Glue", "Athena", "QuickSight",
  "CodePipeline", "CodeBuild", "CodeDeploy", "Amplify", "Lightsail",
  "Terraform", "SAM",
];

const TECH_STACK_KEYWORDS: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  "c#": "C#",
  csharp: "C#",
  go: "Go",
  golang: "Go",
  rust: "Rust",
  ruby: "Ruby",
  php: "PHP",
  ".net": ".NET",
  dotnet: ".NET",
  react: "React",
  angular: "Angular",
  vue: "Vue",
  "node.js": "Node.js",
  nodejs: "Node.js",
  docker: "Docker",
  kubernetes: "Kubernetes",
};

const AUTHORITY_CREDENTIALS: Record<string, AuthorityLevel> = {
  "aws hero": AuthorityLevel.AWS_HERO,
  "aws employee": AuthorityLevel.AWS_EMPLOYEE,
  "solutions architect": AuthorityLevel.AWS_EMPLOYEE,
  "aws evangelist": AuthorityLevel.AWS_EMPLOYEE,
  "aws ambassador": AuthorityLevel.AWS_HERO,
};

// --- Helpers ---

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function normalizeDate(date: unknown): Date {
  if (date instanceof Date && !isNaN(date.getTime())) return date;
  if (typeof date === "string" || typeof date === "number") {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function estimateReadTime(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const wordsPerMinute = 200;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

function detectCodeExamples(content: string): boolean {
  return /```[\s\S]*?```/.test(content) ||
    /\bfunction\s+\w+\s*\(/.test(content) ||
    /\bconst\s+\w+\s*=/.test(content) ||
    /\bimport\s+/.test(content) ||
    /\baws\s+\w+/.test(content) ||
    /\bdef\s+\w+\s*\(/.test(content);
}

function detectDiagrams(content: string): boolean {
  return /!\[.*?\]\(.*?\)/.test(content) ||
    /diagram/i.test(content) ||
    /architecture/i.test(content) ||
    /<img\s/.test(content) ||
    /\.png|\.svg|\.jpg/i.test(content);
}

function detectStepByStep(content: string): boolean {
  return /step\s*\d/i.test(content) ||
    /^\s*\d+\.\s/m.test(content) ||
    /first[\s,].*then[\s,]/i.test(content) ||
    /step-by-step/i.test(content);
}

function detectAwsServices(content: string): string[] {
  const found = new Set<string>();
  const lower = content.toLowerCase();
  for (const service of AWS_SERVICES) {
    if (lower.includes(service.toLowerCase())) {
      found.add(service);
    }
  }
  return Array.from(found);
}

function detectTechStack(content: string): string[] {
  const found = new Set<string>();
  const lower = content.toLowerCase();
  for (const [keyword, name] of Object.entries(TECH_STACK_KEYWORDS)) {
    if (lower.includes(keyword)) {
      found.add(name);
    }
  }
  return Array.from(found);
}

function detectDifficulty(content: string): DifficultyLevel {
  const lower = content.toLowerCase();
  const advancedSignals = [
    "advanced", "expert", "deep dive", "production", "at scale",
    "optimization", "architecture", "distributed", "microservices",
  ];
  const beginnerSignals = [
    "beginner", "getting started", "introduction", "101",
    "tutorial", "first", "basic", "simple", "easy",
  ];

  let advancedCount = 0;
  let beginnerCount = 0;
  for (const signal of advancedSignals) {
    if (lower.includes(signal)) advancedCount++;
  }
  for (const signal of beginnerSignals) {
    if (lower.includes(signal)) beginnerCount++;
  }

  if (advancedCount > beginnerCount) return DifficultyLevel.ADVANCED;
  if (beginnerCount > advancedCount) return DifficultyLevel.BEGINNER;
  return DifficultyLevel.INTERMEDIATE;
}

function extractCredentials(authorName: string, bio?: string): {
  credentials: string[];
  authorityLevel: AuthorityLevel;
} {
  const credentials: string[] = [];
  let authorityLevel = AuthorityLevel.UNKNOWN;

  const searchText = `${authorName} ${bio || ""}`.toLowerCase();

  for (const [keyword, level] of Object.entries(AUTHORITY_CREDENTIALS)) {
    if (searchText.includes(keyword)) {
      credentials.push(keyword.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
      if (authorityLevel === AuthorityLevel.UNKNOWN ||
          level === AuthorityLevel.AWS_HERO ||
          (level === AuthorityLevel.AWS_EMPLOYEE && authorityLevel !== AuthorityLevel.AWS_HERO)) {
        authorityLevel = level;
      }
    }
  }

  if (authorityLevel === AuthorityLevel.UNKNOWN) {
    authorityLevel = AuthorityLevel.COMMUNITY_MEMBER;
  }

  return { credentials, authorityLevel };
}

// --- Normalizer class ---

export class Normalizer {
  /**
   * Normalize a SourceResult's items into unified ContentItem structures.
   * Items that already conform are passed through with metadata enrichment.
   * Invalid items (missing URL, etc.) are filtered out.
   */
  normalize(sourceResult: SourceResult): ContentItem[] {
    return sourceResult.items
      .map((item) => this.normalizeItem(item, sourceResult.source))
      .filter((item): item is ContentItem => item !== null);
  }

  /**
   * Extract structured metadata from raw content text and source.
   */
  extractMetadata(rawContent: string, source: ContentSource): ContentMetadata {
    const content = typeof rawContent === "string" ? rawContent : String(rawContent ?? "");

    return {
      hasCodeExamples: detectCodeExamples(content),
      hasDiagrams: detectDiagrams(content),
      hasStepByStep: detectStepByStep(content),
      estimatedReadTime: estimateReadTime(content),
      difficultyLevel: detectDifficulty(content),
      techStack: detectTechStack(content),
      awsServices: detectAwsServices(content),
    };
  }

  private normalizeItem(item: ContentItem, source: ContentSource): ContentItem | null {
    // Validate URL
    if (!item.url || !isValidUrl(item.url)) {
      return null;
    }

    // Normalize date
    const publishDate = normalizeDate(item.publishDate);

    // Truncate content
    const truncatedContent = truncateToWords(item.content || "", MAX_CONTENT_WORDS);

    // Extract/enrich metadata
    const extractedMetadata = this.extractMetadata(item.content || "", source);
    const metadata: ContentMetadata = {
      ...extractedMetadata,
      // Preserve existing metadata values if they were already set
      ...item.metadata,
      // Always re-extract these from content for consistency
      awsServices: item.metadata?.awsServices?.length
        ? item.metadata.awsServices
        : extractedMetadata.awsServices,
      techStack: item.metadata?.techStack?.length
        ? item.metadata.techStack
        : extractedMetadata.techStack,
    };

    // Extract/enrich author info
    const author = this.normalizeAuthor(item.author);

    return {
      ...item,
      source: item.source || source,
      publishDate,
      content: truncatedContent,
      metadata,
      author,
      retrievedAt: item.retrievedAt ?? new Date(),
    };
  }

  private normalizeAuthor(author: AuthorInfo): AuthorInfo {
    if (!author) {
      return {
        name: "Unknown",
        credentials: [],
        authorityLevel: AuthorityLevel.UNKNOWN,
      };
    }

    // If author already has credentials and authority, keep them
    if (author.credentials?.length > 0 && author.authorityLevel !== AuthorityLevel.UNKNOWN) {
      return author;
    }

    // Try to extract credentials from name/bio
    const extracted = extractCredentials(author.name);

    return {
      name: author.name || "Unknown",
      credentials: author.credentials?.length > 0 ? author.credentials : extracted.credentials,
      authorityLevel: author.authorityLevel !== AuthorityLevel.UNKNOWN
        ? author.authorityLevel
        : extracted.authorityLevel,
    };
  }
}

// Export helpers for testing
export {
  truncateToWords,
  isValidUrl,
  normalizeDate,
  estimateReadTime,
  detectCodeExamples,
  detectDiagrams,
  detectStepByStep,
  detectAwsServices,
  detectTechStack,
  detectDifficulty,
  extractCredentials,
  MAX_CONTENT_WORDS,
};

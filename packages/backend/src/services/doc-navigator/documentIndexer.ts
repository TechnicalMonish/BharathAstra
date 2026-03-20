import * as cheerio from "cheerio";
import { marked } from "marked";

import {
  DocumentFormat,
  DocumentType,
  type UploadedFile,
  type IndexResult,
  type SyncResult,
  type SearchMatch,
} from "@aws-intel/shared";

import * as dynamodb from "../../lib/dynamodb";
import * as s3 from "../../lib/s3";
import { TABLES } from "../../config/tables";
import { BUCKETS } from "../../config/buckets";

// --- Types ---

interface ParsedSection {
  sectionId: string;
  sectionTitle: string;
  content: string;
  level: number;
  parentSections: { sectionNumber: string; title: string }[];
  sectionNumber: string;
}

interface DocumentRecord {
  docId: string;
  sectionId: string;
  docTitle: string;
  sectionTitle: string;
  sectionNumber: string;
  content: string;
  level: number;
  parentSections: { sectionNumber: string; title: string }[];
  keywords: string[];
  embedding?: number[];
  type: DocumentType;
  category?: string;
  indexedAt: string;
}

// --- Predefined AWS official doc entries ---
// TODO: Implement real AWS documentation fetching/indexing
// These would be populated by syncing with actual AWS documentation

const OFFICIAL_AWS_DOCS: { name: string; category: string; url: string }[] = [
  // Compute
  { name: "Amazon EC2 User Guide", category: "Compute", url: "https://docs.aws.amazon.com/ec2/" },
  { name: "AWS Lambda Developer Guide", category: "Compute", url: "https://docs.aws.amazon.com/lambda/" },
  { name: "Amazon ECS Developer Guide", category: "Compute", url: "https://docs.aws.amazon.com/ecs/" },
  { name: "Amazon EKS User Guide", category: "Compute", url: "https://docs.aws.amazon.com/eks/" },
  { name: "AWS Fargate User Guide", category: "Compute", url: "https://docs.aws.amazon.com/AmazonECS/latest/userguide/what-is-fargate.html" },
  { name: "AWS Elastic Beanstalk Developer Guide", category: "Compute", url: "https://docs.aws.amazon.com/elasticbeanstalk/" },
  { name: "Amazon Lightsail Documentation", category: "Compute", url: "https://docs.aws.amazon.com/lightsail/" },
  // Storage
  { name: "Amazon S3 User Guide", category: "Storage", url: "https://docs.aws.amazon.com/s3/" },
  { name: "Amazon EBS User Guide", category: "Storage", url: "https://docs.aws.amazon.com/ebs/" },
  { name: "Amazon EFS User Guide", category: "Storage", url: "https://docs.aws.amazon.com/efs/" },
  // Database
  { name: "Amazon DynamoDB Developer Guide", category: "Database", url: "https://docs.aws.amazon.com/dynamodb/" },
  { name: "Amazon RDS User Guide", category: "Database", url: "https://docs.aws.amazon.com/rds/" },
  { name: "Amazon Aurora User Guide", category: "Database", url: "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/" },
  { name: "Amazon ElastiCache User Guide", category: "Database", url: "https://docs.aws.amazon.com/elasticache/" },
  { name: "Amazon Redshift Documentation", category: "Database", url: "https://docs.aws.amazon.com/redshift/" },
  // Networking
  { name: "Amazon VPC User Guide", category: "Networking", url: "https://docs.aws.amazon.com/vpc/" },
  { name: "Amazon CloudFront Developer Guide", category: "Networking", url: "https://docs.aws.amazon.com/cloudfront/" },
  { name: "Amazon Route 53 Developer Guide", category: "Networking", url: "https://docs.aws.amazon.com/route53/" },
  { name: "Amazon API Gateway Developer Guide", category: "Networking", url: "https://docs.aws.amazon.com/apigateway/" },
  { name: "Elastic Load Balancing User Guide", category: "Networking", url: "https://docs.aws.amazon.com/elasticloadbalancing/" },
  // Security
  { name: "AWS IAM User Guide", category: "Security", url: "https://docs.aws.amazon.com/iam/" },
  { name: "AWS KMS Developer Guide", category: "Security", url: "https://docs.aws.amazon.com/kms/" },
  { name: "AWS Secrets Manager User Guide", category: "Security", url: "https://docs.aws.amazon.com/secretsmanager/" },
  { name: "Amazon Cognito Developer Guide", category: "Security", url: "https://docs.aws.amazon.com/cognito/" },
  { name: "AWS WAF Developer Guide", category: "Security", url: "https://docs.aws.amazon.com/waf/" },
  { name: "Amazon GuardDuty User Guide", category: "Security", url: "https://docs.aws.amazon.com/guardduty/" },
  // Management & Monitoring
  { name: "Amazon CloudWatch User Guide", category: "Management", url: "https://docs.aws.amazon.com/cloudwatch/" },
  { name: "AWS CloudFormation User Guide", category: "Management", url: "https://docs.aws.amazon.com/cloudformation/" },
  { name: "AWS CloudTrail User Guide", category: "Management", url: "https://docs.aws.amazon.com/cloudtrail/" },
  { name: "AWS Systems Manager User Guide", category: "Management", url: "https://docs.aws.amazon.com/systems-manager/" },
  // Messaging
  { name: "Amazon SQS Developer Guide", category: "Messaging", url: "https://docs.aws.amazon.com/sqs/" },
  { name: "Amazon SNS Developer Guide", category: "Messaging", url: "https://docs.aws.amazon.com/sns/" },
  { name: "Amazon EventBridge User Guide", category: "Messaging", url: "https://docs.aws.amazon.com/eventbridge/" },
  { name: "Amazon Kinesis Developer Guide", category: "Messaging", url: "https://docs.aws.amazon.com/kinesis/" },
  { name: "AWS Step Functions Developer Guide", category: "Messaging", url: "https://docs.aws.amazon.com/step-functions/" },
  // Machine Learning
  { name: "Amazon SageMaker Developer Guide", category: "Machine Learning", url: "https://docs.aws.amazon.com/sagemaker/" },
  { name: "Amazon Bedrock User Guide", category: "Machine Learning", url: "https://docs.aws.amazon.com/bedrock/" },
  { name: "Amazon Rekognition Developer Guide", category: "Machine Learning", url: "https://docs.aws.amazon.com/rekognition/" },
  { name: "Amazon Comprehend Developer Guide", category: "Machine Learning", url: "https://docs.aws.amazon.com/comprehend/" },
  // Developer Tools
  { name: "AWS CodePipeline User Guide", category: "Developer Tools", url: "https://docs.aws.amazon.com/codepipeline/" },
  { name: "AWS CodeBuild User Guide", category: "Developer Tools", url: "https://docs.aws.amazon.com/codebuild/" },
  { name: "AWS CDK Developer Guide", category: "Developer Tools", url: "https://docs.aws.amazon.com/cdk/" },
  { name: "AWS Amplify Documentation", category: "Developer Tools", url: "https://docs.aws.amazon.com/amplify/" },
  // Analytics
  { name: "Amazon Athena User Guide", category: "Analytics", url: "https://docs.aws.amazon.com/athena/" },
  { name: "AWS Glue Developer Guide", category: "Analytics", url: "https://docs.aws.amazon.com/glue/" },
  { name: "Amazon QuickSight User Guide", category: "Analytics", url: "https://docs.aws.amazon.com/quicksight/" },
  { name: "Amazon EMR Documentation", category: "Analytics", url: "https://docs.aws.amazon.com/emr/" },
];

// --- Embedding helper ---

const EMBEDDING_DIMENSION = 256;

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    // Race against a 3-second timeout
    const bedrockPromise = client.send(
      new InvokeModelCommand({
        modelId: "amazon.titan-embed-text-v1",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: text.slice(0, 8000) }),
      })
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Embedding timeout")), 3000)
    );

    const response = await Promise.race([bedrockPromise, timeoutPromise]);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.embedding as number[];
  } catch {
    // Fallback: deterministic pseudo-random embedding for dev/testing
    return generateMockEmbedding(text);
  }
}

function generateMockEmbedding(text: string): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  const embedding: number[] = [];
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    hash = (hash * 1103515245 + 12345) | 0;
    embedding.push(((hash >>> 16) & 0x7fff) / 0x7fff);
  }
  return embedding;
}

// --- Document parsing ---

async function parseDocument(
  content: Buffer,
  format: DocumentFormat
): Promise<string> {
  switch (format) {
    case DocumentFormat.PDF: {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(content) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }
    case DocumentFormat.HTML: {
      const $ = cheerio.load(content.toString("utf-8"));
      // Remove script/style tags
      $("script, style, nav, footer, header").remove();
      return $("body").text().trim() || $.text().trim();
    }
    case DocumentFormat.MARKDOWN: {
      const html = await marked(content.toString("utf-8"));
      const $ = cheerio.load(html);
      return $.text().trim();
    }
    case DocumentFormat.TEXT:
      return content.toString("utf-8");
    default:
      return content.toString("utf-8");
  }
}

function extractMarkdownSections(text: string): ParsedSection[] {
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  const parentStack: { level: number; title: string; number: string }[] = [];
  const levelCounters: Record<number, number> = {};

  let currentTitle = "";
  let currentLevel = 0;
  let currentContent: string[] = [];
  let sectionIndex = 0;

  function flushSection() {
    if (currentTitle || currentContent.length > 0) {
      const title = currentTitle || "Introduction";
      const sectionNumber = buildSectionNumber(currentLevel, levelCounters);
      sections.push({
        sectionId: `sec-${sectionIndex++}`,
        sectionTitle: title,
        content: currentContent.join("\n").trim(),
        level: currentLevel,
        sectionNumber,
        parentSections: parentStack
          .filter((p) => p.level < currentLevel)
          .map((p) => ({ sectionNumber: p.number, title: p.title })),
      });
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushSection();
      currentLevel = headingMatch[1].length;
      currentTitle = headingMatch[2].trim();
      currentContent = [];

      // Update counters
      if (!levelCounters[currentLevel]) levelCounters[currentLevel] = 0;
      levelCounters[currentLevel]++;
      // Reset deeper level counters
      for (const key of Object.keys(levelCounters)) {
        if (Number(key) > currentLevel) delete levelCounters[Number(key)];
      }

      const sectionNumber = buildSectionNumber(currentLevel, levelCounters);

      // Update parent stack
      while (
        parentStack.length > 0 &&
        parentStack[parentStack.length - 1].level >= currentLevel
      ) {
        parentStack.pop();
      }
      parentStack.push({
        level: currentLevel,
        title: currentTitle,
        number: sectionNumber,
      });
    } else {
      currentContent.push(line);
    }
  }
  flushSection();

  // Filter out empty sections and fix titles for no-heading content
  const nonEmpty = sections.filter((s) => s.content.length > 0);

  // If no headings were found, label the single section as "Content"
  if (nonEmpty.length > 0 && !text.match(/^#{1,6}\s+/m)) {
    nonEmpty[0].sectionTitle = "Content";
  }

  return nonEmpty;
}

function buildSectionNumber(
  level: number,
  counters: Record<number, number>
): string {
  const parts: number[] = [];
  for (let l = 1; l <= level; l++) {
    parts.push(counters[l] || 1);
  }
  return parts.join(".") || "1";
}

// --- Keyword extraction ---

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "that", "this", "it",
  "its", "i", "me", "my", "we", "our", "you", "your", "he", "him",
  "his", "she", "her", "they", "them", "their", "what", "which", "who",
]);

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Count frequency
  const freq: Record<string, number> = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  // Return top keywords sorted by frequency
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word]) => word);
}

// --- Cosine similarity for embedding search ---

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// --- DocumentIndexer class ---

export class DocumentIndexer {
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private dbIndexed = false; // Track whether docs have been indexed to DynamoDB

  /**
   * Index pre-defined official AWS documentation.
   * In production, this would fetch real docs from AWS. Here we index
   * placeholder entries so they appear in the document list.
   */
  async indexOfficialDocs(): Promise<IndexResult> {
    const errors: string[] = [];
    let totalSections = 0;
    const docId = "official-aws-docs";

    for (const doc of OFFICIAL_AWS_DOCS) {
      try {
        const placeholderContent = `# ${doc.name}\n\nOfficial AWS documentation for ${doc.name}.\n\n## Overview\n\nThis is the ${doc.name} covering key concepts, configuration, and best practices.\n\n## Getting Started\n\nLearn how to get started with ${doc.name.replace(" Developer Guide", "").replace(" User Guide", "")}.\n\n## Configuration\n\nDetailed configuration options and parameters.`;

        const sections = extractMarkdownSections(placeholderContent);
        totalSections += sections.length;

        for (const section of sections) {
          const keywords = extractKeywords(
            `${section.sectionTitle} ${section.content}`
          );
          const embedding = await generateEmbedding(
            `${section.sectionTitle} ${section.content}`
          );

          const record: DocumentRecord = {
            docId: `aws-${doc.name.toLowerCase().replace(/\s+/g, "-")}`,
            sectionId: section.sectionId,
            docTitle: doc.name,
            sectionTitle: section.sectionTitle,
            sectionNumber: section.sectionNumber,
            content: section.content,
            level: section.level,
            parentSections: section.parentSections,
            keywords,
            embedding,
            type: DocumentType.OFFICIAL_AWS,
            category: doc.category,
            indexedAt: new Date().toISOString(),
          };

          await dynamodb.put({
            TableName: TABLES.Documents,
            Item: record,
          });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown error";
        errors.push(`Failed to index ${doc.name}: ${msg}`);
      }
    }

    if (errors.length === 0) {
      this.dbIndexed = true;
    }

    return {
      docId,
      title: "Official AWS Documentation",
      sections: totalSections,
      indexedAt: new Date(),
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Parse and index a user-uploaded document.
   */
  async indexCustomDoc(file: UploadedFile): Promise<IndexResult> {
    const errors: string[] = [];
    const docId = `custom-${Date.now()}-${file.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;

    try {
      // Upload raw file to S3
      await s3.upload({
        bucket: BUCKETS.CustomDocsUploads,
        key: `${docId}/${file.name}`,
        body: file.content,
        contentType: formatToMimeType(file.format),
      });

      // Parse document text
      const text = await parseDocument(file.content, file.format);

      // Extract sections
      const sections = extractMarkdownSections(text);

      // Index each section
      for (const section of sections) {
        const keywords = extractKeywords(
          `${section.sectionTitle} ${section.content}`
        );
        const embedding = await generateEmbedding(
          `${section.sectionTitle} ${section.content}`
        );

        const record: DocumentRecord = {
          docId,
          sectionId: section.sectionId,
          docTitle: file.name,
          sectionTitle: section.sectionTitle,
          sectionNumber: section.sectionNumber,
          content: section.content,
          level: section.level,
          parentSections: section.parentSections,
          keywords,
          embedding,
          type: DocumentType.CUSTOM_UPLOAD,
          category: file.category,
          indexedAt: new Date().toISOString(),
        };

        await dynamodb.put({
          TableName: TABLES.Documents,
          Item: record,
        });
      }

      return {
        docId,
        title: file.name,
        sections: sections.length,
        indexedAt: new Date(),
        success: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(msg);
      return {
        docId,
        title: file.name,
        sections: 0,
        indexedAt: new Date(),
        success: false,
        errors,
      };
    }
  }

  /**
   * Re-index official AWS docs that have been updated.
   * In production this would check for doc updates; here it re-indexes all.
   */
  async syncOfficialDocs(): Promise<SyncResult> {
    let docsUpdated = 0;
    let docsAdded = 0;
    const docsRemoved = 0;

    for (const doc of OFFICIAL_AWS_DOCS) {
      try {
        const docId = `aws-${doc.name.toLowerCase().replace(/\s+/g, "-")}`;

        // Check if doc already exists
        const existing = await dynamodb.query({
          TableName: TABLES.Documents,
          KeyConditionExpression: "docId = :docId",
          ExpressionAttributeValues: { ":docId": docId },
          Limit: 1,
        });

        if (existing.length > 0) {
          docsUpdated++;
        } else {
          docsAdded++;
        }
      } catch {
        // Skip failed docs during sync
      }
    }

    // Re-index all
    await this.indexOfficialDocs();

    return {
      docsUpdated,
      docsAdded,
      docsRemoved,
      syncedAt: new Date(),
    };
  }

  /**
   * Search indexed documents using keyword matching and optional embedding similarity.
   * Falls back to in-memory search against OFFICIAL_AWS_DOCS when DynamoDB has no indexed data.
   */
  async searchIndex(
    query: string,
    docIds?: string[]
  ): Promise<SearchMatch[]> {
    const queryKeywords = extractKeywords(query);

    // Skip DynamoDB if we know docs haven't been indexed there
    if (!this.dbIndexed) {
      return this.searchInMemory(query, queryKeywords, docIds);
    }

    // Try DynamoDB first (with a fast timeout)
    let allDocs: Record<string, unknown>[] = [];
    try {
      const dbTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DynamoDB timeout")), 1500)
      );

      const dbQuery = async () => {
        if (docIds && docIds.length > 0) {
          const results: Record<string, unknown>[] = [];
          for (const docId of docIds) {
            const items = await dynamodb.query({
              TableName: TABLES.Documents,
              KeyConditionExpression: "docId = :docId",
              ExpressionAttributeValues: { ":docId": docId },
            });
            results.push(...items);
          }
          return results;
        } else {
          return await dynamodb.scan({ TableName: TABLES.Documents });
        }
      };

      allDocs = await Promise.race([dbQuery(), dbTimeout]);
    } catch {
      // DynamoDB unavailable or timed out, will fall back to in-memory
      allDocs = [];
    }

    // If DynamoDB has indexed data, use it with embeddings
    if (allDocs.length > 0) {
      const queryEmbedding = await generateEmbedding(query);
      const scored: SearchMatch[] = [];

      for (const doc of allDocs) {
        const record = doc as unknown as DocumentRecord;
        const keywordScore = computeKeywordScore(queryKeywords, record.keywords);
        const embeddingScore = record.embedding
          ? cosineSimilarity(queryEmbedding, record.embedding)
          : 0;

        const relevanceScore = keywordScore * 0.4 + embeddingScore * 0.6;

        if (relevanceScore > 0.05) {
          scored.push({
            docId: record.docId,
            docTitle: record.docTitle,
            sectionId: record.sectionId,
            sectionTitle: record.sectionTitle,
            content: record.content,
            relevanceScore: Math.round(relevanceScore * 1000) / 1000,
          });
        }
      }

      scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
      return scored.slice(0, 10);
    }

    // Fallback: in-memory search against OFFICIAL_AWS_DOCS placeholder content
    return this.searchInMemory(query, queryKeywords, docIds);
  }

  /**
   * In-memory search fallback when DynamoDB has no indexed documents.
   * Generates placeholder sections from OFFICIAL_AWS_DOCS and scores them.
   */
  private searchInMemory(
    query: string,
    queryKeywords: string[],
    docIds?: string[]
  ): SearchMatch[] {
    const queryLower = query.toLowerCase();
    const scored: SearchMatch[] = [];

    for (const doc of OFFICIAL_AWS_DOCS) {
      const docId = `aws-${doc.name.toLowerCase().replace(/\s+/g, "-")}`;

      // Filter by selected docIds if provided
      if (docIds && docIds.length > 0 && !docIds.includes(docId)) {
        continue;
      }

      const serviceName = doc.name
        .replace(" Developer Guide", "")
        .replace(" User Guide", "")
        .replace(" Documentation", "");

      // Generate richer placeholder content per section
      const sections = [
        {
          sectionId: "sec-0",
          sectionTitle: doc.name,
          content: `${doc.name} provides comprehensive documentation for ${serviceName}. This guide covers key concepts, configuration options, best practices, and common use cases for ${serviceName} on AWS.`,
        },
        {
          sectionId: "sec-1",
          sectionTitle: `Getting Started with ${serviceName}`,
          content: `Learn how to get started with ${serviceName}. This section covers initial setup, configuration, prerequisites, and your first deployment. ${serviceName} is part of the AWS ${doc.category} services.`,
        },
        {
          sectionId: "sec-2",
          sectionTitle: `${serviceName} Configuration`,
          content: `Detailed configuration options and parameters for ${serviceName}. Learn about advanced settings, performance tuning, security configuration, and integration with other AWS services.`,
        },
        {
          sectionId: "sec-3",
          sectionTitle: `${serviceName} Best Practices`,
          content: `Best practices for using ${serviceName} in production. Covers security best practices, cost optimization, performance optimization, monitoring, and operational excellence for ${serviceName}.`,
        },
      ];

      for (const section of sections) {
        const contentLower = section.content.toLowerCase();
        const titleLower = section.sectionTitle.toLowerCase();

        // Score based on keyword matches in content and title
        let score = 0;
        for (const kw of queryKeywords) {
          if (contentLower.includes(kw)) score += 0.15;
          if (titleLower.includes(kw)) score += 0.25;
        }

        // Boost if query directly mentions the service name
        if (queryLower.includes(serviceName.toLowerCase())) {
          score += 0.3;
        }

        // Boost for category match
        if (queryLower.includes(doc.category.toLowerCase())) {
          score += 0.1;
        }

        if (score > 0.05) {
          scored.push({
            docId,
            docTitle: doc.name,
            sectionId: section.sectionId,
            sectionTitle: section.sectionTitle,
            content: section.content,
            relevanceScore: Math.round(Math.min(score, 1) * 1000) / 1000,
          });
        }
      }
    }

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored.slice(0, 10);
  }

  /**
   * Start 24-hour sync scheduling for official AWS docs.
   */
  startSyncSchedule(): void {
    if (this.syncTimer) return;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    this.syncTimer = setInterval(() => {
      this.syncOfficialDocs().catch((err) => {
        console.error("Scheduled sync failed:", err);
      });
    }, TWENTY_FOUR_HOURS);
  }

  /**
   * Stop the sync schedule.
   */
  stopSyncSchedule(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

// --- Helpers ---

function computeKeywordScore(
  queryKeywords: string[],
  docKeywords: string[]
): number {
  if (queryKeywords.length === 0 || docKeywords.length === 0) return 0;
  const docSet = new Set(docKeywords);
  let matches = 0;
  for (const kw of queryKeywords) {
    if (docSet.has(kw)) matches++;
  }
  return matches / queryKeywords.length;
}

function formatToMimeType(format: DocumentFormat): string {
  switch (format) {
    case DocumentFormat.PDF:
      return "application/pdf";
    case DocumentFormat.HTML:
      return "text/html";
    case DocumentFormat.MARKDOWN:
      return "text/markdown";
    case DocumentFormat.TEXT:
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

// Export helpers for testing
export {
  parseDocument,
  extractMarkdownSections,
  extractKeywords,
  cosineSimilarity,
  generateMockEmbedding,
  computeKeywordScore,
  formatToMimeType,
  OFFICIAL_AWS_DOCS,
  type ParsedSection,
  type DocumentRecord,
};

import {
  DocumentType,
  type DocumentInfo,
  type DocumentFilter,
  type UploadedFile,
  type IndexResult,
} from "@aws-intel/shared";

import * as dynamodb from "../../lib/dynamodb";
import * as s3 from "../../lib/s3";
import { TABLES } from "../../config/tables";
import { BUCKETS } from "../../config/buckets";
import { DocumentIndexer, OFFICIAL_AWS_DOCS } from "./documentIndexer";

// --- Service category definitions ---

const SERVICE_CATEGORIES: Record<string, string[]> = {
  Compute: ["EC2", "Lambda", "ECS", "EKS", "Fargate", "Batch", "Lightsail"],
  Storage: ["S3", "EBS", "EFS", "FSx", "Storage Gateway", "Backup"],
  Database: ["DynamoDB", "RDS", "Aurora", "ElastiCache", "Redshift", "Neptune", "DocumentDB"],
  Networking: ["VPC", "CloudFront", "Route 53", "API Gateway", "ELB", "Direct Connect"],
  Security: ["IAM", "KMS", "Secrets Manager", "WAF", "Shield", "GuardDuty", "Cognito"],
  Management: ["CloudWatch", "CloudFormation", "CloudTrail", "Config", "Systems Manager"],
  Messaging: ["SQS", "SNS", "EventBridge", "Kinesis", "MQ"],
  "Machine Learning": ["SageMaker", "Bedrock", "Comprehend", "Rekognition", "Textract"],
  "Developer Tools": ["CodeCommit", "CodeBuild", "CodeDeploy", "CodePipeline", "X-Ray"],
  Analytics: ["Athena", "EMR", "Glue", "QuickSight", "Lake Formation"],
};

// --- DocumentManager class ---

export class DocumentManager {
  private selectedDocIds: Set<string> = new Set();
  private indexer: DocumentIndexer;

  constructor(indexer?: DocumentIndexer) {
    this.indexer = indexer ?? new DocumentIndexer();
  }

  /**
   * List documents with optional filtering by category, search term, or type.
   * Returns official AWS docs and custom uploads, separated by type.
   */
  async listDocuments(filter?: DocumentFilter): Promise<DocumentInfo[]> {
    const officialDocs = this.getOfficialDocInfos();
    const customDocs = await this.getCustomDocInfos();

    let allDocs = [...officialDocs, ...customDocs];

    if (filter) {
      allDocs = this.applyFilter(allDocs, filter);
    }

    return allDocs;
  }

  /**
   * Select documents by their IDs for cross-service querying.
   */
  selectDocuments(docIds: string[]): void {
    this.selectedDocIds = new Set(docIds);
  }

  /**
   * Get currently selected documents.
   * If none are selected, returns all documents (default behavior per requirement 2.5).
   */
  async getSelectedDocuments(): Promise<DocumentInfo[]> {
    const allDocs = await this.listDocuments();

    if (this.selectedDocIds.size === 0) {
      return allDocs.map((doc) => ({ ...doc, selected: true }));
    }

    return allDocs
      .filter((doc) => this.selectedDocIds.has(doc.docId))
      .map((doc) => ({ ...doc, selected: true }));
  }

  /**
   * Upload and index a custom document. Stores it in S3 and indexes via DocumentIndexer.
   */
  async uploadCustomDoc(file: UploadedFile): Promise<DocumentInfo> {
    const indexResult: IndexResult = await this.indexer.indexCustomDoc(file);

    if (!indexResult.success) {
      throw new Error(
        `Failed to index document: ${indexResult.errors?.join(", ") ?? "Unknown error"}`
      );
    }

    return {
      docId: indexResult.docId,
      title: file.name,
      category: file.category ?? "Custom",
      type: DocumentType.CUSTOM_UPLOAD,
      sections: indexResult.sections,
      lastUpdated: indexResult.indexedAt,
      selected: false,
    };
  }

  /**
   * Delete a custom uploaded document from the index and S3.
   */
  async deleteCustomDoc(docId: string): Promise<void> {
    // Remove all sections from DynamoDB
    const sections = await dynamodb.query({
      TableName: TABLES.Documents,
      KeyConditionExpression: "docId = :docId",
      ExpressionAttributeValues: { ":docId": docId },
    });

    for (const section of sections) {
      await dynamodb.del({
        TableName: TABLES.Documents,
        Key: {
          docId: section.docId as string,
          sectionId: section.sectionId as string,
        },
      });
    }

    // Remove files from S3
    const s3Objects = await s3.listObjects(BUCKETS.CustomDocsUploads, `${docId}/`);
    for (const obj of s3Objects) {
      await s3.deleteObject(BUCKETS.CustomDocsUploads, obj.key);
    }

    // Remove from selection if selected
    this.selectedDocIds.delete(docId);
  }

  // --- Private helpers ---

  /**
   * Build DocumentInfo entries from the predefined official AWS docs list.
   */
  private getOfficialDocInfos(): DocumentInfo[] {
    return OFFICIAL_AWS_DOCS.map((doc) => {
      const docId = `aws-${doc.name.toLowerCase().replace(/\s+/g, "-")}`;
      return {
        docId,
        title: doc.name,
        category: doc.category,
        type: DocumentType.OFFICIAL_AWS,
        sections: 3, // placeholder section count for predefined docs
        lastUpdated: new Date(),
        selected: this.selectedDocIds.has(docId),
      };
    });
  }

  /**
   * Fetch custom uploaded document infos from DynamoDB.
   */
  private async getCustomDocInfos(): Promise<DocumentInfo[]> {
    try {
      const allItems = await dynamodb.scan({
        TableName: TABLES.Documents,
        FilterExpression: "#type = :customType",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":customType": DocumentType.CUSTOM_UPLOAD },
      });

      // Group by docId to get unique documents
      const docMap = new Map<string, DocumentInfo>();
      for (const item of allItems) {
        const docId = item.docId as string;
        if (!docMap.has(docId)) {
          docMap.set(docId, {
            docId,
            title: item.docTitle as string,
            category: (item.category as string) ?? "Custom",
            type: DocumentType.CUSTOM_UPLOAD,
            sections: 0,
            lastUpdated: new Date(item.indexedAt as string),
            selected: this.selectedDocIds.has(docId),
          });
        }
        const existing = docMap.get(docId)!;
        existing.sections++;
      }

      return Array.from(docMap.values());
    } catch {
      // Fallback: return empty if DynamoDB is unavailable
      return [];
    }
  }

  /**
   * Apply filter criteria to a list of documents.
   */
  private applyFilter(docs: DocumentInfo[], filter: DocumentFilter): DocumentInfo[] {
    let filtered = docs;

    if (filter.type) {
      filtered = filtered.filter((doc) => doc.type === filter.type);
    }

    if (filter.category) {
      const cat = filter.category.toLowerCase();
      filtered = filtered.filter((doc) => doc.category.toLowerCase() === cat);
    }

    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.title.toLowerCase().includes(term) ||
          doc.category.toLowerCase().includes(term)
      );
    }

    return filtered;
  }
}

// Export for testing
export { SERVICE_CATEGORIES };

import { Router, Request, Response, NextFunction } from "express";
import { DocumentFormat } from "@aws-intel/shared";
import { AppError } from "../middleware/errorHandler";
import { QueryProcessor } from "../services/doc-navigator/queryProcessor";
import { DocumentIndexer } from "../services/doc-navigator/documentIndexer";
import { DocumentManager } from "../services/doc-navigator/documentManager";
import { SectionExtractor } from "../services/doc-navigator/sectionExtractor";
import { AnswerBuilder } from "../services/doc-navigator/answerBuilder";
import { CodeExtractor } from "../services/doc-navigator/codeExtractor";
import { QuestionHistoryManager } from "../services/doc-navigator/questionHistoryManager";
import { getRAGPipeline } from "../services/doc-navigator/ragPipeline";

const router = Router();

// --- Service instances ---
const queryProcessor = new QueryProcessor();
const documentIndexer = new DocumentIndexer();
const documentManager = new DocumentManager(documentIndexer);
const sectionExtractor = new SectionExtractor();
const answerBuilder = new AnswerBuilder();
const codeExtractor = new CodeExtractor();
const historyManager = new QuestionHistoryManager();

const DEFAULT_USER_ID = "default-user";
const QUERY_TIMEOUT_MS = 2000;

// --- Helper: async route wrapper ---
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// --- POST /query - Submit natural language question ---
router.post(
  "/query",
  asyncHandler(async (req, res) => {
    const { question, docIds } = req.body;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      throw new AppError(400, "BadRequest", "Question is required");
    }

    const startTime = Date.now();

    // 1. Process the query
    const processedQuery = queryProcessor.processQuery(question.trim());

    // 2. Get selected doc IDs (use provided or fall back to all docs)
    let searchDocIds = docIds as string[] | undefined;
    if (!searchDocIds || searchDocIds.length === 0) {
      // Skip DynamoDB call for selected docs — just pass undefined to search all
      searchDocIds = undefined;
    }

    // 3. Search the index
    const searchMatches = await documentIndexer.searchIndex(
      processedQuery.normalizedQuestion,
      searchDocIds && searchDocIds.length > 0 ? searchDocIds : undefined
    );

    // 4. Extract relevant sections
    const extractedSections = await sectionExtractor.extractRelevantSections(
      searchMatches,
      processedQuery
    );

    // 5. Highlight answers in each section
    const highlightedSections = extractedSections.map((section) =>
      sectionExtractor.highlightAnswers(section, processedQuery)
    );

    // 6. Extract code examples
    const codeExamples = codeExtractor.extractCodeExamples(
      extractedSections,
      processedQuery
    );

    // 7. Build the answer
    const answer = await answerBuilder.buildAnswer(highlightedSections, processedQuery);

    // Merge code examples from CodeExtractor (may be richer than AnswerBuilder's)
    if (codeExamples.length > 0) {
      answer.codeExamples = codeExamples;
    }

    // 8. Save to history (non-blocking, don't let it delay the response)
    let historyQuestionId = `q-${Date.now()}-local`;
    try {
      const historyTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("History save timeout")), 2000)
      );
      const historySave = historyManager.saveQuestion(
        DEFAULT_USER_ID,
        question.trim(),
        answer
      );
      const historyEntry = await Promise.race([historySave, historyTimeout]);
      historyQuestionId = historyEntry.questionId;
    } catch {
      // History save failed or timed out, continue with response
    }

    const responseTimeMs = Date.now() - startTime;

    res.json({
      questionId: historyQuestionId,
      question: question.trim(),
      answer,
      responseTimeMs,
      withinTarget: responseTimeMs <= QUERY_TIMEOUT_MS,
    });
  })
);


// --- GET /list - List available documents ---
router.get(
  "/list",
  asyncHandler(async (req, res) => {
    const { category, searchTerm, type } = req.query;

    const filter: Record<string, string> = {};
    if (typeof category === "string" && category.length > 0) filter.category = category;
    if (typeof searchTerm === "string" && searchTerm.length > 0) filter.searchTerm = searchTerm;
    if (typeof type === "string" && type.length > 0) filter.type = type;

    const documents = await documentManager.listDocuments(
      Object.keys(filter).length > 0 ? filter : undefined
    );

    res.json({ documents });
  })
);

// --- POST /select - Select documents for querying ---
router.post(
  "/select",
  asyncHandler(async (req, res) => {
    const { docIds } = req.body;

    if (!Array.isArray(docIds)) {
      throw new AppError(400, "BadRequest", "docIds must be an array of strings");
    }

    documentManager.selectDocuments(docIds);

    res.json({ selected: docIds });
  })
);

// --- POST /upload - Upload custom documentation ---
router.post(
  "/upload",
  asyncHandler(async (req, res) => {
    const { name, format, content, category } = req.body;

    if (!name || typeof name !== "string") {
      throw new AppError(400, "BadRequest", "Document name is required");
    }

    if (!format || !Object.values(DocumentFormat).includes(format as DocumentFormat)) {
      throw new AppError(
        400,
        "BadRequest",
        `Invalid format. Supported: ${Object.values(DocumentFormat).join(", ")}`
      );
    }

    if (!content || typeof content !== "string") {
      throw new AppError(400, "BadRequest", "Document content is required (base64 encoded)");
    }

    const buffer = Buffer.from(content, "base64");

    const docInfo = await documentManager.uploadCustomDoc({
      name,
      format: format as DocumentFormat,
      content: buffer,
      category: typeof category === "string" ? category : undefined,
    });

    res.status(201).json({ document: docInfo });
  })
);

// --- DELETE /:docId - Delete custom uploaded document ---
router.delete(
  "/:docId",
  asyncHandler(async (req, res) => {
    const { docId } = req.params;

    if (!docId) {
      throw new AppError(400, "BadRequest", "Document ID is required");
    }

    await documentManager.deleteCustomDoc(docId);

    res.json({ deleted: docId });
  })
);

// --- GET /history - Get question history ---
router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    try {
      const historyTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("History timeout")), 3000)
      );
      const historyFetch = historyManager.getHistory(DEFAULT_USER_ID, limit);
      const history = await Promise.race([historyFetch, historyTimeout]);
      res.json({ history });
    } catch {
      // DynamoDB unavailable, return empty history
      res.json({ history: [] });
    }
  })
);

// --- GET /history/:questionId - Re-display a previous answer ---
router.get(
  "/history/:questionId",
  asyncHandler(async (req, res) => {
    const { questionId } = req.params;

    if (!questionId) {
      throw new AppError(400, "BadRequest", "Question ID is required");
    }

    try {
      const answerTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Answer timeout")), 3000)
      );
      const answerFetch = historyManager.getAnswer(DEFAULT_USER_ID, questionId);
      const answer = await Promise.race([answerFetch, answerTimeout]);

      if (!answer) {
        throw new AppError(404, "NotFound", "Question not found in history");
      }

      res.json({ questionId, answer });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(404, "NotFound", "Question not found in history");
    }
  })
);

// ============================================
// RAG Pipeline Endpoints
// ============================================

// --- POST /rag/query - RAG-based question answering ---
router.post(
  "/rag/query",
  asyncHandler(async (req, res) => {
    const { question, docIds } = req.body;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      throw new AppError(400, "BadRequest", "Question is required");
    }

    const startTime = Date.now();
    const ragPipeline = getRAGPipeline();

    // Process the query
    const processedQuery = queryProcessor.processQuery(question.trim());

    // Try RAG answer first
    let answer = await ragPipeline.answerQuestion(
      processedQuery,
      docIds as string[] | undefined
    );

    // If RAG returns no results (confidence 0), fall back to legacy search
    if (answer.confidence === 0 || answer.citations.length === 0) {
      // Use legacy search which works with placeholder content
      const searchMatches = await documentIndexer.searchIndex(
        processedQuery.normalizedQuestion,
        docIds as string[] | undefined
      );

      if (searchMatches.length > 0) {
        // Extract relevant sections
        const extractedSections = await sectionExtractor.extractRelevantSections(
          searchMatches,
          processedQuery
        );

        // Highlight answers
        const highlightedSections = extractedSections.map((section) =>
          sectionExtractor.highlightAnswers(section, processedQuery)
        );

        // Build answer using legacy method
        const legacyAnswer = await answerBuilder.buildAnswer(highlightedSections, processedQuery);

        // Convert to RAG response format
        answer = {
          answer: legacyAnswer.directAnswer || 
            `Based on the ${searchMatches[0].docTitle}, here's what I found about your question. ` +
            `The documentation covers ${searchMatches.map(m => m.sectionTitle).slice(0, 3).join(', ')}. ` +
            `For detailed information, please refer to the official AWS documentation.`,
          confidence: Math.max(...searchMatches.map(m => m.relevanceScore)) || 0.5,
          citations: searchMatches.slice(0, 5).map(match => ({
            chunkId: match.sectionId,
            docId: match.docId,
            docTitle: match.docTitle,
            sectionTitle: match.sectionTitle,
            text: match.content.slice(0, 200),
            excerpt: match.content.slice(0, 150),
            score: match.relevanceScore,
          })),
          followUpQuestions: [
            `What are the best practices for ${processedQuery.awsServices[0] || 'this service'}?`,
            `How do I configure ${processedQuery.awsServices[0] || 'this service'} for production?`,
            'Can you show me code examples?',
          ],
        };
      }
    }

    const responseTimeMs = Date.now() - startTime;

    res.json({
      question: question.trim(),
      answer: answer.answer,
      confidence: answer.confidence,
      citations: answer.citations,
      followUpQuestions: answer.followUpQuestions,
      responseTimeMs,
    });
  })
);

// --- POST /rag/index - Index a document for RAG ---
router.post(
  "/rag/index",
  asyncHandler(async (req, res) => {
    const { docUrl, docId, title, category } = req.body;

    if (!docUrl || typeof docUrl !== "string") {
      throw new AppError(400, "BadRequest", "docUrl is required");
    }

    if (!docId || typeof docId !== "string") {
      throw new AppError(400, "BadRequest", "docId is required");
    }

    if (!title || typeof title !== "string") {
      throw new AppError(400, "BadRequest", "title is required");
    }

    const ragPipeline = getRAGPipeline();

    // Start indexing (this can take a while)
    const result = await ragPipeline.indexDocument(
      docUrl,
      docId,
      title,
      category || "General"
    );

    res.status(result.success ? 201 : 500).json({
      docId: result.docId,
      title: result.title,
      sections: result.sections,
      indexedAt: result.indexedAt,
      success: result.success,
      errors: result.errors,
    });
  })
);

// --- GET /rag/status/:docId - Get document index status ---
router.get(
  "/rag/status/:docId",
  asyncHandler(async (req, res) => {
    const { docId } = req.params;

    if (!docId) {
      throw new AppError(400, "BadRequest", "Document ID is required");
    }

    const ragPipeline = getRAGPipeline();
    const status = await ragPipeline.getIndexStatus(docId);

    if (!status) {
      throw new AppError(404, "NotFound", "Document not found in index");
    }

    res.json({
      docId: status.docId,
      title: status.title,
      category: status.category,
      status: status.status,
      totalChunks: status.totalChunks,
      totalSections: status.totalSections,
      lastIndexedAt: status.lastIndexedAt,
      errors: status.errors,
    });
  })
);

// --- GET /rag/indexed - List all indexed documents ---
router.get(
  "/rag/indexed",
  asyncHandler(async (req, res) => {
    const ragPipeline = getRAGPipeline();
    const documents = await ragPipeline.getIndexedDocuments();

    res.json({
      documents: documents.map((doc) => ({
        docId: doc.docId,
        title: doc.title,
        category: doc.category,
        status: doc.status,
        totalChunks: doc.totalChunks,
        lastIndexedAt: doc.lastIndexedAt,
      })),
    });
  })
);

// --- DELETE /rag/:docId - Delete a document from RAG index ---
router.delete(
  "/rag/:docId",
  asyncHandler(async (req, res) => {
    const { docId } = req.params;

    if (!docId) {
      throw new AppError(400, "BadRequest", "Document ID is required");
    }

    const ragPipeline = getRAGPipeline();
    await ragPipeline.deleteDocument(docId);

    res.json({ deleted: docId });
  })
);

// --- POST /rag/sync - Trigger sync for all indexed documents ---
router.post(
  "/rag/sync",
  asyncHandler(async (req, res) => {
    const ragPipeline = getRAGPipeline();
    const documents = await ragPipeline.getIndexedDocuments();

    const results = [];
    for (const doc of documents) {
      if (doc.status === "ready" || doc.status === "stale") {
        try {
          const result = await ragPipeline.indexDocument(
            doc.sourceUrl,
            doc.docId,
            doc.title,
            doc.category
          );
          results.push({
            docId: doc.docId,
            success: result.success,
            sections: result.sections,
          });
        } catch (err) {
          results.push({
            docId: doc.docId,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }

    res.json({
      syncedAt: new Date().toISOString(),
      results,
    });
  })
);

// --- POST /rag/index-official - Index predefined AWS documentation ---
router.post(
  "/rag/index-official",
  asyncHandler(async (req, res) => {
    const { docIds } = req.body;
    
    // Predefined AWS documentation URLs
    const AWS_DOCS_CONFIG: Record<string, { title: string; category: string; url: string }> = {
      "aws-aws-lambda-developer-guide": {
        title: "AWS Lambda Developer Guide",
        category: "Compute",
        url: "https://docs.aws.amazon.com/lambda/latest/dg/welcome.html",
      },
      "aws-amazon-ecs-developer-guide": {
        title: "Amazon ECS Developer Guide",
        category: "Compute",
        url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html",
      },
      "aws-amazon-ec2-user-guide": {
        title: "Amazon EC2 User Guide",
        category: "Compute",
        url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html",
      },
      "aws-amazon-eks-user-guide": {
        title: "Amazon EKS User Guide",
        category: "Compute",
        url: "https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html",
      },
      "aws-amazon-s3-user-guide": {
        title: "Amazon S3 User Guide",
        category: "Storage",
        url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html",
      },
      "aws-amazon-ebs-user-guide": {
        title: "Amazon EBS User Guide",
        category: "Storage",
        url: "https://docs.aws.amazon.com/ebs/latest/userguide/what-is-ebs.html",
      },
      "aws-amazon-dynamodb-developer-guide": {
        title: "Amazon DynamoDB Developer Guide",
        category: "Database",
        url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html",
      },
      "aws-amazon-rds-user-guide": {
        title: "Amazon RDS User Guide",
        category: "Database",
        url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html",
      },
      "aws-aws-iam-user-guide": {
        title: "AWS IAM User Guide",
        category: "Security",
        url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html",
      },
      "aws-amazon-vpc-user-guide": {
        title: "Amazon VPC User Guide",
        category: "Networking",
        url: "https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html",
      },
      "aws-amazon-cloudwatch-user-guide": {
        title: "Amazon CloudWatch User Guide",
        category: "Management",
        url: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html",
      },
      "aws-amazon-sqs-developer-guide": {
        title: "Amazon SQS Developer Guide",
        category: "Messaging",
        url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html",
      },
      "aws-amazon-sns-developer-guide": {
        title: "Amazon SNS Developer Guide",
        category: "Messaging",
        url: "https://docs.aws.amazon.com/sns/latest/dg/welcome.html",
      },
      "aws-amazon-api-gateway-developer-guide": {
        title: "Amazon API Gateway Developer Guide",
        category: "Networking",
        url: "https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html",
      },
      "aws-aws-cloudformation-user-guide": {
        title: "AWS CloudFormation User Guide",
        category: "Management",
        url: "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html",
      },
    };

    const ragPipeline = getRAGPipeline();
    const results: Array<{
      docId: string;
      title: string;
      success: boolean;
      message?: string;
      sections?: number;
      error?: string;
      errors?: string[];
    }> = [];

    // If specific docIds provided, only index those; otherwise index all
    const docsToIndex = docIds && Array.isArray(docIds) && docIds.length > 0
      ? docIds.filter((id: string) => AWS_DOCS_CONFIG[id])
      : Object.keys(AWS_DOCS_CONFIG);

    // Check status of each document and start indexing in background
    for (const docId of docsToIndex) {
      const config = AWS_DOCS_CONFIG[docId];
      if (!config) continue;

      try {
        // Check if already indexed or indexing
        const status = await ragPipeline.getIndexStatus(docId);
        if (status?.status === "ready") {
          results.push({
            docId,
            title: config.title,
            success: true,
            message: "Already indexed",
            sections: status.totalSections,
          });
          continue;
        }
        
        if (status?.status === "indexing") {
          results.push({
            docId,
            title: config.title,
            success: true,
            message: "Indexing in progress",
          });
          continue;
        }

        // Start indexing in background (don't await)
        ragPipeline.indexDocument(
          config.url,
          docId,
          config.title,
          config.category
        ).then(result => {
          console.log(`Indexing completed for ${docId}: ${result.success ? 'success' : 'failed'}`);
        }).catch(err => {
          console.error(`Indexing failed for ${docId}:`, err);
        });

        results.push({
          docId,
          title: config.title,
          success: true,
          message: "Indexing started",
        });
      } catch (err) {
        results.push({
          docId,
          title: config.title,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    res.json({
      indexedAt: new Date().toISOString(),
      results,
    });
  })
);

export default router;

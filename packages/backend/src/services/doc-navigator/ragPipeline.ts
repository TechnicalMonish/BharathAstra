/**
 * RAG Pipeline
 * Orchestrates the full RAG (Retrieval-Augmented Generation) pipeline.
 * Integrates content fetching, parsing, chunking, embedding, search, and answer generation.
 */

import type {
  FetchedPage,
  ParsedDocument,
  Chunk,
  ProcessedQuery,
  RAGSearchResult,
  RAGRankedResult,
  BuiltContext,
  GeneratedAnswer,
  DocumentIndexRecord,
  IndexResult,
} from "@aws-intel/shared";

import { RAGContentFetcher } from "./ragContentFetcher";
import { ContentCache } from "./contentCache";
import { ContentParser } from "./contentParser";
import { ContentChunker } from "./contentChunker";
import { EmbeddingGenerator } from "./embeddingGenerator";
import { VectorStore } from "./vectorStore";
import { ReRanker } from "./reRanker";
import { ContextBuilder } from "./contextBuilder";
import { RAGAnswerGenerator } from "./answerBuilder";
import * as dynamodb from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";

// --- Configuration ---

interface RAGPipelineConfig {
  maxPagesPerDoc: number;
  cacheTTLHours: number;
  chunkMaxTokens: number;
  chunkOverlapTokens: number;
  searchTopK: number;
  rerankTopK: number;
  contextMaxTokens: number;
}

const DEFAULT_CONFIG: RAGPipelineConfig = {
  maxPagesPerDoc: 50,
  cacheTTLHours: 24,
  chunkMaxTokens: 512,
  chunkOverlapTokens: 50,
  searchTopK: 20,
  rerankTopK: 5,
  contextMaxTokens: 4000,
};

// --- RAG Pipeline Class ---

export class RAGPipeline {
  private config: RAGPipelineConfig;
  private contentFetcher: RAGContentFetcher;
  private contentCache: ContentCache;
  private contentParser: ContentParser;
  private contentChunker: ContentChunker;
  private embeddingGenerator: EmbeddingGenerator;
  private vectorStore: VectorStore;
  private reRanker: ReRanker;
  private contextBuilder: ContextBuilder;
  private answerGenerator: RAGAnswerGenerator;

  constructor(config?: Partial<RAGPipelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.contentFetcher = new RAGContentFetcher({
      maxPagesPerDoc: this.config.maxPagesPerDoc,
    });
    this.contentCache = new ContentCache(this.config.cacheTTLHours);
    this.contentParser = new ContentParser();
    this.contentChunker = new ContentChunker({
      maxTokens: this.config.chunkMaxTokens,
      overlapTokens: this.config.chunkOverlapTokens,
    });
    this.embeddingGenerator = new EmbeddingGenerator();
    this.vectorStore = new VectorStore();
    this.reRanker = new ReRanker({ topK: this.config.rerankTopK });
    this.contextBuilder = new ContextBuilder({
      maxContextTokens: this.config.contextMaxTokens,
    });
    this.answerGenerator = new RAGAnswerGenerator();
  }

  /**
   * Index an AWS documentation URL.
   * Full pipeline: fetch → cache → parse → chunk → embed → store
   */
  async indexDocument(
    docUrl: string,
    docId: string,
    docTitle: string,
    category: string
  ): Promise<IndexResult> {
    const errors: string[] = [];
    let totalChunks = 0;
    let totalSections = 0;

    try {
      // Update index status to 'indexing'
      await this.updateIndexStatus(docId, "indexing", docTitle, category, docUrl);

      // Step 1: Check cache
      let pages: FetchedPage[] = [];
      const cached = await this.contentCache.getIfValid(docId);

      if (cached) {
        pages = this.contentCache.toFetchedPages(cached);
        console.log(`Using cached content for ${docId} (${pages.length} pages)`);
      } else {
        // Step 2: Fetch fresh content
        console.log(`Fetching content from ${docUrl}...`);
        pages = await this.contentFetcher.crawlDocPages(docUrl, {
          maxPages: this.config.maxPagesPerDoc,
        });

        if (pages.length === 0) {
          throw new Error("No pages fetched from URL");
        }

        // Cache the fetched content
        await this.contentCache.store(docId, pages);
        console.log(`Cached ${pages.length} pages for ${docId}`);
      }

      // Step 3: Delete existing chunks (for re-indexing)
      await this.vectorStore.deleteByDocId(docId);

      // Step 4: Parse and chunk each page
      const allChunks: Chunk[] = [];

      for (const page of pages) {
        const parsed = this.contentParser.parseHtml(page.html, page.url);
        totalSections += parsed.sections.length;

        const chunks = this.contentChunker.chunkDocument(parsed, docId);
        allChunks.push(...chunks);
      }

      console.log(`Generated ${allChunks.length} chunks from ${totalSections} sections`);

      // Step 5: Generate embeddings and store
      const batchSize = 10;
      for (let i = 0; i < allChunks.length; i += batchSize) {
        const batch = allChunks.slice(i, i + batchSize);
        
        for (const chunk of batch) {
          try {
            const embedding = await this.embeddingGenerator.generateEmbedding(
              chunk.content
            );
            await this.vectorStore.storeChunk(chunk, embedding, docUrl);
            totalChunks++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            errors.push(`Failed to embed chunk ${chunk.chunkId}: ${msg}`);
          }
        }

        // Progress logging
        if ((i + batchSize) % 50 === 0) {
          console.log(`Indexed ${Math.min(i + batchSize, allChunks.length)}/${allChunks.length} chunks`);
        }
      }

      // Step 6: Update index status
      const status = errors.length === 0 ? "ready" : "failed";
      await this.updateIndexStatus(
        docId,
        status,
        docTitle,
        category,
        docUrl,
        totalChunks,
        totalSections,
        errors
      );

      return {
        docId,
        title: docTitle,
        sections: totalSections,
        indexedAt: new Date(),
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(msg);

      await this.updateIndexStatus(
        docId,
        "failed",
        docTitle,
        category,
        docUrl,
        0,
        0,
        errors
      );

      return {
        docId,
        title: docTitle,
        sections: 0,
        indexedAt: new Date(),
        success: false,
        errors,
      };
    }
  }

  /**
   * Answer a question using RAG.
   * Full pipeline: embed query → search → rerank → build context → generate answer
   */
  async answerQuestion(
    query: ProcessedQuery,
    docIds?: string[]
  ): Promise<GeneratedAnswer> {
    // Step 1: Generate query embedding
    const queryEmbedding = await this.embeddingGenerator.generateEmbedding(
      query.normalizedQuestion
    );

    // Step 2: Semantic search
    const searchResults = await this.vectorStore.semanticSearch(queryEmbedding, {
      docIds,
      topK: this.config.searchTopK,
      minScore: 0.3,
      includeMetadata: true,
    });

    if (searchResults.length === 0) {
      return {
        answer: "I couldn't find relevant information in the selected documentation.",
        confidence: 0,
        citations: [],
        followUpQuestions: ["Try rephrasing your question or selecting different documents."],
      };
    }

    // Step 3: Re-rank results
    const rankedResults = await this.reRanker.rerank(searchResults, query.originalQuestion);

    // Step 4: Build context
    const context = this.contextBuilder.buildContext(rankedResults, query);

    // Step 5: Generate answer
    const answer = await this.answerGenerator.generateAnswer(context, query);

    return answer;
  }

  /**
   * Get document index status.
   */
  async getIndexStatus(docId: string): Promise<DocumentIndexRecord | null> {
    try {
      const items = await dynamodb.query({
        TableName: TABLES.DocumentIndex,
        KeyConditionExpression: "docId = :docId",
        ExpressionAttributeValues: { ":docId": docId },
        Limit: 1,
        ScanIndexForward: false, // Get latest version
      });

      if (items.length === 0) return null;
      return items[0] as unknown as DocumentIndexRecord;
    } catch {
      return null;
    }
  }

  /**
   * Check if a document is indexed and ready.
   */
  async isDocumentReady(docId: string): Promise<boolean> {
    const status = await this.getIndexStatus(docId);
    return status?.status === "ready";
  }

  /**
   * Update document index status.
   */
  private async updateIndexStatus(
    docId: string,
    status: "indexing" | "ready" | "failed" | "stale",
    title: string,
    category: string,
    sourceUrl: string,
    totalChunks: number = 0,
    totalSections: number = 0,
    errors?: string[]
  ): Promise<void> {
    const record: DocumentIndexRecord = {
      docId,
      indexVersion: "v1",
      title,
      category,
      sourceUrl,
      totalChunks,
      totalSections,
      totalTokens: 0, // Could be calculated if needed
      status,
      lastIndexedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      contentHash: "", // Could be computed from content
      errors,
    };

    await dynamodb.put({
      TableName: TABLES.DocumentIndex,
      Item: record,
    });
  }

  /**
   * Get all indexed documents.
   */
  async getIndexedDocuments(): Promise<DocumentIndexRecord[]> {
    try {
      const items = await dynamodb.scan({
        TableName: TABLES.DocumentIndex,
      });
      return items as unknown as DocumentIndexRecord[];
    } catch {
      return [];
    }
  }

  /**
   * Delete a document from the index.
   */
  async deleteDocument(docId: string): Promise<void> {
    // Delete chunks
    await this.vectorStore.deleteByDocId(docId);

    // Delete index record
    await dynamodb.del({
      TableName: TABLES.DocumentIndex,
      Key: { docId, indexVersion: "v1" },
    });

    // Delete cache
    await this.contentCache.delete(docId);
  }

  /**
   * Index a custom uploaded document (text content).
   * Parses, chunks, embeds, and stores in vector store.
   */
  async indexCustomDocument(
    docId: string,
    title: string,
    textContent: string,
    category: string
  ): Promise<IndexResult> {
    const errors: string[] = [];
    let totalChunks = 0;
    let totalSections = 0;

    try {
      // Update index status to 'indexing'
      await this.updateIndexStatus(docId, "indexing", title, category, "custom://upload");

      // Delete existing chunks (for re-indexing)
      await this.vectorStore.deleteByDocId(docId);

      // Parse the text content as if it were HTML (handles plain text too)
      // Use a valid URL format for the parser
      const parsed = this.contentParser.parseHtml(
        `<html><body><h1>${title}</h1><div>${textContent}</div></body></html>`,
        `https://custom.local/${docId}`
      );
      totalSections = parsed.sections.length;

      // Chunk the document
      const chunks = this.contentChunker.chunkDocument(parsed, docId);

      console.log(`Custom doc ${docId}: Generated ${chunks.length} chunks from ${totalSections} sections`);

      // Generate embeddings and store
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        
        for (const chunk of batch) {
          try {
            const embedding = await this.embeddingGenerator.generateEmbedding(
              chunk.content
            );
            await this.vectorStore.storeChunk(chunk, embedding, "custom://upload");
            totalChunks++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            errors.push(`Failed to embed chunk ${chunk.chunkId}: ${msg}`);
          }
        }
      }

      // Update index status
      const status = errors.length === 0 ? "ready" : "failed";
      await this.updateIndexStatus(
        docId,
        status,
        title,
        category,
        "custom://upload",
        totalChunks,
        totalSections,
        errors
      );

      return {
        docId,
        title,
        sections: totalSections,
        indexedAt: new Date(),
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(msg);

      await this.updateIndexStatus(
        docId,
        "failed",
        title,
        category,
        "custom://upload",
        0,
        0,
        errors
      );

      return {
        docId,
        title,
        sections: 0,
        indexedAt: new Date(),
        success: false,
        errors,
      };
    }
  }
}

// Export singleton instance
let pipelineInstance: RAGPipeline | null = null;

export function getRAGPipeline(config?: Partial<RAGPipelineConfig>): RAGPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new RAGPipeline(config);
  }
  return pipelineInstance;
}

export { DEFAULT_CONFIG };

/**
 * Vector Store
 * Stores and retrieves chunk embeddings for semantic search using DynamoDB.
 * Implements cosine similarity search with filtering and scoring.
 */

import type {
  Chunk,
  ChunkMetadata,
  RAGSearchOptions,
  RAGSearchResult,
  DocumentChunkRecord,
  SectionReference,
  CodeBlock,
} from "@aws-intel/shared";

import * as dynamodb from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";

// --- Configuration ---

const DEFAULT_SEARCH_OPTIONS: RAGSearchOptions = {
  topK: 20,
  minScore: 0.5,
  includeMetadata: true,
};

const EMBEDDING_DIMENSION = 1024;

// --- Cosine Similarity ---

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

// --- Chunk Record Conversion ---

function chunkToRecord(
  chunk: Chunk,
  embedding: number[],
  sourceUrl: string
): DocumentChunkRecord {
  return {
    docId: chunk.docId,
    chunkId: chunk.chunkId,
    content: chunk.content,
    embedding,
    sectionId: chunk.sectionId,
    sectionTitle: chunk.metadata.sectionTitle,
    sectionNumber: chunk.metadata.sectionNumber,
    parentSections: chunk.metadata.parentSections,
    hasCode: chunk.metadata.hasCode,
    codeLanguages: chunk.metadata.codeLanguages,
    codeBlocks: [], // Code blocks are embedded in content
    tokenCount: chunk.tokenCount,
    startOffset: chunk.metadata.startOffset,
    endOffset: chunk.metadata.endOffset,
    indexedAt: new Date().toISOString(),
    sourceUrl,
  };
}

function recordToSearchResult(
  record: DocumentChunkRecord,
  score: number
): RAGSearchResult {
  const metadata: ChunkMetadata = {
    sectionTitle: record.sectionTitle,
    sectionNumber: record.sectionNumber,
    parentSections: record.parentSections as SectionReference[],
    hasCode: record.hasCode,
    codeLanguages: record.codeLanguages,
    startOffset: record.startOffset,
    endOffset: record.endOffset,
  };

  return {
    chunkId: record.chunkId,
    docId: record.docId,
    content: record.content,
    score,
    metadata,
  };
}

// --- VectorStore Class ---

export class VectorStore {
  /**
   * Store a single chunk with its embedding.
   */
  async storeChunk(
    chunk: Chunk,
    embedding: number[],
    sourceUrl: string = ""
  ): Promise<void> {
    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`
      );
    }

    const record = chunkToRecord(chunk, embedding, sourceUrl);

    await dynamodb.put({
      TableName: TABLES.DocumentChunks,
      Item: record,
    });
  }

  /**
   * Store multiple chunks with their embeddings in batch.
   */
  async storeBatch(
    items: Array<{ chunk: Chunk; embedding: number[] }>,
    sourceUrl: string = ""
  ): Promise<void> {
    // DynamoDB batch write supports up to 25 items
    const BATCH_SIZE = 25;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const putRequests = batch.map(({ chunk, embedding }) => ({
        PutRequest: {
          Item: chunkToRecord(chunk, embedding, sourceUrl),
        },
      }));

      await dynamodb.batchWrite({
        RequestItems: {
          [TABLES.DocumentChunks]: putRequests,
        },
      });
    }
  }

  /**
   * Perform semantic search using cosine similarity.
   */
  async semanticSearch(
    queryEmbedding: number[],
    options?: Partial<RAGSearchOptions>
  ): Promise<RAGSearchResult[]> {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    if (queryEmbedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${queryEmbedding.length}`
      );
    }

    // Get chunks to search
    let chunks: DocumentChunkRecord[] = [];

    if (opts.docIds && opts.docIds.length > 0) {
      // Search specific documents
      for (const docId of opts.docIds) {
        const docChunks = await this.getChunksByDocId(docId);
        chunks.push(...docChunks);
      }
    } else {
      // Search all documents (scan - use with caution in production)
      chunks = await this.getAllChunks();
    }

    // Calculate similarity scores
    const scored: Array<{ record: DocumentChunkRecord; score: number }> = [];

    for (const chunk of chunks) {
      if (!chunk.embedding || chunk.embedding.length !== EMBEDDING_DIMENSION) {
        continue; // Skip chunks with invalid embeddings
      }

      const score = cosineSimilarity(queryEmbedding, chunk.embedding);

      if (score >= opts.minScore) {
        scored.push({ record: chunk, score });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top K results
    const topK = scored.slice(0, opts.topK);

    return topK.map(({ record, score }) =>
      recordToSearchResult(record, Math.round(score * 1000) / 1000)
    );
  }

  /**
   * Delete all chunks for a document (for re-indexing).
   */
  async deleteByDocId(docId: string): Promise<void> {
    const chunks = await this.getChunksByDocId(docId);

    // DynamoDB batch write supports up to 25 items
    const BATCH_SIZE = 25;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const deleteRequests = batch.map((chunk) => ({
        DeleteRequest: {
          Key: {
            docId: chunk.docId,
            chunkId: chunk.chunkId,
          },
        },
      }));

      await dynamodb.batchWrite({
        RequestItems: {
          [TABLES.DocumentChunks]: deleteRequests,
        },
      });
    }
  }

  /**
   * Get all chunks for a specific document.
   */
  async getChunksByDocId(docId: string): Promise<DocumentChunkRecord[]> {
    const items = await dynamodb.query({
      TableName: TABLES.DocumentChunks,
      KeyConditionExpression: "docId = :docId",
      ExpressionAttributeValues: { ":docId": docId },
    });

    return items as unknown as DocumentChunkRecord[];
  }

  /**
   * Get a specific chunk by ID.
   */
  async getChunk(docId: string, chunkId: string): Promise<DocumentChunkRecord | null> {
    const item = await dynamodb.get({
      TableName: TABLES.DocumentChunks,
      Key: { docId, chunkId },
    });

    return (item as unknown as DocumentChunkRecord) || null;
  }

  /**
   * Get all chunks (use with caution - for small datasets only).
   */
  private async getAllChunks(): Promise<DocumentChunkRecord[]> {
    const items = await dynamodb.scan({
      TableName: TABLES.DocumentChunks,
    });

    return items as unknown as DocumentChunkRecord[];
  }

  /**
   * Get chunk count for a document.
   */
  async getChunkCount(docId: string): Promise<number> {
    const chunks = await this.getChunksByDocId(docId);
    return chunks.length;
  }

  /**
   * Check if a document has been indexed.
   */
  async isDocumentIndexed(docId: string): Promise<boolean> {
    const count = await this.getChunkCount(docId);
    return count > 0;
  }
}

// Export utilities for testing
export {
  cosineSimilarity,
  chunkToRecord,
  recordToSearchResult,
  DEFAULT_SEARCH_OPTIONS,
  EMBEDDING_DIMENSION,
};

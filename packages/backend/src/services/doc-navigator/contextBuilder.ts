/**
 * Context Builder
 * Assembles retrieved chunks into an optimal context window for the LLM.
 * Respects token limits and includes source attribution metadata.
 */

import type {
  RAGRankedResult,
  BuiltContext,
  ContextConfig,
  ProcessedQuery,
} from "@aws-intel/shared";

// --- Configuration ---

const DEFAULT_CONFIG: ContextConfig = {
  maxContextTokens: 4000,
  chunkSeparator: "\n\n---\n\n",
  includeMetadata: true,
};

// --- Token Estimation ---

/**
 * Estimate token count for text.
 * Uses a simple heuristic: ~4 characters per token for English text.
 * For production, use tiktoken for accurate counting.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

// --- Content Deduplication ---

/**
 * Find overlapping content between two strings.
 * Returns the length of the overlap at the end of str1 and start of str2.
 */
function findOverlap(str1: string, str2: string): number {
  const maxOverlap = Math.min(str1.length, str2.length, 200);
  
  for (let len = maxOverlap; len > 20; len--) {
    const end1 = str1.slice(-len);
    const start2 = str2.slice(0, len);
    
    if (end1 === start2) {
      return len;
    }
  }
  
  return 0;
}

/**
 * Remove overlapping content from adjacent chunks.
 */
function deduplicateChunks(chunks: RAGRankedResult[]): RAGRankedResult[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const deduplicated: RAGRankedResult[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = deduplicated[deduplicated.length - 1];
    const currentChunk = chunks[i];

    // Check if chunks are from the same document and adjacent sections
    if (
      prevChunk.docId === currentChunk.docId &&
      prevChunk.metadata.sectionTitle === currentChunk.metadata.sectionTitle
    ) {
      const overlap = findOverlap(prevChunk.content, currentChunk.content);
      
      if (overlap > 0) {
        // Remove overlapping content from current chunk
        deduplicated.push({
          ...currentChunk,
          content: currentChunk.content.slice(overlap),
        });
        continue;
      }
    }

    deduplicated.push(currentChunk);
  }

  return deduplicated;
}

// --- Chunk Formatting ---

/**
 * Format a chunk for inclusion in the context.
 */
function formatChunkForContext(
  chunk: RAGRankedResult,
  includeMetadata: boolean
): string {
  let formatted = "";

  if (includeMetadata) {
    const sectionPath = chunk.metadata.parentSections
      .map((p) => p.title)
      .concat([chunk.metadata.sectionTitle])
      .join(" > ");

    formatted += `[Source: ${sectionPath}]\n\n`;
  }

  formatted += chunk.content;

  return formatted;
}

// --- ContextBuilder Class ---

export class ContextBuilder {
  private config: ContextConfig;

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build context from ranked chunks.
   */
  buildContext(
    chunks: RAGRankedResult[],
    query?: ProcessedQuery
  ): BuiltContext {
    if (chunks.length === 0) {
      return {
        contextString: "",
        includedChunks: [],
        totalTokens: 0,
        truncated: false,
      };
    }

    // Deduplicate overlapping content
    const deduplicated = deduplicateChunks(chunks);

    // Build context string respecting token limit
    const includedChunks: RAGRankedResult[] = [];
    const contextParts: string[] = [];
    let totalTokens = 0;
    let truncated = false;

    // Add query context if provided
    if (query) {
      const queryContext = `Question: ${query.normalizedQuestion}\n\n`;
      const queryTokens = estimateTokens(queryContext);
      
      if (queryTokens < this.config.maxContextTokens) {
        contextParts.push(queryContext);
        totalTokens += queryTokens;
      }
    }

    // Add separator tokens to budget
    const separatorTokens = estimateTokens(this.config.chunkSeparator);

    for (const chunk of deduplicated) {
      const formattedChunk = formatChunkForContext(
        chunk,
        this.config.includeMetadata
      );
      const chunkTokens = estimateTokens(formattedChunk);

      // Check if adding this chunk would exceed the limit
      const additionalTokens =
        contextParts.length > 0
          ? chunkTokens + separatorTokens
          : chunkTokens;

      if (totalTokens + additionalTokens > this.config.maxContextTokens) {
        truncated = true;
        break;
      }

      contextParts.push(formattedChunk);
      includedChunks.push(chunk);
      totalTokens += additionalTokens;
    }

    // Join context parts with separator
    const contextString = contextParts.join(this.config.chunkSeparator);

    return {
      contextString,
      includedChunks,
      totalTokens,
      truncated,
    };
  }

  /**
   * Format a single chunk for context.
   */
  formatChunkForContext(chunk: RAGRankedResult): string {
    return formatChunkForContext(chunk, this.config.includeMetadata);
  }

  /**
   * Estimate tokens for a text string.
   */
  estimateTokens(text: string): number {
    return estimateTokens(text);
  }

  /**
   * Get current configuration.
   */
  getConfig(): ContextConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export utilities for testing
export {
  estimateTokens,
  findOverlap,
  deduplicateChunks,
  formatChunkForContext,
  DEFAULT_CONFIG,
};

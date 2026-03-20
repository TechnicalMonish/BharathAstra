/**
 * Re-Ranker
 * Re-ranks retrieved chunks using cross-encoder scoring for improved relevance.
 * Combines semantic similarity and rerank scores with configurable weights.
 */

import type {
  RAGSearchResult,
  RAGRankedResult,
  RerankConfig,
} from "@aws-intel/shared";

// --- Configuration ---

const DEFAULT_CONFIG: RerankConfig = {
  modelId: "anthropic.claude-3-haiku-20240307-v1:0",
  topK: 5,
  weightSemantic: 0.4,
  weightRerank: 0.6,
};

// --- Bedrock Client ---

let bedrockClient: any = null;

async function getBedrockClient() {
  if (!bedrockClient) {
    const { BedrockRuntimeClient } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return bedrockClient;
}

// --- Cross-Encoder Scoring ---

/**
 * Compute cross-encoder relevance score using Bedrock LLM.
 * Returns a score between 0 and 1 indicating how relevant the chunk is to the query.
 */
async function computeCrossEncoderScore(
  chunk: string,
  query: string,
  modelId: string,
  timeoutMs: number = 3000
): Promise<number> {
  try {
    const client = await getBedrockClient();
    const { InvokeModelCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );

    const prompt = `You are a relevance scoring system. Given a query and a text passage, rate how relevant the passage is to answering the query.

Query: ${query}

Passage: ${chunk.slice(0, 1500)}

Rate the relevance on a scale of 0 to 10, where:
- 0 = completely irrelevant
- 5 = somewhat relevant
- 10 = highly relevant and directly answers the query

Respond with ONLY a single number between 0 and 10.`;

    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 10,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const bedrockPromise = client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      })
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Rerank timeout")), timeoutMs)
    );

    const response = await Promise.race([bedrockPromise, timeoutPromise]);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    // Extract the score from the response
    const text = result.content?.[0]?.text || "5";
    const score = parseFloat(text.trim());

    if (isNaN(score)) return 0.5;
    return Math.max(0, Math.min(1, score / 10));
  } catch (error) {
    // Fallback: use a simple keyword-based scoring
    return computeFallbackScore(chunk, query);
  }
}

/**
 * Fallback scoring when Bedrock is unavailable.
 * Uses keyword overlap and position-based scoring.
 */
function computeFallbackScore(chunk: string, query: string): number {
  const chunkLower = chunk.toLowerCase();
  const queryLower = query.toLowerCase();

  // Extract query terms
  const queryTerms = queryLower
    .split(/\s+/)
    .filter((term) => term.length > 2);

  if (queryTerms.length === 0) return 0.5;

  let matchCount = 0;
  let positionBonus = 0;

  for (const term of queryTerms) {
    if (chunkLower.includes(term)) {
      matchCount++;
      // Bonus for terms appearing early in the chunk
      const position = chunkLower.indexOf(term);
      if (position < 200) positionBonus += 0.1;
    }
  }

  const overlapScore = matchCount / queryTerms.length;
  const finalScore = Math.min(1, overlapScore * 0.8 + positionBonus);

  return Math.round(finalScore * 1000) / 1000;
}

// --- ReRanker Class ---

export class ReRanker {
  private config: RerankConfig;

  constructor(config?: Partial<RerankConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Re-rank search results using cross-encoder scoring.
   */
  async rerank(
    chunks: RAGSearchResult[],
    query: string
  ): Promise<RAGRankedResult[]> {
    if (chunks.length === 0) {
      return [];
    }

    // Compute rerank scores for each chunk
    const rankedResults: RAGRankedResult[] = [];

    // Process chunks in parallel with concurrency limit
    const CONCURRENCY = 3;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const scores = await Promise.all(
        batch.map((chunk) =>
          computeCrossEncoderScore(
            chunk.content,
            query,
            this.config.modelId
          )
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const rerankScore = scores[j];
        const combinedScore = this.computeCombinedScore(
          chunk.score,
          rerankScore
        );

        rankedResults.push({
          ...chunk,
          rerankScore,
          combinedScore,
        });
      }
    }

    // Sort by combined score descending
    rankedResults.sort((a, b) => b.combinedScore - a.combinedScore);

    // Return top K results
    return rankedResults.slice(0, this.config.topK);
  }

  /**
   * Compute combined score from semantic and rerank scores.
   */
  private computeCombinedScore(
    semanticScore: number,
    rerankScore: number
  ): number {
    const combined =
      semanticScore * this.config.weightSemantic +
      rerankScore * this.config.weightRerank;
    return Math.round(combined * 1000) / 1000;
  }

  /**
   * Compute cross-encoder score for a single chunk-query pair.
   */
  async computeCrossEncoderScore(
    chunk: string,
    query: string
  ): Promise<number> {
    return computeCrossEncoderScore(chunk, query, this.config.modelId);
  }

  /**
   * Get current configuration.
   */
  getConfig(): RerankConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<RerankConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export utilities for testing
export {
  computeCrossEncoderScore,
  computeFallbackScore,
  DEFAULT_CONFIG,
};

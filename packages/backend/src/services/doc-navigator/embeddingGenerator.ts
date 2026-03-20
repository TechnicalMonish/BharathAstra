/**
 * Embedding Generator
 * Generates vector embeddings for chunks and queries using Amazon Bedrock Titan Embed v2.
 * Supports batch embedding with retry logic and exponential backoff.
 */

import type { EmbeddingConfig } from "@aws-intel/shared";

// --- Configuration ---

const DEFAULT_CONFIG: EmbeddingConfig = {
  modelId: "amazon.titan-embed-text-v2:0",
  dimension: 1024,
  batchSize: 25,
  maxRetries: 3,
};

const EMBEDDING_TIMEOUT_MS = 5000;
const BASE_DELAY_MS = 500;

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

// --- Mock Embedding (Fallback) ---

/**
 * Generate a deterministic mock embedding for testing/fallback.
 * Uses a hash-based approach to ensure same input produces same output.
 */
function generateMockEmbedding(text: string, dimension: number): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }

  const embedding: number[] = [];
  for (let i = 0; i < dimension; i++) {
    hash = (hash * 1103515245 + 12345) | 0;
    embedding.push(((hash >>> 16) & 0x7fff) / 0x7fff);
  }

  // Normalize to unit length
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map((val) => val / norm);
}

// --- Retry Logic ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addJitter(delay: number): number {
  // Add up to 25% jitter
  return delay + Math.random() * delay * 0.25;
}

// --- EmbeddingGenerator Class ---

export class EmbeddingGenerator {
  private config: EmbeddingConfig;
  private useMock: boolean = false;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate embedding for a single text.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.useMock) {
      return generateMockEmbedding(text, this.config.dimension);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const embedding = await this.callBedrockEmbed(text);
        return embedding;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a rate limit error
        const isRateLimit =
          lastError.message.includes("ThrottlingException") ||
          lastError.message.includes("rate limit");

        if (isRateLimit && attempt < this.config.maxRetries) {
          const delay = addJitter(BASE_DELAY_MS * Math.pow(2, attempt));
          await sleep(delay);
          continue;
        }

        // For other errors or final attempt, break
        if (attempt === this.config.maxRetries) {
          break;
        }
      }
    }

    // Fallback to mock embedding
    console.warn(
      `Embedding generation failed after ${this.config.maxRetries} retries, using mock embedding`
    );
    this.useMock = true;
    return generateMockEmbedding(text, this.config.dimension);
  }

  /**
   * Generate embeddings for multiple texts in batch.
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);

      // Generate embeddings for batch (in parallel with concurrency limit)
      const batchEmbeddings = await Promise.all(
        batch.map((text) => this.generateEmbedding(text))
      );

      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Get the embedding dimension.
   */
  getEmbeddingDimension(): number {
    return this.config.dimension;
  }

  /**
   * Call Bedrock Titan Embed API.
   */
  private async callBedrockEmbed(text: string): Promise<number[]> {
    const client = await getBedrockClient();
    const { InvokeModelCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );

    // Truncate text to max input length (8000 chars for Titan)
    const truncatedText = text.slice(0, 8000);

    const body = JSON.stringify({
      inputText: truncatedText,
      dimensions: this.config.dimension,
      normalize: true,
    });

    const bedrockPromise = client.send(
      new InvokeModelCommand({
        modelId: this.config.modelId,
        contentType: "application/json",
        accept: "application/json",
        body,
      })
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Embedding timeout")), EMBEDDING_TIMEOUT_MS)
    );

    const response = await Promise.race([bedrockPromise, timeoutPromise]);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    const embedding = result.embedding as number[];

    if (!embedding || embedding.length !== this.config.dimension) {
      throw new Error(
        `Invalid embedding dimension: expected ${this.config.dimension}, got ${embedding?.length}`
      );
    }

    return embedding;
  }

  /**
   * Enable mock mode (for testing).
   */
  enableMockMode(): void {
    this.useMock = true;
  }

  /**
   * Disable mock mode.
   */
  disableMockMode(): void {
    this.useMock = false;
  }

  /**
   * Check if using mock mode.
   */
  isMockMode(): boolean {
    return this.useMock;
  }

  /**
   * Get current configuration.
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<EmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export utilities for testing
export {
  generateMockEmbedding,
  sleep,
  addJitter,
  DEFAULT_CONFIG,
  EMBEDDING_TIMEOUT_MS,
};

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  DocumentSearchResponse,
  DocumentSearchResult,
  SummarizeResponse,
} from "../types";
import { DocumentSection } from "../types/models";
import { validateQuery } from "../utils/validation";
import { ServiceUnavailableError, ProcessingError } from "../utils/errors";

const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE || "Documents";
const EMBEDDING_MODEL_ID =
  process.env.EMBEDDING_MODEL_ID || "amazon.titan-embed-text-v1";
const LLM_MODEL_ID =
  process.env.LLM_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
const RELEVANCE_THRESHOLD = 0.3;

export interface ISearchService {
  searchDocument(
    documentId: string,
    query: string,
  ): Promise<DocumentSearchResponse>;
  summarizeDocument(
    documentId: string,
    sectionId?: string,
  ): Promise<SummarizeResponse>;
}

export class SearchService implements ISearchService {
  private bedrockClient: BedrockRuntimeClient;
  private docClient: DynamoDBDocumentClient;

  constructor(
    bedrockClient?: BedrockRuntimeClient,
    dynamoClient?: DynamoDBClient,
  ) {
    this.bedrockClient = bedrockClient || new BedrockRuntimeClient({});
    const ddbClient = dynamoClient || new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(ddbClient);
  }

  async searchDocument(
    documentId: string,
    query: string,
  ): Promise<DocumentSearchResponse> {
    validateQuery(query);

    // Retrieve document sections from DynamoDB
    const sections = await this.getDocumentSections(documentId);

    // Generate query embedding via Bedrock Titan Embeddings
    const queryEmbedding = await this.generateEmbedding(query);

    // Compute cosine similarity against section embeddings and rank
    const scoredResults = sections
      .filter((section) => section.embedding && section.embedding.length > 0)
      .map((section) => ({
        section,
        score: cosineSimilarity(queryEmbedding, section.embedding),
      }))
      .filter((item) => item.score >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    // If no results from embeddings, fall back to text-based search
    if (scoredResults.length === 0) {
      const textResults = textBasedSearch(sections, query);
      if (textResults.length > 0) {
        return { results: textResults };
      }

      // No results at all — suggest related topics
      const suggestedTopics = await this.suggestRelatedTopics(sections, query);
      return { results: [], suggestedTopics };
    }

    // Build response with highlighted text
    const results: DocumentSearchResult[] = scoredResults.map(
      ({ section, score }) => ({
        sectionHeading: section.heading,
        pageNumber: section.pageNumber,
        text: section.text,
        highlightedText: highlightTerms(section.text, query),
        relevanceScore: Math.round(score * 1000) / 1000,
      }),
    );

    return { results };
  }

  async summarizeDocument(
    documentId: string,
    sectionId?: string,
  ): Promise<SummarizeResponse> {
    const sections = await this.getDocumentSections(documentId);

    if (sections.length === 0) {
      throw new ProcessingError("Document has no content to summarize.");
    }

    let textToSummarize: string;
    let references: { sectionHeading: string; pageNumber: number }[];
    let maxWords: number;

    if (sectionId) {
      // Summarize a specific section
      const section = sections.find((s) => s.sectionId === sectionId);
      if (!section) {
        throw new Error(
          `Section ${sectionId} not found in document ${documentId}`,
        );
      }
      textToSummarize = section.text;
      references = [
        { sectionHeading: section.heading, pageNumber: section.pageNumber },
      ];
      maxWords = 200;
    } else {
      // Summarize the full document
      textToSummarize = sections
        .map((s) => `## ${s.heading}\n${s.text}`)
        .join("\n\n");
      references = sections.map((s) => ({
        sectionHeading: s.heading,
        pageNumber: s.pageNumber,
      }));
      maxWords = 500;
    }

    const summary = await this.generateSummary(textToSummarize, maxWords);
    const wordCount = summary.split(/\s+/).filter((w) => w.length > 0).length;

    return { summary, references, wordCount };
  }

  private async getDocumentSections(
    documentId: string,
  ): Promise<DocumentSection[]> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: DOCUMENTS_TABLE,
          Key: { documentId },
        }),
      );

      if (!result.Item) {
        throw new Error(`Document ${documentId} not found`);
      }

      return (result.Item.sections as DocumentSection[]) || [];
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        throw error;
      }
      throw new ServiceUnavailableError(
        "Service temporarily unavailable. Please retry in a few moments.",
      );
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.bedrockClient.send(
        new InvokeModelCommand({
          modelId: EMBEDDING_MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({ inputText: text }),
        }),
      );

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.embedding;
    } catch {
      throw new ServiceUnavailableError(
        "Service temporarily unavailable. Please retry in a few moments.",
      );
    }
  }

  private async generateSummary(
    text: string,
    maxWords: number,
  ): Promise<string> {
    try {
      const prompt = `Summarize the following AWS documentation content in at most ${maxWords} words. Focus on key topics, services mentioned, and main takeaways. Return ONLY the summary text, no preamble or labels.

Content:
${text}`;

      const response = await this.bedrockClient.send(
        new InvokeModelCommand({
          modelId: LLM_MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        }),
      );

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const summary = responseBody.content?.[0]?.text || "";

      if (!summary) {
        throw new ProcessingError(
          "Unable to process your request. Please try again.",
        );
      }

      // Enforce word limit by truncating if the model exceeds it
      const words = summary.split(/\s+/).filter((w: string) => w.length > 0);
      if (words.length > maxWords) {
        return words.slice(0, maxWords).join(" ");
      }

      return summary;
    } catch (error) {
      if (error instanceof ProcessingError) {
        throw error;
      }
      throw new ServiceUnavailableError(
        "Service temporarily unavailable. Please retry in a few moments.",
      );
    }
  }

  private async suggestRelatedTopics(
    sections: DocumentSection[],
    query: string,
  ): Promise<string[]> {
    try {
      const sectionHeadings = sections
        .map((s) => s.heading)
        .filter((h) => h && h !== "Document")
        .slice(0, 20);

      const sectionSnippets = sections
        .map((s) => s.text.substring(0, 200))
        .slice(0, 10)
        .join("\n");

      const prompt = `Given a document with these section headings: ${sectionHeadings.join(", ")}

And content snippets:
${sectionSnippets}

The user searched for "${query}" but no matching sections were found.

Suggest up to 5 related topics from this document that the user might be interested in. Return ONLY a JSON array of strings, no other text.

Example: ["topic 1", "topic 2", "topic 3"]`;

      const response = await this.bedrockClient.send(
        new InvokeModelCommand({
          modelId: LLM_MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 256,
            messages: [{ role: "user", content: prompt }],
          }),
        }),
      );

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const content = responseBody.content?.[0]?.text || "[]";

      // Extract JSON array from response
      const match = content.match(/\[[\s\S]*?\]/);
      if (match) {
        const topics = JSON.parse(match[0]);
        if (Array.isArray(topics)) {
          return topics
            .filter((t: unknown) => typeof t === "string")
            .slice(0, 5);
        }
      }
      return [];
    } catch {
      // If topic suggestion fails, return empty array rather than failing the search
      return [];
    }
  }
}

/**
 * Computes cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Highlights query terms in text by wrapping them with <mark> tags.
 */
export function highlightTerms(text: string, query: string): string {
  const terms = query
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (terms.length === 0) return text;

  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  return text.replace(pattern, "<mark>$1</mark>");
}

/**
 * Performs text-based search as a fallback when embeddings are unavailable.
 * Matches sections containing any query terms, scored by term frequency.
 */
export function textBasedSearch(
  sections: DocumentSection[],
  query: string,
): DocumentSearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) return [];

  const results: DocumentSearchResult[] = [];

  for (const section of sections) {
    const lowerText = section.text.toLowerCase();
    let matchCount = 0;

    for (const term of terms) {
      if (lowerText.includes(term)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const relevanceScore =
        Math.round((matchCount / terms.length) * 1000) / 1000;
      results.push({
        sectionHeading: section.heading,
        pageNumber: section.pageNumber,
        text: section.text,
        highlightedText: highlightTerms(section.text, query),
        relevanceScore,
      });
    }
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

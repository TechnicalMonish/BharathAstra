// Documentation Navigator types

import {
  AnswerType,
  DocumentFormat,
  DocumentType,
  QueryType,
  RelationType,
} from "./enums";

// === Query Processing ===

export interface ProcessedQuery {
  originalQuestion: string;
  normalizedQuestion: string;
  awsServices: string[];
  concepts: string[];
  queryType: QueryType;
  keywords: string[];
}

// === Document Indexing ===

export interface UploadedFile {
  name: string;
  format: DocumentFormat;
  content: Buffer;
  category?: string;
}

export interface IndexResult {
  docId: string;
  title: string;
  sections: number;
  indexedAt: Date;
  success: boolean;
  errors?: string[];
}

export interface SyncResult {
  docsUpdated: number;
  docsAdded: number;
  docsRemoved: number;
  syncedAt: Date;
}

export interface SearchMatch {
  docId: string;
  docTitle: string;
  sectionId: string;
  sectionTitle: string;
  content: string;
  relevanceScore: number;
}

// === Section Extraction ===

export interface SectionReference {
  sectionNumber: string;
  title: string;
}

export interface ExtractedSection {
  docId: string;
  docTitle: string;
  sectionId: string;
  sectionNumber: string;
  sectionTitle: string;
  content: string;
  relevanceScore: number;
  parentSections: SectionReference[];
}

export interface Highlight {
  text: string;
  startIndex: number;
  endIndex: number;
  relevanceScore: number;
}

export interface HighlightedSection {
  section: ExtractedSection;
  highlights: Highlight[];
}

// === Answer Building ===

export interface CodeExample {
  language: string;
  code: string;
  description: string;
  sourceSection: SectionReference;
  configurableParams: Parameter[];
}

export interface Parameter {
  name: string;
  description: string;
  defaultValue?: string;
}

export interface RelatedSection {
  sectionId: string;
  title: string;
  description: string;
  relationshipType: RelationType;
}

export interface Prerequisite {
  concept: string;
  description: string;
  learnMoreSection?: SectionReference;
}

export interface Answer {
  directAnswer?: string;
  answerType: AnswerType;
  sections: HighlightedSection[];
  codeExamples: CodeExample[];
  relatedSections: RelatedSection[];
  prerequisites: Prerequisite[];
}

// === Document Management ===

export interface DocumentFilter {
  category?: string;
  searchTerm?: string;
  type?: DocumentType;
}

export interface DocumentInfo {
  docId: string;
  title: string;
  category: string;
  type: DocumentType;
  sections: number;
  lastUpdated: Date;
  selected: boolean;
}

// === Question History ===

export interface HistoryEntry {
  questionId: string;
  question: string;
  timestamp: Date;
  answerType: AnswerType;
  docsQueried: string[];
}


// === RAG Pipeline Types ===

// Content Fetching
export interface FetchedPage {
  url: string;
  html: string;
  title: string;
  fetchedAt: Date;
  statusCode: number;
}

// Content Parsing
export interface ParsedDocument {
  title: string;
  url: string;
  sections: ParsedSection[];
  codeBlocks: CodeBlock[];
  metadata: DocumentMetadata;
}

export interface ParsedSection {
  id: string;
  title: string;
  content: string;
  level: number;
  parentId?: string;
  codeBlocks: CodeBlock[];
}

export interface CodeBlock {
  language: string;
  code: string;
  context: string;
}

export interface DocumentMetadata {
  lastUpdated?: string;
  service: string;
  category: string;
}

// Content Chunking
export interface Chunk {
  chunkId: string;
  docId: string;
  sectionId: string;
  content: string;
  tokenCount: number;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  sectionTitle: string;
  sectionNumber: string;
  parentSections: SectionReference[];
  hasCode: boolean;
  codeLanguages: string[];
  startOffset: number;
  endOffset: number;
}

export interface ChunkingConfig {
  maxTokens: number;        // Default: 512
  overlapTokens: number;    // Default: 50
  minChunkTokens: number;   // Default: 100
  preserveCodeBlocks: boolean;
}

// Vector Search
export interface RAGSearchOptions {
  docIds?: string[];
  topK: number;             // Default: 20
  minScore: number;         // Default: 0.5
  includeMetadata: boolean;
}

export interface RAGSearchResult {
  chunkId: string;
  docId: string;
  content: string;
  score: number;
  metadata: ChunkMetadata;
}

export interface RAGRankedResult extends RAGSearchResult {
  rerankScore: number;
  combinedScore: number;
}

// Context Building
export interface BuiltContext {
  contextString: string;
  includedChunks: RAGRankedResult[];
  totalTokens: number;
  truncated: boolean;
}

export interface ContextConfig {
  maxContextTokens: number;  // Default: 4000
  chunkSeparator: string;    // Default: "\n\n---\n\n"
  includeMetadata: boolean;
}

// Answer Generation
export interface GeneratedAnswer {
  answer: string;
  confidence: number;
  citations: Citation[];
  followUpQuestions: string[];
}

export interface Citation {
  chunkId: string;
  docTitle: string;
  sectionTitle: string;
  excerpt: string;
}

// DynamoDB Records
export interface DocumentChunkRecord {
  docId: string;              // Partition Key
  chunkId: string;            // Sort Key
  content: string;
  embedding: number[];        // 1024 dimensions
  sectionId: string;
  sectionTitle: string;
  sectionNumber: string;
  parentSections: SectionReference[];
  hasCode: boolean;
  codeLanguages: string[];
  codeBlocks: CodeBlock[];
  tokenCount: number;
  startOffset: number;
  endOffset: number;
  indexedAt: string;
  sourceUrl: string;
}

export interface DocumentIndexRecord {
  docId: string;              // Partition Key
  indexVersion: string;       // Sort Key
  title: string;
  category: string;
  sourceUrl: string;
  totalChunks: number;
  totalSections: number;
  totalTokens: number;
  status: 'indexing' | 'ready' | 'failed' | 'stale';
  lastIndexedAt: string;
  lastCheckedAt: string;
  contentHash: string;
  errors?: string[];
}

// Content Cache
export interface RAGCachedContent {
  docId: string;
  sourceUrl: string;
  pages: RAGCachedPage[];
  fetchedAt: string;
  expiresAt: string;
  contentHash: string;
  totalPages: number;
}

export interface RAGCachedPage {
  url: string;
  html: string;
  title: string;
  fetchedAt: string;
}

// Embedding Configuration
export interface EmbeddingConfig {
  modelId: string;          // Default: "amazon.titan-embed-text-v2:0"
  dimension: number;        // Default: 1024
  batchSize: number;        // Default: 25
  maxRetries: number;       // Default: 3
}

// Re-ranking Configuration
export interface RerankConfig {
  modelId: string;          // Bedrock model for reranking
  topK: number;             // Number of results to return after reranking
  weightSemantic: number;   // Weight for semantic score (default: 0.4)
  weightRerank: number;     // Weight for rerank score (default: 0.6)
}

// RAG Answer Generator Configuration
export interface RAGGeneratorConfig {
  modelId: string;           // Default: "anthropic.claude-3-haiku-20240307-v1:0"
  maxTokens: number;         // Default: 1024
  temperature: number;       // Default: 0.3
  systemPrompt: string;
}

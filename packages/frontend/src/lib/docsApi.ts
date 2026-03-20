/**
 * Documentation Navigator API Service
 * Provides type-safe API calls for the Documentation Navigator tool
 * Requirements: 5.5, 11.5, 27.2, 27.3
 */

import { api, ApiError } from './api';
import type {
  Answer,
  DocumentInfo,
  HistoryEntry,
  DocumentFilter,
  IndexResult,
} from '@shared/types/doc-navigator';
import type { DocumentFormat } from '@shared/types/enums';

// === Request Types ===

export interface QueryRequest {
  question: string;
  docIds?: string[];
}

export interface SelectDocsRequest {
  docIds: string[];
}

export interface UploadDocRequest {
  name: string;
  format: DocumentFormat;
  content: string; // base64 encoded
  category?: string;
}

// === Response Types ===

export interface QueryResponse {
  questionId: string;
  question: string;
  answer: Answer;
  responseTimeMs: number;
  withinTarget: boolean;
}

export interface ListDocsResponse {
  documents: DocumentInfo[];
}

export interface SelectDocsResponse {
  selected: string[];
}

export interface UploadDocResponse {
  document: DocumentInfo;
}

export interface DeleteDocResponse {
  deleted: string;
}

export interface HistoryResponse {
  history: HistoryEntry[];
}

export interface HistoryAnswerResponse {
  questionId: string;
  answer: Answer;
}

// === Retry Configuration ===

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: ApiError | Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as ApiError | Error;
      
      // Don't retry on client errors (4xx)
      if ((error as ApiError).status && (error as ApiError).status! >= 400 && (error as ApiError).status! < 500) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === retries) {
        break;
      }
      
      // Exponential backoff
      await delay(delayMs * Math.pow(2, attempt));
    }
  }
  
  throw lastError;
}

/**
 * Format API error into user-friendly message
 */
export function formatDocsError(error: ApiError | Error): string {
  if ('code' in error) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Unable to connect to the server. Please check your internet connection.';
      case 'BadRequest':
        return error.message || 'Invalid request. Please check your input.';
      case 'NotFound':
        return 'The requested document or question was not found.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
  return error.message || 'An unexpected error occurred.';
}

// === API Functions ===

/**
 * Submit a natural language question to query documentation
 * Implements 2-second response time target (Requirement 5.5)
 */
export async function queryDocs(
  question: string,
  docIds?: string[]
): Promise<QueryResponse> {
  return withRetry(() =>
    api.post<QueryResponse>('/docs/query', { question, docIds })
  );
}

/**
 * List available documents with optional filters
 */
export async function listDocs(
  filter?: DocumentFilter
): Promise<ListDocsResponse> {
  return withRetry(() =>
    api.get<ListDocsResponse>('/docs/list', { params: filter })
  );
}

/**
 * Select documents for querying
 */
export async function selectDocs(
  docIds: string[]
): Promise<SelectDocsResponse> {
  return withRetry(() =>
    api.post<SelectDocsResponse>('/docs/select', { docIds })
  );
}

/**
 * Upload custom documentation
 * Supports PDF, HTML, Markdown, and plain text formats
 */
export async function uploadDoc(
  file: File,
  name: string,
  category?: string,
  onProgress?: (progress: number) => void
): Promise<UploadDocResponse> {
  // Convert file to base64
  const content = await fileToBase64(file);
  const format = getDocumentFormat(file.name);
  
  // For upload, we use a custom implementation with progress tracking
  if (onProgress) {
    return api.upload<UploadDocResponse>('/docs/upload', file, onProgress);
  }
  
  return withRetry(() =>
    api.post<UploadDocResponse>('/docs/upload', {
      name,
      format,
      content,
      category,
    })
  );
}

/**
 * Delete a custom uploaded document
 */
export async function deleteDoc(docId: string): Promise<DeleteDocResponse> {
  return withRetry(() =>
    api.delete<DeleteDocResponse>(`/docs/${docId}`)
  );
}

/**
 * Get question history
 */
export async function getHistory(limit?: number): Promise<HistoryResponse> {
  return withRetry(() =>
    api.get<HistoryResponse>('/docs/history', { params: limit ? { limit } : undefined })
  );
}

/**
 * Get a previous answer from history
 */
export async function getHistoryAnswer(
  questionId: string
): Promise<HistoryAnswerResponse> {
  return withRetry(() =>
    api.get<HistoryAnswerResponse>(`/docs/history/${questionId}`)
  );
}

// === Helper Functions ===

/**
 * Convert a File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Determine document format from file extension
 */
function getDocumentFormat(filename: string): DocumentFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'pdf' as DocumentFormat;
    case 'html':
    case 'htm':
      return 'html' as DocumentFormat;
    case 'md':
    case 'markdown':
      return 'markdown' as DocumentFormat;
    case 'txt':
    default:
      return 'text' as DocumentFormat;
  }
}

// === RAG API Types ===

export interface RAGQueryResponse {
  question: string;
  answer: string;
  confidence: number;
  citations: Array<{
    chunkId: string;
    docId: string;
    sectionTitle: string;
    text: string;
    score: number;
  }>;
  followUpQuestions: string[];
  responseTimeMs: number;
}

export interface RAGIndexRequest {
  docUrl: string;
  docId: string;
  title: string;
  category?: string;
}

export interface RAGIndexResponse {
  docId: string;
  title: string;
  sections: number;
  indexedAt: string;
  success: boolean;
  errors?: string[];
}

export interface RAGDocumentStatus {
  docId: string;
  title: string;
  category: string;
  status: 'pending' | 'indexing' | 'ready' | 'failed' | 'stale';
  totalChunks: number;
  totalSections: number;
  lastIndexedAt: string;
  errors?: string[];
}

export interface RAGIndexedDocsResponse {
  documents: Array<{
    docId: string;
    title: string;
    category: string;
    status: string;
    totalChunks: number;
    lastIndexedAt: string;
  }>;
}

// === RAG API Functions ===

/**
 * Submit a question using RAG pipeline
 */
export async function ragQuery(
  question: string,
  docIds?: string[]
): Promise<RAGQueryResponse> {
  return withRetry(() =>
    api.post<RAGQueryResponse>('/docs/rag/query', { question, docIds })
  );
}

/**
 * Index a document for RAG
 */
export async function ragIndexDocument(
  request: RAGIndexRequest
): Promise<RAGIndexResponse> {
  return withRetry(() =>
    api.post<RAGIndexResponse>('/docs/rag/index', request)
  );
}

/**
 * Get RAG index status for a document
 */
export async function ragGetStatus(
  docId: string
): Promise<RAGDocumentStatus> {
  return withRetry(() =>
    api.get<RAGDocumentStatus>(`/docs/rag/status/${docId}`)
  );
}

/**
 * List all RAG indexed documents
 */
export async function ragListIndexed(): Promise<RAGIndexedDocsResponse> {
  return withRetry(() =>
    api.get<RAGIndexedDocsResponse>('/docs/rag/indexed')
  );
}

/**
 * Delete a document from RAG index
 */
export async function ragDeleteDocument(
  docId: string
): Promise<{ deleted: string }> {
  return withRetry(() =>
    api.delete<{ deleted: string }>(`/docs/rag/${docId}`)
  );
}

/**
 * Sync all indexed documents
 */
export async function ragSync(): Promise<{
  syncedAt: string;
  results: Array<{ docId: string; success: boolean; sections?: number; error?: string }>;
}> {
  return withRetry(() =>
    api.post<{
      syncedAt: string;
      results: Array<{ docId: string; success: boolean; sections?: number; error?: string }>;
    }>('/docs/rag/sync', {})
  );
}

/**
 * Index official AWS documentation
 * @param docIds - Optional array of specific doc IDs to index. If not provided, indexes all.
 */
export async function ragIndexOfficial(docIds?: string[]): Promise<{
  indexedAt: string;
  results: Array<{
    docId: string;
    title: string;
    success: boolean;
    sections?: number;
    message?: string;
    error?: string;
    errors?: string[];
  }>;
}> {
  return withRetry(() =>
    api.post<{
      indexedAt: string;
      results: Array<{
        docId: string;
        title: string;
        success: boolean;
        sections?: number;
        message?: string;
        error?: string;
        errors?: string[];
      }>;
    }>('/docs/rag/index-official', { docIds })
  );
}

// === Export consolidated API object ===

export const docsApiService = {
  query: queryDocs,
  list: listDocs,
  select: selectDocs,
  upload: uploadDoc,
  delete: deleteDoc,
  getHistory,
  getHistoryAnswer,
  formatError: formatDocsError,
  // RAG functions
  ragQuery,
  ragIndexDocument,
  ragGetStatus,
  ragListIndexed,
  ragDeleteDocument,
  ragSync,
  ragIndexOfficial,
};

export default docsApiService;

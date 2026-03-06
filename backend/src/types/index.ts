// API Request/Response interfaces for AWS Doc Intelligence

// POST /api/documents/upload
export interface UploadRequest {
  file: File;
}

export interface UploadResponse {
  documentId: string;
  name: string;
  pageCount: number;
  status: "success";
}

// POST /api/documents/:documentId/search
export interface DocumentSearchRequest {
  query: string;
}

export interface DocumentSearchResult {
  sectionHeading: string;
  pageNumber: number;
  text: string;
  highlightedText: string;
  relevanceScore: number;
}

export interface DocumentSearchResponse {
  results: DocumentSearchResult[];
  suggestedTopics?: string[];
}

// POST /api/documents/:documentId/summarize
export interface SummarizeRequest {
  sectionId?: string;
}

export interface SummarizeResponse {
  summary: string;
  references: { sectionHeading: string; pageNumber: number }[];
  wordCount: number;
}

// POST /api/resources/search
export interface ResourceSearchRequest {
  query: string;
}

export interface SearchResult {
  title: string;
  sourceUrl: string;
  snippet: string;
  resourceType: "blog" | "video" | "article";
  relevanceScore: number;
}

export interface ResourceSearchResponse {
  results: SearchResult[];
  suggestedTerms?: string[];
}

// POST /api/cost/predict
export interface CostPredictionRequest {
  specification: string;
}

export interface IdentifiedService {
  serviceName: string;
  estimatedMonthlyCost: number;
  freeTier: {
    eligible: boolean;
    limits: string;
    duration: string;
    restrictions: string;
  };
  optimizationSuggestions: {
    suggestion: string;
    estimatedSavings: number;
  }[];
}

export interface CostPredictionResponse {
  services: IdentifiedService[];
  totalEstimatedMonthlyCost: number;
}

// Error response
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// Re-export data models
export { DocumentSection, DocumentMetadata } from "./models";

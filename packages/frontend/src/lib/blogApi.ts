/**
 * Blog Aggregator API Service
 * Provides type-safe API calls for the Blog Post Aggregator tool
 * Requirements: 5.5, 11.5, 27.2, 27.3
 */

import { api, ApiError } from './api';
import type {
  ResultCard,
  TrendingTopic,
  Conflict,
  Recommendation,
} from '@shared/types/blog-aggregator';
import type { FilterCriteria } from '@shared/types/common';

// === Request Types ===

export interface SearchRequest {
  text: string;
  filters?: FilterCriteria;
  limit?: number;
}

// === Response Types ===

export interface SearchResponse {
  results: ResultCard[];
  total: number;
  cached?: boolean;
  stale?: boolean;
  alternatives?: string[];
  message?: string;
}

export interface TrendingResponse {
  topics: TrendingTopic[];
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
}

export interface ConflictsResponse {
  conflicts: Conflict[];
}

// === Loading State Types ===

export interface SearchLoadingState {
  isSearching: boolean;
  isLoadingMore: boolean;
  error: string | null;
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
 * Implements exponential backoff for retrying failed requests (Requirement 27.4)
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
 * Implements user-friendly error messages (Requirement 27.2, 27.3)
 */
export function formatBlogError(error: ApiError | Error): string {
  if ('code' in error) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Unable to connect to the server. Please check your internet connection.';
      case 'BadRequest':
        return error.message || 'Invalid search query. Please try a different search term.';
      case 'NotFound':
        return 'No results found. Try adjusting your search or filters.';
      case 'TIMEOUT':
        return 'Search took too long. Some sources may be unavailable.';
      default:
        return error.message || 'An unexpected error occurred while searching.';
    }
  }
  return error.message || 'An unexpected error occurred while searching.';
}

// === API Functions ===

/**
 * Search for blog posts and articles across all sources
 * Returns ranked ResultCards with quality scores
 * Implements partial results when sources fail (Requirement 27.3)
 */
export async function searchBlogs(
  text: string,
  filters?: FilterCriteria,
  limit?: number
): Promise<SearchResponse> {
  return withRetry(() =>
    api.post<SearchResponse>('/blog/search', { text, filters, limit })
  );
}

/**
 * Get trending topics
 * Returns topics with rising/stable/declining status
 */
export async function getTrendingTopics(): Promise<TrendingResponse> {
  return withRetry(() =>
    api.get<TrendingResponse>('/blog/trending')
  );
}

/**
 * Get content recommendations for a viewed item
 * Returns up to 5 related content items
 */
export async function getRecommendations(
  itemId: string
): Promise<RecommendationsResponse> {
  return withRetry(() =>
    api.get<RecommendationsResponse>(`/blog/recommendations/${itemId}`)
  );
}

/**
 * Get detected conflicts in current search results
 * Returns contradictory advice warnings
 */
export async function getConflicts(): Promise<ConflictsResponse> {
  return withRetry(() =>
    api.get<ConflictsResponse>('/blog/conflicts')
  );
}

// === Optimistic Update Helpers ===

/**
 * Create an optimistic search result while waiting for API response
 * Used for immediate UI feedback
 */
export function createOptimisticSearchState(query: string): SearchLoadingState {
  return {
    isSearching: true,
    isLoadingMore: false,
    error: null,
  };
}

/**
 * Parse search response and extract unavailable sources
 */
export function parseSearchResponse(response: SearchResponse): {
  results: ResultCard[];
  unavailableSources: string[];
  hasAlternatives: boolean;
  alternatives: string[];
} {
  return {
    results: response.results || [],
    unavailableSources: [], // Backend would include this in response
    hasAlternatives: (response.alternatives?.length ?? 0) > 0,
    alternatives: response.alternatives || [],
  };
}

// === Export consolidated API object ===

export const blogApiService = {
  search: searchBlogs,
  getTrending: getTrendingTopics,
  getRecommendations,
  getConflicts,
  formatError: formatBlogError,
  createOptimisticSearchState,
  parseSearchResponse,
};

export default blogApiService;

import { SearchResult, ResourceSearchResponse } from "../types/index";
import { validateQuery } from "../utils/validation";
import { TimeoutError, ServiceUnavailableError } from "../utils/errors";

/**
 * Abstraction for external web search API calls.
 * This interface allows easy mocking in tests and swapping implementations.
 */
export interface ISearchClient {
  fetch(query: string): Promise<RawSearchResult[]>;
}

/** Raw result from the external search API before categorization */
export interface RawSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

/**
 * Categorize a URL into a resource type based on URL patterns.
 */
export function categorizeByUrl(url: string): "blog" | "video" | "article" {
  const lower = url.toLowerCase();

  // Video platforms
  if (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("vimeo.com") ||
    lower.includes("twitch.tv")
  ) {
    return "video";
  }

  // Blog platforms
  if (
    lower.includes("medium.com") ||
    lower.includes("dev.to") ||
    lower.includes("hashnode.") ||
    lower.includes("wordpress.com") ||
    lower.includes("blogspot.com") ||
    lower.includes("/blog")
  ) {
    return "blog";
  }

  // Default to article (docs, official pages, etc.)
  return "article";
}

/**
 * Filter search results by resource type (client-side filtering).
 * Returns only results whose resourceType matches the selected filter.
 * Requirement 4.5: User can filter by blogs, videos, or articles.
 */
export function filterByResourceType(
  results: SearchResult[],
  type: "blog" | "video" | "article",
): SearchResult[] {
  return results.filter((result) => result.resourceType === type);
}

/**
 * Generate alternative search term suggestions when no results are found.
 */
export function suggestAlternativeTerms(query: string): string[] {
  const terms: string[] = [];
  const lower = query.toLowerCase().trim();

  // Suggest adding "AWS" prefix if not present
  if (!lower.startsWith("aws")) {
    terms.push(`AWS ${query}`);
  }

  // Suggest tutorial variant
  terms.push(`${query} tutorial`);

  // Suggest getting started variant
  terms.push(`${query} getting started`);

  return terms.slice(0, 3);
}

/**
 * Default HTTP-based search client that calls a configurable search endpoint.
 * The endpoint URL is read from the SEARCH_API_URL environment variable.
 */
export class HttpSearchClient implements ISearchClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl?: string, timeoutMs: number = 10000) {
    this.baseUrl =
      baseUrl ||
      process.env.SEARCH_API_URL ||
      "https://api.search.example.com/search";
    this.timeoutMs = timeoutMs;
  }

  async fetch(query: string): Promise<RawSearchResult[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.baseUrl}?q=${encodeURIComponent(query + " AWS")}`;
      const response = await globalThis.fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new ServiceUnavailableError(
          "Search service returned an error. Please try again.",
        );
      }

      const data = await response.json();
      return Array.isArray(data.results) ? data.results : [];
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableError) throw error;
      if (
        error instanceof DOMException ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new TimeoutError("Search timed out. Please try again.");
      }
      throw new ServiceUnavailableError(
        "Search service is temporarily unavailable. Please try again.",
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Resource Aggregator Service implementing IResourceAggregatorService.
 * Searches external web APIs for AWS-related content, categorizes results,
 * and implements retry-once logic on timeout errors (Requirement 8.2).
 */
export class ResourceAggregatorService {
  private readonly searchClient: ISearchClient;

  constructor(searchClient?: ISearchClient) {
    this.searchClient = searchClient || new HttpSearchClient();
  }

  async search(query: string): Promise<ResourceSearchResponse> {
    validateQuery(query);

    const rawResults = await this.fetchWithRetry(query);

    if (rawResults.length === 0) {
      return {
        results: [],
        suggestedTerms: suggestAlternativeTerms(query),
      };
    }

    const results: SearchResult[] = rawResults.map((raw, index) => ({
      title: raw.title || "Untitled",
      sourceUrl: raw.url,
      snippet: raw.snippet || "",
      resourceType: categorizeByUrl(raw.url),
      relevanceScore: raw.score ?? Math.max(0, 1 - index * 0.05),
    }));

    // Sort by relevance score descending
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return { results };
  }

  /**
   * Fetch results with retry-once logic on timeout errors (Requirement 8.2).
   */
  private async fetchWithRetry(query: string): Promise<RawSearchResult[]> {
    try {
      return await this.searchClient.fetch(query);
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        // Retry once on timeout
        return await this.searchClient.fetch(query);
      }
      throw error;
    }
  }
}

/**
 * RAG Content Fetcher
 * Fetches real HTML content from AWS documentation URLs with rate limiting and retry logic.
 */

import type { FetchedPage } from "@aws-intel/shared";

// --- Configuration ---

const DEFAULT_CONFIG = {
  maxPagesPerDoc: 100,
  rateLimit: 10, // requests per second
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 10000,
  userAgent: "AWS-Intel-DocNavigator/1.0",
};

// --- Rate Limiter ---

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(requestsPerSecond: number) {
    this.maxTokens = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.refillRate = requestsPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitTime = (1 / this.refillRate) * 1000;
      await this.sleep(waitTime);
      this.refill();
    }
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --- URL Validation ---

function isValidAwsDocUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "docs.aws.amazon.com" ||
        parsed.hostname.endsWith(".docs.aws.amazon.com"))
    );
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash for consistency
    let path = parsed.pathname;
    if (path.endsWith("/") && path.length > 1) {
      path = path.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}

function isSameDocGuide(baseUrl: string, candidateUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const candidate = new URL(candidateUrl);

    if (base.hostname !== candidate.hostname) return false;

    // Extract the first path segment (e.g., /lambda/, /s3/)
    const baseParts = base.pathname.split("/").filter(Boolean);
    const candidateParts = candidate.pathname.split("/").filter(Boolean);

    if (baseParts.length === 0 || candidateParts.length === 0) return false;

    // Must share the same service path
    return baseParts[0] === candidateParts[0];
  } catch {
    return false;
  }
}

// --- Retry Logic ---

async function fetchWithRetry(
  url: string,
  options: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
    userAgent: string;
  }
): Promise<{ html: string; statusCode: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

      const response = await fetch(url, {
        headers: {
          "User-Agent": options.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const html = await response.text();
        return { html, statusCode: response.status };
      }

      // Don't retry 4xx errors (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Retry on 5xx or 429
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    // Exponential backoff
    if (attempt < options.maxRetries) {
      const delay = options.retryDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Fetch failed after retries");
}

// --- Extract Title from HTML ---

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim().replace(/\s*\|.*$/, "").replace(/\s*-\s*AWS.*$/i, "");
  }
  return "Untitled";
}

// --- Extract Links from HTML ---

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      // Skip anchors, javascript, mailto, etc.
      if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) {
        continue;
      }

      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl).href;
      const normalized = normalizeUrl(absoluteUrl);

      if (isValidAwsDocUrl(normalized)) {
        links.push(normalized);
      }
    } catch {
      // Skip invalid URLs
    }
  }

  return [...new Set(links)]; // Deduplicate
}

// --- ContentFetcher Class ---

export class RAGContentFetcher {
  private rateLimiter: RateLimiter;
  private config: typeof DEFAULT_CONFIG;

  constructor(config?: Partial<typeof DEFAULT_CONFIG>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rateLimiter = new RateLimiter(this.config.rateLimit);
  }

  /**
   * Fetch a single page from AWS documentation.
   */
  async fetchPage(url: string): Promise<FetchedPage> {
    if (!isValidAwsDocUrl(url)) {
      throw new Error(`Invalid AWS documentation URL: ${url}`);
    }

    await this.rateLimiter.acquire();

    const { html, statusCode } = await fetchWithRetry(url, {
      maxRetries: this.config.maxRetries,
      retryDelayMs: this.config.retryDelayMs,
      timeoutMs: this.config.timeoutMs,
      userAgent: this.config.userAgent,
    });

    return {
      url: normalizeUrl(url),
      html,
      title: extractTitle(html),
      fetchedAt: new Date(),
      statusCode,
    };
  }

  /**
   * Crawl pages within the same documentation guide.
   * Starts from baseUrl and follows links within the same guide.
   */
  async crawlDocPages(
    baseUrl: string,
    options?: { maxPages?: number }
  ): Promise<FetchedPage[]> {
    if (!isValidAwsDocUrl(baseUrl)) {
      throw new Error(`Invalid AWS documentation URL: ${baseUrl}`);
    }

    const maxPages = options?.maxPages ?? this.config.maxPagesPerDoc;
    const visited = new Set<string>();
    const queue: string[] = [normalizeUrl(baseUrl)];
    const pages: FetchedPage[] = [];

    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift()!;
      const normalizedUrl = normalizeUrl(url);

      if (visited.has(normalizedUrl)) continue;
      visited.add(normalizedUrl);

      try {
        const page = await this.fetchPage(normalizedUrl);
        pages.push(page);

        // Extract and queue links from the same guide
        const links = extractLinks(page.html, normalizedUrl);
        for (const link of links) {
          if (!visited.has(link) && isSameDocGuide(baseUrl, link)) {
            queue.push(link);
          }
        }
      } catch (err) {
        console.error(`Failed to fetch ${normalizedUrl}:`, err);
        // Continue with other pages
      }
    }

    return pages;
  }

  /**
   * Fetch documentation for a specific AWS service.
   * This is a convenience method that constructs the URL and crawls.
   */
  async fetchAwsServiceDocs(
    servicePath: string,
    options?: { maxPages?: number }
  ): Promise<FetchedPage[]> {
    const baseUrl = `https://docs.aws.amazon.com/${servicePath}/`;
    return this.crawlDocPages(baseUrl, options);
  }
}

// Export helpers for testing
export {
  isValidAwsDocUrl,
  normalizeUrl,
  isSameDocGuide,
  extractTitle,
  extractLinks,
  fetchWithRetry,
  RateLimiter,
  DEFAULT_CONFIG,
};

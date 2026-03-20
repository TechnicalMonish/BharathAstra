import { createHash } from "crypto";
import { type CachedContent } from "@aws-intel/shared";
import * as dynamodb from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";

// --- Constants ---

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Helpers ---

function generateCacheKey(query: string, filters?: Record<string, unknown>): string {
  const raw = JSON.stringify({ query: query.toLowerCase().trim(), filters: filters ?? {} });
  return createHash("sha256").update(raw).digest("hex");
}

function isExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

// --- CacheManager class ---

export class CacheManager {
  private memoryCache: Map<string, CachedContent> = new Map();

  /**
   * Get cached content by key. Returns null if not found.
   * Checks in-memory first, then DynamoDB.
   * Marks content as stale if expired but still returns it.
   */
  async get(key: string): Promise<CachedContent | null> {
    // Check in-memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (isExpired(memEntry.expiresAt)) {
        memEntry.stale = true;
      }
      return memEntry;
    }

    // Check DynamoDB
    try {
      const record = await dynamodb.get({
        TableName: TABLES.ContentCache,
        Key: { cacheKey: key },
      });

      if (!record) return null;

      const cached: CachedContent = {
        data: JSON.parse(record.data as string),
        cachedAt: new Date(record.cachedAt as string),
        expiresAt: new Date(record.expiresAt as string),
        stale: isExpired(new Date(record.expiresAt as string)),
      };

      // Store in memory for faster subsequent access
      this.memoryCache.set(key, cached);
      return cached;
    } catch {
      return null;
    }
  }

  /**
   * Set cached content with TTL.
   * Stores in both in-memory cache and DynamoDB.
   */
  async set(key: string, data: unknown, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const cached: CachedContent = {
      data,
      cachedAt: now,
      expiresAt,
      stale: false,
    };

    // Store in memory
    this.memoryCache.set(key, cached);

    // Persist to DynamoDB
    try {
      await dynamodb.put({
        TableName: TABLES.ContentCache,
        Item: {
          cacheKey: key,
          data: JSON.stringify(data),
          cachedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          ttl: Math.floor(expiresAt.getTime() / 1000), // DynamoDB TTL (epoch seconds)
        },
      });
    } catch {
      // DynamoDB write failure is non-fatal; in-memory cache still works
    }
  }

  /**
   * Invalidate a cache entry by key.
   */
  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key);

    try {
      await dynamodb.del({
        TableName: TABLES.ContentCache,
        Key: { cacheKey: key },
      });
    } catch {
      // Non-fatal
    }
  }

  /**
   * Serve stale content while refreshing in background.
   * The fetcher function is called asynchronously to update the cache.
   */
  refreshInBackground(key: string, fetcher: () => Promise<unknown>): void {
    // Fire and forget
    fetcher()
      .then((data) => this.set(key, data))
      .catch(() => {
        // Background refresh failure is non-fatal
      });
  }

  /**
   * Clear the in-memory cache (useful for testing).
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }
}

export { generateCacheKey, isExpired, DEFAULT_TTL_MS };

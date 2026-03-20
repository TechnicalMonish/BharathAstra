/**
 * Content Cache
 * S3-based caching for fetched AWS documentation with TTL and change detection.
 * Caching is optional - if S3 bucket doesn't exist, operations gracefully skip caching.
 */

import * as crypto from "crypto";
import type { RAGCachedContent, RAGCachedPage, FetchedPage } from "@aws-intel/shared";
import { upload, download, deleteObject, listObjects, type S3Object } from "../../lib/s3";
import { BUCKETS } from "../../config/buckets";

// --- Configuration ---

const DEFAULT_TTL_HOURS = 24;
const CACHE_PREFIX = "docs-cache";

// --- Helper: Check if error is due to missing bucket ---
function isBucketMissingError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const error = err as { name?: string; Code?: string; code?: string };
    return (
      error.name === "NoSuchBucket" ||
      error.Code === "NoSuchBucket" ||
      error.code === "NoSuchBucket"
    );
  }
  return false;
}

// --- Content Hash ---

function computeContentHash(pages: FetchedPage[]): string {
  const hash = crypto.createHash("sha256");
  for (const page of pages) {
    hash.update(page.url);
    hash.update(page.html);
  }
  return hash.digest("hex");
}

// --- Cache Key Generation ---

function getCacheKey(docId: string, contentHash?: string): string {
  if (contentHash) {
    return `${CACHE_PREFIX}/${docId}/${contentHash}.json`;
  }
  return `${CACHE_PREFIX}/${docId}/`;
}

// --- ContentCache Class ---

export class ContentCache {
  private ttlHours: number;

  constructor(ttlHours: number = DEFAULT_TTL_HOURS) {
    this.ttlHours = ttlHours;
  }

  /**
   * Store fetched pages in S3 cache.
   */
  async store(docId: string, pages: FetchedPage[]): Promise<RAGCachedContent> {
    const contentHash = computeContentHash(pages);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 60 * 60 * 1000);

    const cachedPages: RAGCachedPage[] = pages.map((page) => ({
      url: page.url,
      html: page.html,
      title: page.title,
      fetchedAt: page.fetchedAt.toISOString(),
    }));

    const cachedContent: RAGCachedContent = {
      docId,
      sourceUrl: pages[0]?.url || "",
      pages: cachedPages,
      fetchedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      contentHash,
      totalPages: pages.length,
    };

    const key = getCacheKey(docId, contentHash);

    try {
      await upload({
        bucket: BUCKETS.CustomDocsUploads, // Reuse existing bucket
        key,
        body: Buffer.from(JSON.stringify(cachedContent)),
        contentType: "application/json",
      });
    } catch (err) {
      if (isBucketMissingError(err)) {
        console.log(`S3 bucket not configured - skipping cache for ${docId}`);
      } else {
        console.error(`Failed to cache content for ${docId}:`, err);
      }
      // Don't throw - caching is optional
    }

    return cachedContent;
  }

  /**
   * Retrieve cached content from S3.
   * Returns null if not found, expired, or bucket doesn't exist.
   */
  async get(docId: string): Promise<RAGCachedContent | null> {
    try {
      // List objects with the docId prefix to find the latest cache
      const prefix = getCacheKey(docId);
      const objects = await listObjects(BUCKETS.CustomDocsUploads, prefix);

      if (!objects || objects.length === 0) {
        return null;
      }

      // Get the most recent cache file
      const latestKey = objects
        .filter((obj: S3Object) => obj.key?.endsWith(".json"))
        .sort((a: S3Object, b: S3Object) => {
          const aTime = a.lastModified?.getTime() || 0;
          const bTime = b.lastModified?.getTime() || 0;
          return bTime - aTime;
        })[0]?.key;

      if (!latestKey) {
        return null;
      }

      const result = await download(BUCKETS.CustomDocsUploads, latestKey);
      
      // Read the stream to get the data
      const chunks: Buffer[] = [];
      for await (const chunk of result.body) {
        chunks.push(Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);

      if (!data || data.length === 0) {
        return null;
      }

      const cachedContent = JSON.parse(data.toString()) as RAGCachedContent;
      return cachedContent;
    } catch (err) {
      if (isBucketMissingError(err)) {
        // S3 bucket not configured - caching disabled, return null silently
        return null;
      }
      console.error(`Failed to retrieve cache for ${docId}:`, err);
      return null;
    }
  }

  /**
   * Check if cached content is expired.
   */
  isExpired(cachedContent: RAGCachedContent): boolean {
    const expiresAt = new Date(cachedContent.expiresAt);
    return new Date() > expiresAt;
  }

  /**
   * Get cached content if valid (not expired).
   * Returns null if not found or expired.
   */
  async getIfValid(docId: string): Promise<RAGCachedContent | null> {
    const cached = await this.get(docId);
    if (!cached) return null;
    if (this.isExpired(cached)) return null;
    return cached;
  }

  /**
   * Get cached content even if stale (for fallback).
   */
  async getStale(docId: string): Promise<RAGCachedContent | null> {
    return this.get(docId);
  }

  /**
   * Check if content has changed by comparing hashes.
   */
  hasContentChanged(cachedContent: RAGCachedContent, newPages: FetchedPage[]): boolean {
    const newHash = computeContentHash(newPages);
    return cachedContent.contentHash !== newHash;
  }

  /**
   * Delete cached content for a document.
   */
  async delete(docId: string): Promise<void> {
    try {
      const prefix = getCacheKey(docId);
      const objects = await listObjects(BUCKETS.CustomDocsUploads, prefix);

      for (const obj of objects || []) {
        if (obj.key) {
          await deleteObject(BUCKETS.CustomDocsUploads, obj.key);
        }
      }
    } catch (err) {
      if (isBucketMissingError(err)) {
        // S3 bucket not configured - nothing to delete
        return;
      }
      console.error(`Failed to delete cache for ${docId}:`, err);
    }
  }

  /**
   * Convert cached pages back to FetchedPage format.
   */
  toFetchedPages(cachedContent: RAGCachedContent): FetchedPage[] {
    return cachedContent.pages.map((page) => ({
      url: page.url,
      html: page.html,
      title: page.title,
      fetchedAt: new Date(page.fetchedAt),
      statusCode: 200, // Cached content was successful
    }));
  }
}

// Export helpers for testing
export { computeContentHash, getCacheKey, DEFAULT_TTL_HOURS };

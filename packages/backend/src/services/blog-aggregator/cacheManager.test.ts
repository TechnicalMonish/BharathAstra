import { describe, it, expect, vi, beforeEach } from "vitest";
import { CacheManager, generateCacheKey, isExpired, DEFAULT_TTL_MS } from "./cacheManager";

// Mock DynamoDB
vi.mock("../../lib/dynamodb", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

describe("CacheManager", () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
  });

  describe("get/set", () => {
    it("should return null for missing key", async () => {
      const result = await cache.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should store and retrieve from in-memory cache", async () => {
      await cache.set("key1", { foo: "bar" });
      const result = await cache.get("key1");
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ foo: "bar" });
      expect(result!.stale).toBe(false);
    });

    it("should mark expired entries as stale", async () => {
      await cache.set("key2", { data: 1 }, 1); // 1ms TTL
      await new Promise((r) => setTimeout(r, 10));
      const result = await cache.get("key2");
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(true);
    });
  });

  describe("invalidate", () => {
    it("should remove entry from in-memory cache", async () => {
      await cache.set("key3", "value");
      await cache.invalidate("key3");
      const result = await cache.get("key3");
      expect(result).toBeNull();
    });

    it("should not throw for missing key", async () => {
      await expect(cache.invalidate("missing")).resolves.not.toThrow();
    });
  });

  describe("refreshInBackground", () => {
    it("should update cache after background refresh", async () => {
      await cache.set("key4", "old");
      const fetcher = vi.fn().mockResolvedValue("new");
      cache.refreshInBackground("key4", fetcher);
      // Wait for async refresh
      await new Promise((r) => setTimeout(r, 50));
      const result = await cache.get("key4");
      expect(result!.data).toBe("new");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should not throw if fetcher fails", async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error("fail"));
      expect(() => cache.refreshInBackground("key5", fetcher)).not.toThrow();
    });
  });

  describe("clearMemoryCache", () => {
    it("should clear all in-memory entries", async () => {
      await cache.set("a", 1);
      await cache.set("b", 2);
      cache.clearMemoryCache();
      expect(await cache.get("a")).toBeNull();
      expect(await cache.get("b")).toBeNull();
    });
  });
});

describe("generateCacheKey", () => {
  it("should produce consistent hash for same input", () => {
    const key1 = generateCacheKey("lambda", { level: "beginner" });
    const key2 = generateCacheKey("lambda", { level: "beginner" });
    expect(key1).toBe(key2);
  });

  it("should produce different hash for different queries", () => {
    const key1 = generateCacheKey("lambda");
    const key2 = generateCacheKey("s3");
    expect(key1).not.toBe(key2);
  });

  it("should be case-insensitive", () => {
    const key1 = generateCacheKey("Lambda");
    const key2 = generateCacheKey("lambda");
    expect(key1).toBe(key2);
  });
});

describe("isExpired", () => {
  it("should return true for past date", () => {
    expect(isExpired(new Date("2020-01-01"))).toBe(true);
  });

  it("should return false for future date", () => {
    const future = new Date(Date.now() + 100000);
    expect(isExpired(future)).toBe(false);
  });
});

describe("DEFAULT_TTL_MS", () => {
  it("should be 24 hours in milliseconds", () => {
    expect(DEFAULT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

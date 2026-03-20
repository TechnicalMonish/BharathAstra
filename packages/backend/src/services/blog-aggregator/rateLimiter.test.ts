import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RateLimiter,
  TokenBucket,
  DEFAULT_SOURCE_CONFIGS,
  FAILURE_THRESHOLD,
  DISABLE_DURATION_MS,
  type AdminAlert,
} from "./rateLimiter";
import { ContentSource } from "@aws-intel/shared";

describe("TokenBucket", () => {
  it("should start with max tokens", () => {
    const bucket = new TokenBucket({ maxTokens: 10, refillIntervalMs: 1000, refillAmount: 10 });
    expect(bucket.getAvailableTokens()).toBe(10);
  });

  it("should consume tokens on tryConsume", () => {
    const bucket = new TokenBucket({ maxTokens: 3, refillIntervalMs: 1000, refillAmount: 3 });
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.getAvailableTokens()).toBe(2);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it("should refill tokens after interval", async () => {
    vi.useFakeTimers();
    const bucket = new TokenBucket({ maxTokens: 2, refillIntervalMs: 100, refillAmount: 2 });

    bucket.tryConsume();
    bucket.tryConsume();
    expect(bucket.getAvailableTokens()).toBe(0);

    vi.advanceTimersByTime(100);
    expect(bucket.getAvailableTokens()).toBe(2);
    vi.useRealTimers();
  });

  it("should not exceed maxTokens on refill", () => {
    vi.useFakeTimers();
    const bucket = new TokenBucket({ maxTokens: 5, refillIntervalMs: 100, refillAmount: 5 });

    // Advance multiple intervals without consuming
    vi.advanceTimersByTime(500);
    expect(bucket.getAvailableTokens()).toBe(5);
    vi.useRealTimers();
  });
});

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should have default configs for all ContentSource values", () => {
    for (const source of Object.values(ContentSource)) {
      expect(DEFAULT_SOURCE_CONFIGS[source]).toBeDefined();
    }
  });

  describe("acquire", () => {
    it("should resolve immediately when tokens are available", async () => {
      const limiter = new RateLimiter({
        [ContentSource.REDDIT]: { maxTokens: 5, refillIntervalMs: 60_000, refillAmount: 5 },
      });

      await expect(limiter.acquire(ContentSource.REDDIT)).resolves.toBeUndefined();
    });

    it("should queue requests when tokens are exhausted", async () => {
      const limiter = new RateLimiter({
        [ContentSource.GITHUB]: { maxTokens: 1, refillIntervalMs: 100, refillAmount: 1 },
      });

      // Consume the only token
      await limiter.acquire(ContentSource.GITHUB);

      // Next acquire should be queued
      let resolved = false;
      const promise = limiter.acquire(ContentSource.GITHUB).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);

      // Advance past refill interval to drain queue
      vi.advanceTimersByTime(100);
      await promise;
      expect(resolved).toBe(true);
    });

    it("should reject when source is disabled", async () => {
      const limiter = new RateLimiter();

      // Trigger enough failures to disable
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.REDDIT);
      }

      await expect(limiter.acquire(ContentSource.REDDIT)).rejects.toThrow(
        "temporarily disabled"
      );
    });

    it("should throw for unknown source", async () => {
      const limiter = new RateLimiter();
      await expect(
        limiter.acquire("unknown" as ContentSource)
      ).rejects.toThrow("No rate limit config");
    });
  });

  describe("recordSuccess / recordFailure", () => {
    it("should reset failure count on success", () => {
      const limiter = new RateLimiter();
      limiter.recordFailure(ContentSource.GITHUB);
      limiter.recordFailure(ContentSource.GITHUB);
      limiter.recordSuccess(ContentSource.GITHUB);

      const status = limiter.getSourceStatus(ContentSource.GITHUB);
      expect(status.consecutiveFailures).toBe(0);
    });

    it("should disable source after threshold failures", () => {
      const limiter = new RateLimiter();

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.HACKERNEWS);
      }

      expect(limiter.isDisabled(ContentSource.HACKERNEWS)).toBe(true);
    });

    it("should not disable source before threshold", () => {
      const limiter = new RateLimiter();

      for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
        limiter.recordFailure(ContentSource.HACKERNEWS);
      }

      expect(limiter.isDisabled(ContentSource.HACKERNEWS)).toBe(false);
    });
  });

  describe("source disabling and re-enabling", () => {
    it("should re-enable source after disable duration", () => {
      const limiter = new RateLimiter();

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.MEDIUM);
      }
      expect(limiter.isDisabled(ContentSource.MEDIUM)).toBe(true);

      vi.advanceTimersByTime(DISABLE_DURATION_MS);
      expect(limiter.isDisabled(ContentSource.MEDIUM)).toBe(false);
    });

    it("should reset failure count when re-enabled", () => {
      const limiter = new RateLimiter();

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.MEDIUM);
      }

      vi.advanceTimersByTime(DISABLE_DURATION_MS);
      limiter.isDisabled(ContentSource.MEDIUM); // triggers re-enable

      const status = limiter.getSourceStatus(ContentSource.MEDIUM);
      expect(status.consecutiveFailures).toBe(0);
    });

    it("should emit admin alert when source is disabled", () => {
      const alertHandler = vi.fn();
      const limiter = new RateLimiter(undefined, alertHandler);

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.TWITTER);
      }

      expect(alertHandler).toHaveBeenCalledTimes(1);
      const alert: AdminAlert = alertHandler.mock.calls[0][0];
      expect(alert.source).toBe(ContentSource.TWITTER);
      expect(alert.consecutiveFailures).toBe(FAILURE_THRESHOLD);
      expect(alert.message).toContain("disabled");
    });

    it("should reject queued requests when source is disabled", async () => {
      const limiter = new RateLimiter({
        [ContentSource.DEVTO]: { maxTokens: 1, refillIntervalMs: 60_000, refillAmount: 1 },
      });

      // Exhaust tokens
      await limiter.acquire(ContentSource.DEVTO);

      // Queue a request
      const promise = limiter.acquire(ContentSource.DEVTO);

      // Disable the source
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.DEVTO);
      }

      await expect(promise).rejects.toThrow("temporarily disabled");
    });
  });

  describe("getSourceStatus", () => {
    it("should return correct status for a source", async () => {
      const limiter = new RateLimiter({
        [ContentSource.AWS_BLOG]: { maxTokens: 10, refillIntervalMs: 60_000, refillAmount: 10 },
      });

      await limiter.acquire(ContentSource.AWS_BLOG);
      limiter.recordFailure(ContentSource.AWS_BLOG);

      const status = limiter.getSourceStatus(ContentSource.AWS_BLOG);
      expect(status.source).toBe(ContentSource.AWS_BLOG);
      expect(status.availableTokens).toBe(9);
      expect(status.maxTokens).toBe(10);
      expect(status.disabled).toBe(false);
      expect(status.consecutiveFailures).toBe(1);
      expect(status.queueLength).toBe(0);
    });

    it("should throw for unknown source", () => {
      const limiter = new RateLimiter();
      expect(() =>
        limiter.getSourceStatus("unknown" as ContentSource)
      ).toThrow("No rate limit config");
    });
  });

  describe("getAlerts", () => {
    it("should return empty array initially", () => {
      const limiter = new RateLimiter();
      expect(limiter.getAlerts()).toEqual([]);
    });

    it("should accumulate alerts", () => {
      const limiter = new RateLimiter();

      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.REDDIT);
      }
      for (let i = 0; i < FAILURE_THRESHOLD; i++) {
        limiter.recordFailure(ContentSource.GITHUB);
      }

      const alerts = limiter.getAlerts();
      expect(alerts).toHaveLength(2);
      expect(alerts[0].source).toBe(ContentSource.REDDIT);
      expect(alerts[1].source).toBe(ContentSource.GITHUB);
    });
  });

  describe("custom configs", () => {
    it("should allow overriding default configs", async () => {
      const limiter = new RateLimiter({
        [ContentSource.REDDIT]: { maxTokens: 2, refillIntervalMs: 1000, refillAmount: 2 },
      });

      await limiter.acquire(ContentSource.REDDIT);
      await limiter.acquire(ContentSource.REDDIT);

      const status = limiter.getSourceStatus(ContentSource.REDDIT);
      expect(status.availableTokens).toBe(0);
      expect(status.maxTokens).toBe(2);
    });
  });
});

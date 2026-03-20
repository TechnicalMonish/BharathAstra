import { ContentSource } from "@aws-intel/shared";

// --- Types ---

export interface RateLimiterConfig {
  /** Max tokens (requests) per window */
  maxTokens: number;
  /** Refill interval in milliseconds */
  refillIntervalMs: number;
  /** Number of tokens added per refill */
  refillAmount: number;
}

export interface SourceStatus {
  source: ContentSource;
  availableTokens: number;
  maxTokens: number;
  disabled: boolean;
  consecutiveFailures: number;
  queueLength: number;
}

export interface AdminAlert {
  source: ContentSource;
  message: string;
  timestamp: Date;
  consecutiveFailures: number;
}

type QueuedRequest = {
  resolve: () => void;
  reject: (err: Error) => void;
};

// --- Default per-source quotas (requests per minute) ---

const DEFAULT_SOURCE_CONFIGS: Record<ContentSource, RateLimiterConfig> = {
  [ContentSource.AWS_BLOG]: { maxTokens: 60, refillIntervalMs: 60_000, refillAmount: 60 },
  [ContentSource.REDDIT]: { maxTokens: 60, refillIntervalMs: 60_000, refillAmount: 60 },
  [ContentSource.HACKERNEWS]: { maxTokens: 30, refillIntervalMs: 60_000, refillAmount: 30 },
  [ContentSource.MEDIUM]: { maxTokens: 30, refillIntervalMs: 60_000, refillAmount: 30 },
  [ContentSource.DEVTO]: { maxTokens: 60, refillIntervalMs: 60_000, refillAmount: 60 },
  [ContentSource.YOUTUBE]: { maxTokens: 30, refillIntervalMs: 60_000, refillAmount: 30 },
  [ContentSource.GITHUB]: { maxTokens: 30, refillIntervalMs: 60_000, refillAmount: 30 },
  [ContentSource.TWITTER]: { maxTokens: 30, refillIntervalMs: 60_000, refillAmount: 30 },
  [ContentSource.AWS_DOCS]: { maxTokens: 60, refillIntervalMs: 60_000, refillAmount: 60 },
  [ContentSource.AWS_WHITEPAPERS]: { maxTokens: 60, refillIntervalMs: 60_000, refillAmount: 60 },
};

const FAILURE_THRESHOLD = 5;
const DISABLE_DURATION_MS = 5 * 60_000; // 5 minutes

// --- Token Bucket ---

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  readonly config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervals = Math.floor(elapsed / this.config.refillIntervalMs);
    if (intervals > 0) {
      this.tokens = Math.min(
        this.config.maxTokens,
        this.tokens + intervals * this.config.refillAmount
      );
      this.lastRefill += intervals * this.config.refillIntervalMs;
    }
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  getMaxTokens(): number {
    return this.config.maxTokens;
  }
}

// --- RateLimiter class ---

export class RateLimiter {
  private buckets: Map<ContentSource, TokenBucket> = new Map();
  private queues: Map<ContentSource, QueuedRequest[]> = new Map();
  private consecutiveFailures: Map<ContentSource, number> = new Map();
  private disabledUntil: Map<ContentSource, number> = new Map();
  private alerts: AdminAlert[] = [];
  private onAlert?: (alert: AdminAlert) => void;

  constructor(
    configs?: Partial<Record<ContentSource, RateLimiterConfig>>,
    onAlert?: (alert: AdminAlert) => void
  ) {
    this.onAlert = onAlert;
    const merged = { ...DEFAULT_SOURCE_CONFIGS, ...configs };
    for (const [source, config] of Object.entries(merged)) {
      this.buckets.set(source as ContentSource, new TokenBucket(config));
      this.queues.set(source as ContentSource, []);
      this.consecutiveFailures.set(source as ContentSource, 0);
    }
  }

  /**
   * Acquire permission to make a request to the given source.
   * Resolves immediately if tokens are available, otherwise queues the request.
   * Rejects if the source is disabled.
   */
  async acquire(source: ContentSource): Promise<void> {
    if (this.isDisabled(source)) {
      throw new Error(`Source ${source} is temporarily disabled due to repeated failures`);
    }

    const bucket = this.buckets.get(source);
    if (!bucket) {
      throw new Error(`No rate limit config for source: ${source}`);
    }

    if (bucket.tryConsume()) {
      return;
    }

    // Queue the request and wait
    return new Promise<void>((resolve, reject) => {
      const queue = this.queues.get(source)!;
      queue.push({ resolve, reject });

      // Schedule drain after the refill interval
      setTimeout(() => {
        this.drainQueue(source);
      }, bucket.config.refillIntervalMs);
    });
  }

  /**
   * Record a successful request for a source, resetting its failure count.
   */
  recordSuccess(source: ContentSource): void {
    this.consecutiveFailures.set(source, 0);
  }

  /**
   * Record a failed request. If failures exceed the threshold, disable the source.
   */
  recordFailure(source: ContentSource): void {
    const current = (this.consecutiveFailures.get(source) ?? 0) + 1;
    this.consecutiveFailures.set(source, current);

    if (current >= FAILURE_THRESHOLD) {
      this.disableSource(source, current);
    }
  }

  /**
   * Check if a source is currently disabled.
   */
  isDisabled(source: ContentSource): boolean {
    const until = this.disabledUntil.get(source);
    if (until === undefined) return false;
    if (Date.now() >= until) {
      // Re-enable
      this.disabledUntil.delete(source);
      this.consecutiveFailures.set(source, 0);
      return false;
    }
    return true;
  }

  /**
   * Get the status of a specific source.
   */
  getSourceStatus(source: ContentSource): SourceStatus {
    const bucket = this.buckets.get(source);
    if (!bucket) {
      throw new Error(`No rate limit config for source: ${source}`);
    }
    return {
      source,
      availableTokens: bucket.getAvailableTokens(),
      maxTokens: bucket.getMaxTokens(),
      disabled: this.isDisabled(source),
      consecutiveFailures: this.consecutiveFailures.get(source) ?? 0,
      queueLength: this.queues.get(source)?.length ?? 0,
    };
  }

  /**
   * Get all admin alerts that have been emitted.
   */
  getAlerts(): AdminAlert[] {
    return [...this.alerts];
  }

  private disableSource(source: ContentSource, failures: number): void {
    this.disabledUntil.set(source, Date.now() + DISABLE_DURATION_MS);

    const alert: AdminAlert = {
      source,
      message: `Source ${source} disabled after ${failures} consecutive failures`,
      timestamp: new Date(),
      consecutiveFailures: failures,
    };
    this.alerts.push(alert);
    this.onAlert?.(alert);

    // Reject all queued requests for this source
    const queue = this.queues.get(source) ?? [];
    for (const req of queue) {
      req.reject(new Error(`Source ${source} is temporarily disabled due to repeated failures`));
    }
    this.queues.set(source, []);
  }

  private drainQueue(source: ContentSource): void {
    if (this.isDisabled(source)) return;

    const bucket = this.buckets.get(source);
    const queue = this.queues.get(source);
    if (!bucket || !queue) return;

    while (queue.length > 0 && bucket.tryConsume()) {
      const req = queue.shift()!;
      req.resolve();
    }
  }
}

// Export for testing
export { TokenBucket, DEFAULT_SOURCE_CONFIGS, FAILURE_THRESHOLD, DISABLE_DURATION_MS };

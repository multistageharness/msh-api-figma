/**
 * Retry handler utility for failed requests
 * Implements exponential backoff with jitter, honouring a server-specified
 * `Retry-After` when the failed attempt carried one.
 */

import { FigmaFetchError, isRetryableError, TimeoutError } from "../errors/index.js";
import type { RetryConfig, RetryContext } from "../types/index.js";

/**
 * Clamp a configured numeric option: `undefined`/`null` falls back to the
 * default, a negative value is clamped to `0` (zero is always representable —
 * `maxRetries: 0` means "one attempt, no retries", `jitterFactor: 0` means
 * deterministic delays).
 */
function resolveOption(value: number | undefined, defaultValue: number): number {
  const resolved = value ?? defaultValue;
  return resolved < 0 ? 0 : resolved;
}

/**
 * Extract a server-specified wait from a failed attempt's error, in
 * milliseconds. Only a finite, positive `meta.retryAfter` (seconds, parsed once
 * in `createErrorFromResponse`) counts; anything else returns `null` so the
 * caller falls back to computed backoff.
 */
function retryAfterMsFromError(error: Error | undefined): number | null {
  if (!(error instanceof FigmaFetchError)) return null;
  const retryAfter = error.meta?.retryAfter;
  if (typeof retryAfter !== "number") return null;
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return null;
  return retryAfter * 1000;
}

/**
 * RetryHandler class
 * Handles retry logic with exponential backoff and jitter
 */
export class RetryHandler {
  private readonly maxRetries: number;
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly backoffFactor: number;
  private readonly jitterFactor: number;
  private readonly retryTimeouts: boolean;
  private readonly retryableStatuses: number[];

  constructor(config: RetryConfig = {}) {
    this.maxRetries = resolveOption(config.maxRetries, 3);
    this.initialDelay = resolveOption(config.initialDelay, 1000);
    this.maxDelay = resolveOption(config.maxDelay, 30000);
    this.backoffFactor = resolveOption(config.backoffFactor, 2);
    this.jitterFactor = resolveOption(config.jitterFactor, 0.1);
    this.retryTimeouts = config.retryTimeouts ?? false;
    this.retryableStatuses = config.retryableStatuses ?? [
      429, 500, 502, 503, 504,
    ];
  }

  /**
   * Calculate delay for retry attempt.
   *
   * When the failed attempt's error carries a server-specified `Retry-After`
   * (a 429 or 5xx that named a wait), that wait is used verbatim — no jitter.
   * Otherwise: exponential backoff with jitter.
   */
  calculateDelay(attempt: number, error?: Error): number {
    const serverWait = retryAfterMsFromError(error);
    if (serverWait !== null) return serverWait;

    // Calculate exponential backoff
    const baseDelay = Math.min(
      this.initialDelay * this.backoffFactor ** attempt,
      this.maxDelay,
    );

    // Add jitter to prevent thundering herd
    const jitter = baseDelay * this.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(baseDelay + jitter));
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(context: RetryContext): boolean {
    const { attempt, error, response } = context;

    // Check if max retries exceeded
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Timeouts are retryable only when opted in (`retryTimeouts`); the default
    // preserves fail-fast behaviour for interactive consumers.
    if (error instanceof TimeoutError) {
      return this.retryTimeouts;
    }

    // Check if error is retryable using our error detection
    if (isRetryableError(error)) {
      return true;
    }

    // Check if response status is retryable
    if (response && this.retryableStatuses.includes(response.status)) {
      return true;
    }

    return false;
  }

  /**
   * Execute function with retry logic
   * @param fn - Async function to execute
   * @param onRetry - Optional callback called before each retry
   * @returns Promise resolving to function result
   */
  async execute<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, delay: number, error: Error) => void,
  ): Promise<T> {
    let lastError: Error;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        const context: RetryContext = {
          attempt,
          error,
          request: {} as any, // Request context can be added if needed
        };

        if (!this.shouldRetry(context)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, error);

        if (onRetry) {
          onRetry(attempt, delay, error);
        }

        await this.sleep(delay);
        attempt++;
      }
    }

    throw lastError!;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get retry configuration
   */
  getConfig(): RetryConfig {
    return {
      maxRetries: this.maxRetries,
      initialDelay: this.initialDelay,
      maxDelay: this.maxDelay,
      backoffFactor: this.backoffFactor,
      jitterFactor: this.jitterFactor,
      retryTimeouts: this.retryTimeouts,
      retryableStatuses: [...this.retryableStatuses],
    };
  }
}

export default RetryHandler;

/**
 * TypeScript type definitions for figma-fetch module
 */

/**
 * HTTP methods supported by the fetch adapter
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * Request headers as key-value pairs
 */
export interface Headers {
  [key: string]: string;
}

/**
 * Request options for fetch adapter
 */
export interface FetchRequest {
  url: string;
  method?: HttpMethod;
  headers?: Headers;
  body?: string | FormData | Blob | ArrayBuffer;
  signal?: AbortSignal;
  timeout?: number;
  [key: string]: any; // Allow additional options for specific adapters
}

/**
 * Response from fetch adapter
 */
export interface FetchResponse<T = any> {
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
  ok: boolean;
  /**
   * Raw response text when the body was textual (JSON, text, or no
   * content-type); `null`/absent for binary bodies. Lets the error path report
   * what the server actually sent even when `data` is `null`.
   */
  rawBody?: string | null;
}

/**
 * Logger interface for debugging and monitoring
 */
export interface Logger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  requestsPerMinute?: number;
  burstLimit?: number;
}

/**
 * Rate limiter statistics
 */
export interface RateLimiterStats {
  requestsLastMinute: number;
  remainingRequests: number;
  burstTokensRemaining: number;
  resetTime: number;
}

/**
 * Request cache configuration
 */
export interface CacheConfig {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Cache entry
 */
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Retries after the first attempt. `0` = exactly one attempt. Negative values clamp to `0`. */
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  /** Backoff jitter fraction. `0` = deterministic delays. */
  jitterFactor?: number;
  /**
   * Whether a `TimeoutError` is retried. Defaults to `false` (fail fast, the
   * historical behaviour); long-running bulk consumers (e.g. chunked file
   * downloads, where a timeout is the expected transient failure) opt in.
   */
  retryTimeouts?: boolean;
  retryableStatuses?: number[];
}

/**
 * Payload passed to a caller-visible `onRetry` hook, once per retry.
 */
export interface RetryEvent {
  /** 1-based number of the retry being scheduled. */
  attempt: number;
  /** The actual wait before the retry, including a server-specified Retry-After. */
  waitMs: number;
  /** The request path (as passed to `request()`). */
  path: string;
  /** The failed attempt's HTTP status, or `"network"` for a transport-level failure. */
  status: number | "network";
  /** The error that triggered the retry. */
  error: Error;
}

/**
 * Retry context for retry handler
 */
export interface RetryContext {
  attempt: number;
  error: Error;
  request: FetchRequest;
  response?: FetchResponse;
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  url?: string;
  token?: string;
  enabled?: boolean;
}

/**
 * Figma API client configuration
 */
export interface FigmaApiClientConfig {
  apiToken?: string;
  baseUrl?: string;
  logger?: Logger;
  /**
   * Default per-request timeout in ms. `0` disables the timeout entirely
   * (no timer is armed). Individual calls can override via
   * `options.timeout`. Defaults to 30,000.
   */
  timeout?: number;
  /**
   * Structural retry observability: called once per retry with the attempt
   * number, actual wait, request path and failure cause. A throwing callback
   * never aborts the retry loop.
   */
  onRetry?: (event: RetryEvent) => void;
  rateLimiter?: RateLimiterConfig | null;
  cache?: CacheConfig | null;
  retry?: RetryConfig;
  proxy?: ProxyConfig;
  /**
   * App egress contract (R2): an HTTP/HTTPS proxy URL. When set (or when
   * `FIGMA_PROXY_URL` is in the environment) the client uses the
   * proxy/TLS-aware transport. Empty string / undefined → no proxy.
   */
  proxyUrl?: string | null;
  /**
   * App egress contract (R2): toggle TLS certificate verification. Defaults to
   * `true` (or `FIGMA_SSL_VERIFY`). Setting `false` routes through the
   * proxy/TLS-aware transport even without a proxy.
   */
  sslVerify?: boolean;
  fetchAdapter?: any; // Will be typed as FetchAdapter in implementation
}

/**
 * Request interceptor function
 */
export type RequestInterceptor = (
  request: FetchRequest,
) => Promise<FetchRequest> | FetchRequest;

/**
 * Response interceptor function
 */
export type ResponseInterceptor = (
  response: FetchResponse,
) => Promise<FetchResponse> | FetchResponse;

/**
 * Error interceptor function
 */
export type ErrorInterceptor = (error: Error) => Promise<never> | never;

/**
 * Client statistics
 */
export interface ClientStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cachedResponses: number;
  retries: number;
  avgResponseTime: number;
  lastRequestTime: string | null;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  timestamp: string;
  error?: string;
  /** Round-trip latency of the probe call, in milliseconds. */
  latencyMs?: number;
  /** The authenticated user payload (`GET /v1/me`) when the probe succeeds. */
  user?: any;
}

/**
 * Figma API error metadata
 */
export interface FigmaErrorMeta {
  status?: number;
  statusText?: string;
  url?: string;
  headers?: Headers;
  [key: string]: any;
}

/**
 * Error codes for Figma API errors
 */
export enum ErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  AUTH_ERROR = "AUTH_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  SERVER_ERROR = "SERVER_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

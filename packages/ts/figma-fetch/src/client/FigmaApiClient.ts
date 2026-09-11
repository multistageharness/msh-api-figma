/**
 * Base Figma API client using composable fetch adapter
 * Integrates rate limiting, caching, retry logic, and error handling
 */

import { NativeFetchAdapter } from "../adapters/NativeFetchAdapter.js";
import { ProxyTlsFetchAdapter } from "../adapters/ProxyTlsFetchAdapter.js";
import { UndiciFetchAdapter } from "../adapters/UndiciFetchAdapter.js";
import type { FetchAdapter } from "../core/FetchAdapter.js";
import {
  AuthenticationError,
  createErrorFromResponse,
} from "../errors/index.js";
import type {
  ClientStats,
  ErrorInterceptor,
  FetchRequest,
  FetchResponse,
  FigmaApiClientConfig,
  HealthCheckResult,
  Logger,
  RequestInterceptor,
  ResponseInterceptor,
  RetryEvent,
} from "../types/index.js";
import { FigmaFetchError } from "../errors/index.js";
import { RateLimiter } from "../utils/RateLimiter.js";
import { RequestCache } from "../utils/RequestCache.js";
import { RetryHandler } from "../utils/RetryHandler.js";
import {
  egressNeedsProxyAdapter,
  FIGMA_TOKEN_HEADER,
  resolveBaseUrl,
  resolveEgress,
  resolveFigmaToken,
} from "./config.js";

/**
 * Default console logger
 */
const defaultLogger: Logger = {
  debug: (...args) => console.debug("[FigmaApiClient]", ...args),
  info: (...args) => console.info("[FigmaApiClient]", ...args),
  warn: (...args) => console.warn("[FigmaApiClient]", ...args),
  error: (...args) => console.error("[FigmaApiClient]", ...args),
};

/**
 * FigmaApiClient base class
 * Provides common functionality for Figma API clients
 */
export class FigmaApiClient {
  protected apiToken: string;
  protected baseUrl: string;
  protected logger: Logger;
  protected timeout: number;
  protected fetchAdapter: FetchAdapter;
  protected rateLimiter: RateLimiter | null;
  protected cache: RequestCache | null;
  protected retryHandler: RetryHandler;
  protected onRetry?: (event: RetryEvent) => void;
  protected stats: ClientStats;
  protected requestInterceptors: RequestInterceptor[] = [];
  protected responseInterceptors: ResponseInterceptor[] = [];
  protected errorInterceptors: ErrorInterceptor[] = [];

  constructor(config: FigmaApiClientConfig = {}) {
    // Resolve the API token through the one shared chain (R3):
    // config.apiToken || FIGMA_TOKEN || FIGMA_API_TOKEN || FIGMA_ACCESS_TOKEN.
    this.apiToken = resolveFigmaToken(config.apiToken);
    if (!this.apiToken) {
      throw new AuthenticationError(
        "API token is required. Provide via config.apiToken or one of FIGMA_TOKEN / FIGMA_API_TOKEN / FIGMA_ACCESS_TOKEN",
      );
    }

    this.baseUrl = resolveBaseUrl(config.baseUrl);
    this.logger = config.logger || defaultLogger;
    // `??` so a caller can set `timeout: 0` (= no timeout).
    this.timeout = config.timeout ?? 30000;
    this.onRetry = config.onRetry;

    // Resolve the egress contract (R2): FIGMA_PROXY_URL / FIGMA_SSL_VERIFY,
    // overridable by explicit config.proxyUrl / config.sslVerify.
    const egress = resolveEgress({
      proxyUrl: config.proxyUrl,
      sslVerify: config.sslVerify,
    });

    // Initialize fetch adapter. Adapter selection, highest precedence first:
    //   1. an explicitly injected adapter
    //   2. the proxy/TLS-aware transport when the egress contract requires it
    //      (FIGMA_PROXY_URL set, or TLS verification disabled)
    //   3. undici for a generic HTTP_PROXY / ProxyConfig
    //   4. native fetch (default)
    if (config.fetchAdapter) {
      this.fetchAdapter = config.fetchAdapter;
    } else if (egressNeedsProxyAdapter(egress)) {
      this.fetchAdapter = new ProxyTlsFetchAdapter(egress);
    } else if (config.proxy?.url || process.env.HTTP_PROXY) {
      // Use undici for generic proxy support
      this.fetchAdapter = new UndiciFetchAdapter(config.proxy);
    } else {
      // Use native fetch by default
      this.fetchAdapter = new NativeFetchAdapter();
    }

    // Initialize optional utilities
    this.rateLimiter =
      config.rateLimiter !== null && config.rateLimiter !== undefined
        ? new RateLimiter(config.rateLimiter)
        : null;

    this.cache =
      config.cache !== null && config.cache !== undefined
        ? new RequestCache(config.cache)
        : null;

    this.retryHandler = new RetryHandler(config.retry);

    // Initialize stats
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedResponses: 0,
      retries: 0,
      avgResponseTime: 0,
      lastRequestTime: null,
    };
  }

  /**
   * Make HTTP request to Figma API
   */
  async request<T = any>(
    path: string,
    options: Partial<FetchRequest> = {},
  ): Promise<T> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    const method = options.method || "GET";

    // Update stats
    this.stats.totalRequests++;
    this.stats.lastRequestTime = new Date().toISOString();

    try {
      // Check rate limits
      if (this.rateLimiter) {
        await this.rateLimiter.checkLimit();
      }

      // Check cache for GET requests
      if (method === "GET" && this.cache) {
        const cached = this.cache.get(url, options);
        if (cached !== null) {
          this.stats.cachedResponses++;
          this.logger.debug(`Cache hit for ${method} ${path}`);
          return cached;
        }
      }

      // Prepare request
      let request: FetchRequest = {
        url,
        method,
        headers: {
          [FIGMA_TOKEN_HEADER]: this.apiToken,
          "Content-Type": "application/json",
          "User-Agent": "figma-api-fetch/1.0.0",
          Accept: "application/json",
          ...options.headers,
        },
        body: options.body,
        // An explicit per-request timeout wins over the client default; the
        // caller's AbortSignal (if any) composes with it in the adapter.
        timeout: options.timeout ?? this.timeout,
        signal: options.signal,
      };

      // Apply request interceptors
      for (const interceptor of this.requestInterceptors) {
        request = await interceptor(request);
      }

      // Execute request with retry logic
      const response = await this.retryHandler.execute<FetchResponse<T>>(
        async () => {
          const res = await this.fetchAdapter.fetch<T>(request);

          // Check for HTTP errors
          if (!res.ok) {
            throw createErrorFromResponse({
              status: res.status,
              statusText: res.statusText,
              data: res.data,
              headers: res.headers,
              url,
              rawBody: res.rawBody,
            });
          }

          return res;
        },
        (attempt, delay, error) => {
          this.stats.retries++;
          this.logger.debug(
            `Retrying request after ${delay}ms (attempt ${attempt + 1}/${this.retryHandler.getConfig().maxRetries})`,
            { error: error.message },
          );
          if (this.onRetry) {
            const status =
              error instanceof FigmaFetchError &&
              typeof error.meta?.status === "number"
                ? error.meta.status
                : ("network" as const);
            try {
              this.onRetry({
                attempt: attempt + 1,
                waitMs: delay,
                path,
                status,
                error,
              });
            } catch {
              // An observer must never abort the retry loop.
            }
          }
        },
      );

      // Apply response interceptors
      let finalResponse = response;
      for (const interceptor of this.responseInterceptors) {
        finalResponse = await interceptor(finalResponse);
      }

      // Cache successful GET responses
      if (method === "GET" && this.cache) {
        this.cache.set(url, finalResponse.data, options);
      }

      // Update stats
      this.stats.successfulRequests++;
      this.updateResponseTime(startTime);

      this.logger.debug(`Request successful: ${method} ${path}`);
      return finalResponse.data;
    } catch (error: any) {
      this.stats.failedRequests++;
      this.updateResponseTime(startTime);

      this.logger.error(`Request failed: ${method} ${path}`, {
        error: error.message,
        duration: Date.now() - startTime,
      });

      // Apply error interceptors
      for (const interceptor of this.errorInterceptors) {
        await interceptor(error);
      }

      throw error;
    }
  }

  /**
   * Make GET request with query parameters.
   * `options` (e.g. `{ timeout, signal }`) applies to this call only.
   */
  async get<T = any>(
    path: string,
    params: Record<string, any> = {},
    options: Partial<FetchRequest> = {},
  ): Promise<T> {
    const searchParams = new URLSearchParams();

    // Add non-null/undefined parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;

    return this.request<T>(fullPath, { ...options, method: "GET" });
  }

  /**
   * Make POST request with JSON body.
   * `options` (e.g. `{ timeout, signal }`) applies to this call only.
   */
  async post<T = any>(
    path: string,
    data: any = {},
    options: Partial<FetchRequest> = {},
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Make PUT request with JSON body.
   * `options` (e.g. `{ timeout, signal }`) applies to this call only.
   */
  async put<T = any>(
    path: string,
    data: any = {},
    options: Partial<FetchRequest> = {},
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  /**
   * Make PATCH request with JSON body.
   * `options` (e.g. `{ timeout, signal }`) applies to this call only.
   */
  async patch<T = any>(
    path: string,
    data: any = {},
    options: Partial<FetchRequest> = {},
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /**
   * Make DELETE request.
   * `options` (e.g. `{ timeout, signal }`) applies to this call only.
   */
  async delete<T = any>(
    path: string,
    options: Partial<FetchRequest> = {},
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  /**
   * Get the authenticated user (`GET /v1/me`) (R9).
   *
   * Public counterpart to the internal `healthCheck` probe — consumers building
   * a connection panel or latency badge can call this directly instead of
   * reaching for a private endpoint.
   */
  async getMe<T = any>(): Promise<T> {
    return this.get<T>("/v1/me");
  }

  /**
   * Health check endpoint. Probes `GET /v1/me` and reports latency so a caller
   * (e.g. `connectFigma`) can render a latency-aware status badge (R9).
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const user = await this.getMe();
      return {
        status: "healthy",
        latencyMs: Date.now() - startTime,
        user,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: "unhealthy",
        error: error.message,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get client statistics
   */
  getStats(): ClientStats & {
    rateLimiter?: any;
    cache?: any;
  } {
    const stats: any = { ...this.stats };

    if (this.rateLimiter) {
      stats.rateLimiter = this.rateLimiter.getStats();
    }

    if (this.cache) {
      stats.cache = this.cache.getStats();
    }

    return stats;
  }

  /**
   * Reset client statistics and cache
   */
  reset(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedResponses: 0,
      retries: 0,
      avgResponseTime: 0,
      lastRequestTime: null,
    };

    if (this.cache) {
      this.cache.clear();
    }

    if (this.rateLimiter) {
      this.rateLimiter.reset();
    }
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  /**
   * Update average response time
   */
  private updateResponseTime(startTime: number): void {
    const duration = Date.now() - startTime;
    const totalRequests =
      this.stats.successfulRequests + this.stats.failedRequests;

    if (totalRequests === 1) {
      this.stats.avgResponseTime = duration;
    } else {
      this.stats.avgResponseTime =
        (this.stats.avgResponseTime * (totalRequests - 1) + duration) /
        totalRequests;
    }
  }
}

export default FigmaApiClient;

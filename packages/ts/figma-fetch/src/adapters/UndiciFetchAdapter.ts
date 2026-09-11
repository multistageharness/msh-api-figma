/**
 * Undici fetch adapter implementation
 * Uses undici's fetch with support for proxy configuration
 */

import { FetchAdapter } from "../core/FetchAdapter.js";
import { NetworkError, TimeoutError } from "../errors/index.js";
import type {
  FetchRequest,
  FetchResponse,
  ProxyConfig,
} from "../types/index.js";

// Undici imports (will be dynamically imported to make it optional)
let undici: any = null;
let ProxyAgent: any = null;

/**
 * Adapter that uses undici fetch with proxy support
 */
export class UndiciFetchAdapter extends FetchAdapter {
  private proxyAgent: any = null;
  private proxyConfig: ProxyConfig;

  constructor(proxyConfig: ProxyConfig = {}) {
    super();
    this.proxyConfig = {
      url: proxyConfig.url || process.env.HTTP_PROXY,
      token: proxyConfig.token || process.env.HTTP_PROXY_TOKEN,
      enabled: proxyConfig.enabled !== false, // Default to enabled
    };

    this.initializeProxy();
  }

  /**
   * Initialize proxy agent if configured
   */
  private async initializeProxy(): Promise<void> {
    if (!this.proxyConfig.enabled || !this.proxyConfig.url) {
      return;
    }

    try {
      // Dynamically import undici
      if (!undici) {
        undici = await import("undici");
        ProxyAgent = undici.ProxyAgent;
      }

      // Create proxy agent
      if (this.proxyConfig.token) {
        this.proxyAgent = new ProxyAgent({
          uri: this.proxyConfig.url,
          token: this.proxyConfig.token,
        });
      } else {
        this.proxyAgent = new ProxyAgent(this.proxyConfig.url);
      }
    } catch (error) {
      console.error("Failed to initialize undici proxy:", error);
      this.proxyAgent = null;
    }
  }

  /**
   * Execute fetch request using undici
   */
  async fetch<T = any>(request: FetchRequest): Promise<FetchResponse<T>> {
    // Ensure undici is loaded
    if (!undici) {
      undici = await import("undici");
    }

    const transformedRequest = this.transformRequest(request);
    const {
      url,
      method = "GET",
      headers,
      body,
      signal,
      timeout,
    } = transformedRequest;

    // Compose the caller's signal with the request timeout: whichever fires
    // first aborts, and didTimeout() tells the two apart.
    const ctx = this.createTimeoutContext(signal, timeout);

    try {
      // Prepare fetch options
      const fetchOptions: any = {
        method,
        headers: headers as HeadersInit,
        body: body as BodyInit,
        signal: ctx.signal,
      };

      // Add proxy dispatcher if configured
      if (this.proxyAgent) {
        fetchOptions.dispatcher = this.proxyAgent;
      }

      // Execute undici fetch
      const response = await undici.fetch(url, fetchOptions);

      // Parse response, keeping the raw text for error context
      const contentType = response.headers.get("content-type");
      const { data, rawText } = await this.readResponseBody(
        response,
        contentType,
      );

      // Create FetchResponse
      const fetchResponse: FetchResponse<T> = {
        status: response.status,
        statusText: response.statusText,
        headers: this.headersToObject(response.headers),
        data,
        ok: response.ok,
        rawBody: rawText,
      };

      return this.transformResponse(fetchResponse);
    } catch (error: any) {
      // A timeout-triggered abort becomes TimeoutError; a caller-triggered
      // abort propagates unchanged so it stays distinguishable.
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        if (ctx.didTimeout()) {
          throw new TimeoutError(timeout || 30000);
        }
        throw error;
      }
      if (error.code === "UND_ERR_CONNECT_TIMEOUT") {
        throw new TimeoutError(timeout || 30000);
      }

      // Transient socket failures are network errors (retryable)
      if (this.isTransientSocketError(error)) {
        throw new NetworkError("Network request failed", error);
      }

      // Handle network errors
      if (
        error.name === "TypeError" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND" ||
        error.code === "ETIMEDOUT" ||
        error.message?.includes("fetch")
      ) {
        throw new NetworkError("Network request failed", error);
      }

      // Re-throw other errors
      throw error;
    } finally {
      ctx.cleanup();
    }
  }

  /**
   * Get current proxy configuration
   */
  getProxyConfig(): ProxyConfig {
    return { ...this.proxyConfig };
  }

  /**
   * Update proxy configuration
   */
  setProxyConfig(config: ProxyConfig): void {
    this.proxyConfig = {
      ...this.proxyConfig,
      ...config,
    };
    this.initializeProxy();
  }
}

export default UndiciFetchAdapter;

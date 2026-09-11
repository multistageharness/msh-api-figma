/**
 * Native fetch adapter implementation
 * Uses the native fetch API available in Node.js 18+ and browsers
 */

import { FetchAdapter } from "../core/FetchAdapter.js";
import { NetworkError, TimeoutError } from "../errors/index.js";
import type { FetchRequest, FetchResponse } from "../types/index.js";

/**
 * Adapter that uses native fetch API
 */
export class NativeFetchAdapter extends FetchAdapter {
  /**
   * Execute fetch request using native fetch
   */
  async fetch<T = any>(request: FetchRequest): Promise<FetchResponse<T>> {
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
      // Execute native fetch
      const response = await fetch(url, {
        method,
        headers: headers as HeadersInit,
        body: body as BodyInit,
        signal: ctx.signal,
      });

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

      // Transient socket failures are network errors (retryable)
      if (this.isTransientSocketError(error)) {
        throw new NetworkError("Network request failed", error);
      }

      // Handle network errors
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new NetworkError("Network request failed", error);
      }

      // Re-throw other errors
      throw error;
    } finally {
      ctx.cleanup();
    }
  }
}

export default NativeFetchAdapter;

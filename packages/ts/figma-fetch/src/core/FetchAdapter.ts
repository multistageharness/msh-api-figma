/**
 * Abstract base class for fetch adapters
 * Allows different fetch implementations (native fetch, undici, axios, etc.)
 */

import type { FetchRequest, FetchResponse } from "../types/index.js";

/**
 * Abstract FetchAdapter class
 * Implement this class to create custom fetch adapters
 */
export abstract class FetchAdapter {
  /**
   * Execute a fetch request
   * @param request - The request configuration
   * @returns Promise resolving to the response
   */
  abstract fetch<T = any>(request: FetchRequest): Promise<FetchResponse<T>>;

  /**
   * Optional: Transform request before execution
   * Override this method to add custom request transformations
   * @param request - The original request
   * @returns The transformed request
   */
  protected transformRequest(request: FetchRequest): FetchRequest {
    return request;
  }

  /**
   * Optional: Transform response after execution
   * Override this method to add custom response transformations
   * @param response - The original response
   * @returns The transformed response
   */
  protected transformResponse<T>(response: FetchResponse<T>): FetchResponse<T> {
    return response;
  }

  /**
   * Helper: Create a timeout signal
   * @param timeout - Timeout in milliseconds
   * @returns AbortSignal that will abort after timeout
   * @deprecated Use {@link FetchAdapter.createTimeoutContext} — it composes
   * with a caller signal and does not leave its timer armed after settle.
   */
  protected createTimeoutSignal(timeout: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  }

  /**
   * Helper: Compose a caller-supplied AbortSignal with a request timeout.
   *
   * The returned `signal` aborts on whichever fires first — the caller's abort
   * or the timeout. `didTimeout()` distinguishes the two so a timeout maps to
   * `TimeoutError` while a caller abort propagates as-is. Callers MUST invoke
   * `cleanup()` once the request settles so no timer stays armed.
   *
   * @param signal - Optional caller-supplied signal
   * @param timeout - Optional timeout in ms; `0`/absent arms no timer
   */
  protected createTimeoutContext(
    signal?: AbortSignal,
    timeout?: number,
  ): {
    signal?: AbortSignal;
    didTimeout: () => boolean;
    cleanup: () => void;
  } {
    if (!timeout) {
      return { signal, didTimeout: () => false, cleanup: () => {} };
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    const onCallerAbort = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener("abort", onCallerAbort, { once: true });
      }
    }

    return {
      signal: controller.signal,
      didTimeout: () => timedOut,
      cleanup: () => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onCallerAbort);
      },
    };
  }

  /**
   * Helper: Whether an error is a transient socket-level failure
   * (`ECONNRESET` / `UND_ERR_SOCKET`), checked on the error itself and on its
   * `cause` (native/undici fetch wraps transport errors in a TypeError whose
   * cause carries the code). Adapters convert these to `NetworkError` so the
   * retry layer treats them as retryable.
   */
  protected isTransientSocketError(error: any): boolean {
    const codes = ["ECONNRESET", "UND_ERR_SOCKET"];
    return (
      codes.includes(error?.code) || codes.includes((error?.cause as any)?.code)
    );
  }

  /**
   * Helper: Parse response based on content type
   * @param response - Response object with text() or json() methods
   * @param contentType - Content-Type header value
   * @returns Parsed response data
   */
  protected async parseResponseData(
    response: {
      json: () => Promise<any>;
      text: () => Promise<string>;
      arrayBuffer: () => Promise<ArrayBuffer>;
    },
    contentType: string | null,
  ): Promise<any> {
    const { data } = await this.readResponseBody(response, contentType);
    return data;
  }

  /**
   * Helper: Parse the response body while preserving the raw text.
   *
   * `data` keeps exactly the shape `parseResponseData` always produced (null
   * for no content-type or unparseable JSON, parsed JSON, text, arrayBuffer),
   * while `rawText` carries the body text whenever it was textual — so an
   * error path can still say what the server actually sent (an HTML gateway
   * page, a body with no content-type) even when `data` is null.
   */
  protected async readResponseBody(
    response: {
      json: () => Promise<any>;
      text: () => Promise<string>;
      arrayBuffer: () => Promise<ArrayBuffer>;
    },
    contentType: string | null,
  ): Promise<{ data: any; rawText: string | null }> {
    if (!contentType) {
      const text = await response.text().catch(() => "");
      return { data: null, rawText: text || null };
    }

    if (contentType.includes("application/json")) {
      const text = await response.text().catch(() => "");
      try {
        return { data: JSON.parse(text), rawText: text };
      } catch {
        return { data: null, rawText: text || null };
      }
    }

    if (contentType.includes("text/")) {
      const text = await response.text();
      return { data: text, rawText: text };
    }

    return { data: await response.arrayBuffer(), rawText: null };
  }

  /**
   * Helper: Convert Headers object to plain object
   * @param headers - Headers object or plain object
   * @returns Plain object with header key-value pairs
   */
  protected headersToObject(headers: any): Record<string, string> {
    if (!headers) {
      return {};
    }

    // If headers has entries method (like native Headers)
    if (typeof headers.entries === "function") {
      const obj: Record<string, string> = {};
      for (const [key, value] of headers.entries()) {
        obj[key] = value;
      }
      return obj;
    }

    // If headers is already a plain object
    if (typeof headers === "object") {
      return headers as Record<string, string>;
    }

    return {};
  }
}

export default FetchAdapter;

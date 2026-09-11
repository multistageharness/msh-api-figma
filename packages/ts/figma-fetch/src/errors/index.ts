/**
 * Error classes for figma-fetch module
 */

import { ErrorCode, type FigmaErrorMeta } from "../types/index.js";

/**
 * Base error class for all Figma API errors
 */
export class FigmaFetchError extends Error {
  public readonly code: ErrorCode;
  public readonly meta: FigmaErrorMeta;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    meta: FigmaErrorMeta = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.meta = meta;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Whether this error is safe to retry (rate-limit / 5xx / network). Keys off
   * the same logic as the standalone `isRetryableError` so retry middleware and
   * callers agree on one definition.
   */
  get isRetryable(): boolean {
    return isRetryableError(this);
  }

  /**
   * Process exit code for CLI consumers, mapped from the error code.
   *
   * NOTE: this is the SDK's own taxonomy and it deliberately differs from the
   * downloader twins (`msh-sdk-figma-downloader/v300` `errors.mjs` /
   * `errors.py`, where server AND network both map to 6 and validation has no
   * class). The SDK keeps a finer-grained table — server (9) vs network (8)
   * stay distinct, validation gets its own code (6) — and a CLI with its own
   * documented exit-code contract translates at its boundary
   * (`ErrorCode` → CLI code) rather than inheriting these numbers. Decision
   * recorded in the figma-fetch-consolidation plan's findings (F-0001):
   * changing either published table would break existing consumers, and the
   * downloader's table is pinned by the cross-language parity contract with
   * the Python twin.
   */
  get exitCode(): number {
    return EXIT_CODE_BY_ERROR_CODE[this.code] ?? 1;
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      meta: this.meta,
      retryable: this.isRetryable,
      exitCode: this.exitCode,
      stack: this.stack,
    };
  }
}

/**
 * Canonical alias for the base error. The target architecture names the single
 * base `FigmaApiError`; downstream packages import this name and retire their
 * own per-package error trees (R4).
 */
export { FigmaFetchError as FigmaApiError };

/** Stable error-code → process-exit-code mapping for CLI consumers. */
const EXIT_CODE_BY_ERROR_CODE: Record<string, number> = {
  [ErrorCode.AUTH_ERROR]: 3,
  [ErrorCode.NOT_FOUND]: 4,
  [ErrorCode.RATE_LIMIT_ERROR]: 5,
  [ErrorCode.VALIDATION_ERROR]: 6,
  [ErrorCode.TIMEOUT_ERROR]: 7,
  [ErrorCode.NETWORK_ERROR]: 8,
  [ErrorCode.SERVER_ERROR]: 9,
  [ErrorCode.UNKNOWN_ERROR]: 1,
};

/**
 * Network error - connection failures, DNS errors, etc.
 */
export class NetworkError extends FigmaFetchError {
  constructor(message: string = "Network request failed", cause?: Error) {
    super(message, ErrorCode.NETWORK_ERROR, { cause });
  }
}

/**
 * Timeout error - request exceeded timeout limit
 */
export class TimeoutError extends FigmaFetchError {
  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`, ErrorCode.TIMEOUT_ERROR, {
      timeout,
    });
  }
}

/**
 * Rate limit error - API rate limit exceeded.
 *
 * `retryAfter` (seconds) is only set when the server sent a usable
 * `Retry-After` header; when absent, retry middleware falls back to computed
 * backoff instead of a made-up wait.
 */
export class RateLimitError extends FigmaFetchError {
  constructor(retryAfter?: number) {
    super(
      retryAfter !== undefined
        ? `Rate limit exceeded. Retry after ${retryAfter} seconds`
        : "Rate limit exceeded",
      ErrorCode.RATE_LIMIT_ERROR,
      retryAfter !== undefined ? { retryAfter } : {},
    );
  }
}

/**
 * Authentication error - invalid or missing API token
 */
export class AuthenticationError extends FigmaFetchError {
  constructor(message: string = "Authentication failed") {
    super(message, ErrorCode.AUTH_ERROR);
  }
}

/**
 * Validation error - invalid request parameters
 */
export class ValidationError extends FigmaFetchError {
  constructor(message: string, field?: string) {
    super(message, ErrorCode.VALIDATION_ERROR, { field });
  }
}

/**
 * Not found error - resource not found (404)
 */
export class NotFoundError extends FigmaFetchError {
  constructor(resource: string) {
    super(`Resource not found: ${resource}`, ErrorCode.NOT_FOUND, { resource });
  }
}

/**
 * Server error - 5xx errors from API
 */
export class ServerError extends FigmaFetchError {
  constructor(message: string, status: number) {
    super(message, ErrorCode.SERVER_ERROR, { status });
  }
}

/** Longest raw-body excerpt carried in an error message. */
const BODY_IN_MESSAGE_LIMIT = 200;

/** Longest raw body preserved on `meta.rawBody` for programmatic inspection. */
const BODY_IN_META_LIMIT = 2000;

/**
 * Parse a `Retry-After` header value into whole seconds. Only a finite,
 * positive number counts; `0`, negatives, non-numeric values and an absent
 * header all return `undefined` so retry middleware falls back to computed
 * backoff. This is the single place the header is interpreted.
 */
export function parseRetryAfterHeader(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === "") return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds;
}

/**
 * Create appropriate error from HTTP response.
 *
 * Every returned error carries the response context (`status`, `statusText`,
 * `url`, `headers`, `data`, and — when available — a bounded `rawBody`) on
 * `meta`, and a `Retry-After` header parsed once here surfaces as
 * `meta.retryAfter` on both 429 and 5xx errors so the retry layer can honour it.
 */
export function createErrorFromResponse(response: {
  status: number;
  statusText: string;
  data?: any;
  headers?: Record<string, string>;
  url?: string;
  /** Raw response text, for when `data` could not carry the explanation. */
  rawBody?: string | null;
}): FigmaFetchError {
  const { status, statusText, data, headers, url, rawBody } = response;

  const retryAfter = parseRetryAfterHeader(headers?.["retry-after"]);
  const bodyText = typeof rawBody === "string" ? rawBody : "";

  // When the parsed data has no structured explanation, fall back to the raw
  // body — a gateway's HTML error page or a body with no content-type is
  // exactly when the message matters most.
  const withBody = (base: string): string =>
    bodyText && !data?.message && !data?.error
      ? `${base}: ${bodyText.slice(0, BODY_IN_MESSAGE_LIMIT)}`
      : base;

  let error: FigmaFetchError;

  if (status === 429) {
    // Rate limit error — a usable Retry-After is threaded through; an absent
    // or malformed header leaves it unset so backoff takes over.
    error = new RateLimitError(retryAfter);
  } else if (status === 401 || status === 403) {
    error = new AuthenticationError(
      withBody(data?.message || data?.error || "Authentication failed"),
    );
  } else if (status === 404) {
    error = new NotFoundError(url || "unknown");
  } else if (status === 400 || status === 422) {
    error = new ValidationError(
      withBody(data?.message || data?.error || "Validation failed"),
    );
  } else if (status >= 500) {
    error = new ServerError(
      withBody(data?.message || data?.error || `Server error: ${statusText}`),
      status,
    );
  } else {
    error = new FigmaFetchError(
      withBody(data?.message || data?.error || `HTTP ${status}: ${statusText}`),
      ErrorCode.UNKNOWN_ERROR,
    );
  }

  const meta: FigmaErrorMeta = {
    status,
    statusText,
    url,
    headers,
    data,
  };
  if (bodyText) meta.rawBody = bodyText.slice(0, BODY_IN_META_LIMIT);
  if (retryAfter !== undefined) meta.retryAfter = retryAfter;
  Object.assign(error.meta, meta);

  return error;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof ServerError) return true;
  if (error instanceof NetworkError) return true;
  if (error instanceof TimeoutError) return false; // Don't retry timeouts by default

  return false;
}

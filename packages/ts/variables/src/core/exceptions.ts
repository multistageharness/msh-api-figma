/**
 * Custom exception classes for figma-variables-sdk
 * Provides structured error handling with context
 */

export class BaseError extends Error {
  code?: string;
  meta?: any;
  timestamp: string;

  constructor(message: string, code?: string, meta: any = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.meta = meta;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      meta: this.meta,
      timestamp: this.timestamp,
    };
  }
}

export class ApiError extends BaseError {
  constructor(message: string, code: string = "API_ERROR", meta: any = {}) {
    super(message, code, meta);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, field?: any, value?: any) {
    super(message, "VALIDATION_ERROR", { field, value });
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = "Authentication failed") {
    super(message, "AUTH_ERROR");
  }
}

export class EnterpriseAccessError extends BaseError {
  constructor(
    message: string = "This API is only available to full members of Enterprise organizations",
  ) {
    super(message, "ENTERPRISE_ACCESS_ERROR");
  }
}

export class ScopeError extends BaseError {
  constructor(requiredScope: string, message: string | null = null) {
    const msg = message || `Missing required scope: ${requiredScope}`;
    super(msg, "SCOPE_ERROR", { requiredScope });
  }
}

export class RateLimitError extends BaseError {
  retryAfter?: number;

  constructor(retryAfter: number, limit: any = null) {
    super("Rate limit exceeded", "RATE_LIMIT", { retryAfter, limit });
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends BaseError {
  originalError?: any;

  constructor(message: string, originalError: any = null) {
    super(message, "NETWORK_ERROR", { originalError: originalError?.message });
    this.originalError = originalError;
  }
}

export class TimeoutError extends BaseError {
  constructor(timeout: number, operation?: any) {
    super(`Operation timed out after ${timeout}ms`, "TIMEOUT", {
      timeout,
      operation,
    });
  }
}

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: any) {
    super(`${resource} not found`, "NOT_FOUND", { resource, identifier });
  }
}

export class ConfigurationError extends BaseError {
  constructor(message: string, config?: any) {
    super(message, "CONFIG_ERROR", { config });
  }
}

export class VariableError extends BaseError {
  constructor(message: string, variableId: any = null, operation: any = null) {
    super(message, "VARIABLE_ERROR", { variableId, operation });
  }
}

export class CollectionError extends BaseError {
  constructor(
    message: string,
    collectionId: any = null,
    operation: any = null,
  ) {
    super(message, "COLLECTION_ERROR", { collectionId, operation });
  }
}

export class VariableLimitError extends BaseError {
  constructor(limit: number, current: number) {
    super(
      `Variable limit exceeded: ${current}/${limit}`,
      "VARIABLE_LIMIT_ERROR",
      { limit, current },
    );
  }
}

export class ModeLimitError extends BaseError {
  constructor(limit: number = 40) {
    super(
      `Mode limit exceeded: maximum ${limit} modes per collection`,
      "MODE_LIMIT_ERROR",
      { limit },
    );
  }
}

export class AliasError extends BaseError {
  constructor(message: string, aliasId: any = null, targetId: any = null) {
    super(message, "ALIAS_ERROR", { aliasId, targetId });
  }
}

/**
 * Alias for backward compatibility
 */
export { BaseError as FigmaApiError };

/**
 * Utility function to create appropriate error from HTTP response
 * @param {Response} response - Fetch API response object
 * @param {string} url - Request URL
 * @param {any} responseData - Parsed response data
 * @returns {BaseError} Appropriate error instance
 */
export function createErrorFromResponse(
  response: any,
  url: string,
  _responseData: any = null,
): BaseError {
  const { status, statusText } = response;

  // Handle specific status codes
  switch (status) {
    case 401:
      return new AuthenticationError("Invalid or missing API token");

    case 403:
      return new EnterpriseAccessError();

    case 404:
      return new NotFoundError("Resource", url);

    case 429: {
      const retryAfter = response.headers.get("Retry-After") || "60";
      return new RateLimitError(parseInt(retryAfter, 10));
    }

    default:
      return new ApiError(`HTTP ${status}: ${statusText}`, "HTTP_ERROR");
  }
}

/**
 * Utility function to determine if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof TimeoutError) {
    return true;
  }

  return false;
}

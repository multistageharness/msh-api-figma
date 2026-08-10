/**
 * Custom error classes for Figma Projects API operations
 * Provides structured error handling with context and error codes
 */

/**
 * Base error class for all Figma Projects API errors
 */
export class FigmaProjectsError extends Error {
  code: string;
  meta: Record<string, any>;
  timestamp: string;

  /**
   * @param {string} message - Error message
   * @param {string} code - Error code for programmatic handling
   * @param {object} meta - Additional error metadata
   */
  constructor(message: string, code: string, meta: Record<string, any> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.meta = meta;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Convert error to JSON for logging/serialization
   * @returns {object} Serializable error object
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      meta: this.meta,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends FigmaProjectsError {
  constructor(message: string, meta: Record<string, any> = {}) {
    super(message, 'AUTHENTICATION_ERROR', meta);
  }
}

/**
 * API rate limiting errors
 */
export class RateLimitError extends FigmaProjectsError {
  retryAfter: number;

  constructor(retryAfter: number, meta: Record<string, any> = {}) {
    super(
      `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      'RATE_LIMIT_EXCEEDED',
      { retryAfter, ...meta }
    );
    this.retryAfter = retryAfter;
  }
}

/**
 * Network and connectivity errors
 */
export class NetworkError extends FigmaProjectsError {
  originalError: any;

  constructor(message: string, originalError: any, meta: Record<string, any> = {}) {
    super(message, 'NETWORK_ERROR', { originalError: originalError?.message, ...meta });
    this.originalError = originalError;
  }
}

/**
 * API response parsing and validation errors
 */
export class ValidationError extends FigmaProjectsError {
  field: any;
  value: any;

  constructor(message: string, field: any, value: any, meta: Record<string, any> = {}) {
    super(message, 'VALIDATION_ERROR', { field, value, ...meta });
    this.field = field;
    this.value = value;
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends FigmaProjectsError {
  resource: any;
  identifier: any;

  constructor(resource: any, identifier: any, meta: Record<string, any> = {}) {
    super(
      `${resource} not found: ${identifier}`,
      'RESOURCE_NOT_FOUND',
      { resource, identifier, ...meta }
    );
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Permission and access errors
 */
export class PermissionError extends FigmaProjectsError {
  resource: any;
  action: any;

  constructor(message: string, resource: any, action: any, meta: Record<string, any> = {}) {
    super(message, 'PERMISSION_DENIED', { resource, action, ...meta });
    this.resource = resource;
    this.action = action;
  }
}

/**
 * HTTP status code errors
 */
export class HttpError extends FigmaProjectsError {
  status: number;
  statusText: any;
  url: any;
  responseData: any;

  constructor(status: number, statusText: any, url: any, responseData: any, meta: Record<string, any> = {}) {
    super(
      `HTTP ${status}: ${statusText}`,
      'HTTP_ERROR',
      { status, statusText, url, responseData, ...meta }
    );
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.responseData = responseData;
  }

  /**
   * Check if error is a specific HTTP status
   * @param {number} status - HTTP status code to check
   * @returns {boolean} True if error matches status
   */
  isStatus(status: number): boolean {
    return this.status === status;
  }

  /**
   * Check if error is a client error (4xx)
   * @returns {boolean} True if client error
   */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Check if error is a server error (5xx)
   * @returns {boolean} True if server error
   */
  isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }
}

/**
 * Configuration and initialization errors
 */
export class ConfigurationError extends FigmaProjectsError {
  configField: any;

  constructor(message: string, configField: any, meta: Record<string, any> = {}) {
    super(message, 'CONFIGURATION_ERROR', { configField, ...meta });
    this.configField = configField;
  }
}

/**
 * Request timeout errors
 */
export class TimeoutError extends FigmaProjectsError {
  timeout: number;
  operation: any;

  constructor(timeout: number, operation: any, meta: Record<string, any> = {}) {
    super(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'TIMEOUT_ERROR',
      { timeout, operation, ...meta }
    );
    this.timeout = timeout;
    this.operation = operation;
  }
}

/**
 * Utility function to create appropriate error from HTTP response
 * @param {Response} response - Fetch API response object
 * @param {string} url - Request URL
 * @param {any} responseData - Parsed response data
 * @returns {FigmaProjectsError} Appropriate error instance
 */
export function createErrorFromResponse(response: any, url: string, responseData: any = null): FigmaProjectsError {
  const { status, statusText } = response;

  // Handle specific status codes
  switch (status) {
    case 401:
      return new AuthenticationError(
        'Invalid or missing API token',
        { status, url, responseData }
      );

    case 403:
      return new PermissionError(
        'Insufficient permissions for this operation',
        'unknown',
        'read',
        { status, url, responseData }
      );

    case 404:
      return new NotFoundError(
        'Resource',
        'unknown',
        { status, url, responseData }
      );

    case 429: {
      const retryAfter = response.headers.get('Retry-After') || '60';
      return new RateLimitError(parseInt(retryAfter, 10), { status, url, responseData });
    }

    case 500:
    case 502:
    case 503:
    case 504:
      return new HttpError(status, statusText, url, responseData, {
        category: 'server_error',
        retryable: true
      });

    default:
      return new HttpError(status, statusText, url, responseData);
  }
}

/**
 * Utility function to determine if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof HttpError) {
    return error.isServerError() || error.isStatus(408) || error.isStatus(429);
  }

  if (error instanceof TimeoutError) {
    return true;
  }

  return false;
}

/**
 * Utility function to get retry delay for an error
 * @param {Error} error - Error to get retry delay for
 * @param {number} attempt - Current retry attempt (0-based)
 * @returns {number} Delay in milliseconds
 */
export function getRetryDelay(error: Error, attempt: number): number {
  if (error instanceof RateLimitError) {
    return error.retryAfter * 1000;
  }

  // Exponential backoff with jitter
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // 0-1 second jitter

  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Alias for backward compatibility
 */
export { FigmaProjectsError as FigmaApiError };

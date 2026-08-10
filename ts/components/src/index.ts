/**
 * Figma Components API - Main Entry Point
 * Exports all public interfaces for the library
 */

// Core exports
export { FigmaComponentsService } from './core/service.js';

// Interface exports
export { FigmaComponentsSDK } from './interfaces/sdk.js';

// Exception exports
export {
  FigmaApiError,
  RateLimitError,
  AuthenticationError,
  AuthorizationError,
  TeamNotFoundError,
  FileNotFoundError,
  ComponentNotFoundError,
  ComponentSetNotFoundError,
  StyleNotFoundError,
  ValidationError,
  NetworkError,
  HttpError,
  ServerError,
  TimeoutError,
  PaginationError,
  ScopeError,
  createErrorFromResponse,
  isRetryableError
} from './core/exceptions.js';

// Default export for convenience
export { FigmaComponentsSDK as default } from './interfaces/sdk.js';

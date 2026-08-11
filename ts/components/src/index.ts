/**
 * Figma Components API - Main Entry Point
 * Exports all public interfaces for the library
 */

// Exception exports
export {
  AuthenticationError,
  AuthorizationError,
  ComponentNotFoundError,
  ComponentSetNotFoundError,
  createErrorFromResponse,
  FigmaApiError,
  FileNotFoundError,
  HttpError,
  isRetryableError,
  NetworkError,
  PaginationError,
  RateLimitError,
  ScopeError,
  ServerError,
  StyleNotFoundError,
  TeamNotFoundError,
  TimeoutError,
  ValidationError,
} from "./core/exceptions.js";
// Core exports
export { FigmaComponentsService } from "./core/service.js";
// Interface exports
// Default export for convenience
export {
  FigmaComponentsSDK,
  FigmaComponentsSDK as default,
} from "./interfaces/sdk.js";

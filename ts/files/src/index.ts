/**
 * Figma Files API - Main Entry Point
 * Exports all public interfaces for the library
 */

// Core exports
export { FigmaFilesService } from './core/service.js';

// Interface exports
export { FigmaFilesSDK } from './interfaces/sdk.js';

// Exception exports
export {
  FigmaApiError,
  RateLimitError,
  AuthenticationError,
  AuthorizationError,
  FileNotFoundError,
  NodeNotFoundError,
  ValidationError,
  NetworkError,
  HttpError,
  ServerError,
  TimeoutError,
  createErrorFromResponse,
  isRetryableError
} from './core/exceptions.js';

// Default export for convenience
export { FigmaFilesSDK as default } from './interfaces/sdk.js';

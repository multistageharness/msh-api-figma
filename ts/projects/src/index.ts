/**
 * Main entry point for figma-projects module
 * Exports all public APIs and utilities
 */

// Core components
export { default as FigmaProjectsService } from './core/service.js';

// High-level SDK
export { default as FigmaProjectsSDK } from './interfaces/sdk.js';

// Exception classes
export {
  FigmaProjectsError,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  ValidationError,
  NotFoundError,
  PermissionError,
  HttpError,
  ConfigurationError,
  TimeoutError,
  createErrorFromResponse,
  isRetryableError,
  getRetryDelay
} from './core/exceptions.js';

// Default export is the SDK for convenience
export { default } from './interfaces/sdk.js';

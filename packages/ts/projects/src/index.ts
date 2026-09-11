/**
 * Main entry point for figma-projects module
 * Exports all public APIs and utilities
 */

// Exception classes
export {
  AuthenticationError,
  ConfigurationError,
  createErrorFromResponse,
  FigmaProjectsError,
  getRetryDelay,
  HttpError,
  isRetryableError,
  NetworkError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "./core/exceptions.js";
// Core components
export { default as FigmaProjectsService } from "./core/service.js";
// High-level SDK
// Default export is the SDK for convenience
export { default as FigmaProjectsSDK, default } from "./interfaces/sdk.js";

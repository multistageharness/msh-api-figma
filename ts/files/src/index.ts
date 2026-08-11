/**
 * Figma Files API - Main Entry Point
 * Exports all public interfaces for the library
 */

// Exception exports
export {
  AuthenticationError,
  AuthorizationError,
  createErrorFromResponse,
  FigmaApiError,
  FileNotFoundError,
  HttpError,
  isRetryableError,
  NetworkError,
  NodeNotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from "./core/exceptions.js";
// Core exports
export { FigmaFilesService } from "./core/service.js";
// Interface exports
// Default export for convenience
export { FigmaFilesSDK, FigmaFilesSDK as default } from "./interfaces/sdk.js";

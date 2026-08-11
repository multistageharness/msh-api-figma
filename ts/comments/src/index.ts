/**
 * project: figma-comments
 * purpose: Main entry point with all exports for Figma Comments API library
 * use-cases:
 *  - ES6 module imports for Node.js applications
 *  - TypeScript compatibility layer
 *  - Unified API surface for library consumers
 *  - Comment reaction management and analytics
 */

// Re-export utility classes from @figma-api/fetch for convenience
// Users can also import these directly from '@figma-api/fetch' if needed
export { RateLimiter, RequestCache } from "@figma-api/fetch";
// Error classes
export {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  CommentError,
  CommentPermissionError,
  CommentValidationError,
  ConfigurationError,
  createErrorFromResponse,
  FigmaCommentsError,
  FileAccessError,
  FileError,
  FileNotFoundError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "./core/exceptions.js";
// Core classes
export { FigmaCommentsService } from "./core/service.js";
// Default export - the main SDK
export {
  FigmaCommentsSDK,
  FigmaCommentsSDK as default,
} from "./interfaces/sdk.js";

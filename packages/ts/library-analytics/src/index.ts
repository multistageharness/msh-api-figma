/**
 * figma-library-analytics - Main entry point
 * Exports all public interfaces for the library
 */

// Error exports
export {
  LibraryAnalyticsAuthError,
  LibraryAnalyticsError,
  LibraryAnalyticsRateLimitError,
  LibraryAnalyticsValidationError,
} from "./errors.js";
// SDK exports
export { default, FigmaLibraryAnalyticsSDK } from "./sdk.js";
// Service export
export { FigmaLibraryAnalyticsService } from "./service.js";

// Version info
export const VERSION = "1.0.0";

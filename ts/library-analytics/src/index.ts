/**
 * figma-library-analytics - Main entry point
 * Exports all public interfaces for the library
 */

// Error exports
export {
  LibraryAnalyticsError,
  LibraryAnalyticsAuthError,
  LibraryAnalyticsValidationError,
  LibraryAnalyticsRateLimitError
} from './errors.js';

// Service export
export { FigmaLibraryAnalyticsService } from './service.js';

// SDK exports
export { FigmaLibraryAnalyticsSDK, default } from './sdk.js';

// Version info
export const VERSION = '1.0.0';

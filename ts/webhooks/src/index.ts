/**
 * figma-webhooks - Main entry point
 * Exports all public interfaces for the Figma Webhooks API library
 */

// Error exports
export {
  WebhookError,
  WebhookAuthError,
  WebhookValidationError,
  WebhookRateLimitError
} from './errors.js';

// SDK exports
export { FigmaWebhooksSDK } from './sdk.js';
export { default } from './sdk.js';

// Version info
export const VERSION = '1.0.0';

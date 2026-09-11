/**
 * figma-webhooks - Main entry point
 * Exports all public interfaces for the Figma Webhooks API library
 */

// Error exports
export {
  WebhookAuthError,
  WebhookError,
  WebhookRateLimitError,
  WebhookValidationError,
} from "./errors.js";
// SDK exports
export { default, FigmaWebhooksSDK } from "./sdk.js";

// Version info
export const VERSION = "1.0.0";

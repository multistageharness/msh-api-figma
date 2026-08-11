/**
 * figma-variables-sdk - Main entry point
 * Exports all public interfaces for the Figma Variables API library
 */

export * from "./core/exceptions.js";
// Core exports
export { FigmaVariablesService } from "./core/service.js";

// Interface exports
export { FigmaVariablesSDK } from "./interfaces/sdk.js";

// Version info
export const VERSION = "1.0.0";

// Default export for convenience
export { default } from "./interfaces/sdk.js";

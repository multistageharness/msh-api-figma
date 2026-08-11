/**
 * Main entry point for figma-dev-resources module
 * Exports all public APIs for Dev Resources operations
 */

export {
  default as FigmaDevResourcesSDKDefault,
  FigmaDevResourcesSDK,
} from "./sdk.js";
export {
  default as FigmaDevResourcesServiceDefault,
  FigmaDevResourcesService,
} from "./service.js";

export * from "./types.js";

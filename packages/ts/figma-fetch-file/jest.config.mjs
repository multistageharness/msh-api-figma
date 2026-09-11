/**
 * Jest configuration for figma-fetch-file package
 * Extends shared base configuration
 */

import baseConfig from "../jest.base.config.mjs";

export default {
  ...baseConfig,
  displayName: "figma-fetch-file",
  testMatch: ["<rootDir>/tests/**/*.test.mjs"],
};

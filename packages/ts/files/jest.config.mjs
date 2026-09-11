/**
 * Jest configuration for figma-files-api package.
 * Extends the shared base; tests import the built dist/ output.
 */

import baseConfig from "../jest.base.config.mjs";

export default {
  ...baseConfig,
  displayName: "figma-files-api",
  testMatch: ["<rootDir>/tests/**/*.test.mjs"],
};

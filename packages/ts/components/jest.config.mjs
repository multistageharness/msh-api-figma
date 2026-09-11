/**
 * Jest configuration for figma-components-api package.
 * Extends the shared base; tests import the built dist/ output.
 */

import baseConfig from "../jest.base.config.mjs";

export default {
  ...baseConfig,
  displayName: "figma-components-api",
  testMatch: ["<rootDir>/tests/**/*.test.mjs"],
};

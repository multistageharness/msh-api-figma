/**
 * Jest configuration for figma-variables package.
 * Extends the shared base; tests import the built dist/ output.
 */

import baseConfig from "../jest.base.config.mjs";

export default {
  ...baseConfig,
  displayName: "figma-variables",
  testMatch: ["<rootDir>/tests/**/*.test.mjs"],
};

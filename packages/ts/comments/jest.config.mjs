/**
 * Jest configuration for figma-comments package.
 * Extends the shared base; tests import the built dist/ output.
 */

import baseConfig from "../jest.base.config.mjs";

export default {
  ...baseConfig,
  displayName: "figma-comments",
  testMatch: ["<rootDir>/tests/**/*.test.mjs"],
};

/**
 * Jest configuration for figma-projects package.
 * Extends the shared base; tests import the built dist/ output.
 */

import baseConfig from '../jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'figma-projects',
  testMatch: ['<rootDir>/tests/**/*.test.mjs'],
};

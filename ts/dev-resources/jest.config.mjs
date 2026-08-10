/**
 * Jest configuration for dev-resources package
 * Extends shared base configuration
 */

import baseConfig from '../jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'dev-resources',
  testMatch: [
    '<rootDir>/tests/**/*.test.mjs'
  ]
};

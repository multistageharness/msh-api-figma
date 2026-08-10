/**
 * Jest configuration for figma-webhooks package.
 * Extends the shared base; tests import the built dist/ output.
 */

import baseConfig from '../jest.base.config.mjs';

export default {
  ...baseConfig,
  displayName: 'figma-webhooks',
  testMatch: ['<rootDir>/tests/**/*.test.mjs'],
};

/**
 * Shared base Jest configuration for the figma-api-module TypeScript workspaces.
 *
 * Tests are authored as plain ESM (`.test.mjs`) and import each package's BUILT
 * output (`dist/index.mjs`) — so a package must be built before its tests run
 * (`npm run build --workspace=<pkg>` then `npm run test --workspace=<pkg>`).
 * No TS transform is configured; keeping tests on the built artifact verifies
 * the published surface rather than the source.
 */

export default {
  testEnvironment: 'node',
  // No transform: tests are native ESM importing built .mjs.
  transform: {},
  moduleFileExtensions: ['mjs', 'js', 'json'],
  // Each package config narrows testMatch to its own tests/ dir.
  testMatch: ['<rootDir>/tests/**/*.test.mjs'],
  verbose: true,
};

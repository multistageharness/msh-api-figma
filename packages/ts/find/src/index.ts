/**
 * Programmatic surface of the find-and-search domain, re-exported from
 * `@internal/figma-find` so this monorepo exposes it the same way it exposes
 * its other domains.
 *
 * Everything here — `runQuery`, `buildWalk`, `evaluateXPath`,
 * `hydrateFigmaFile`, `loadFigmaFile`, `resolveFigmaToken` and the `FigmaFile`
 * / `QueryResults` / `QueryConfig` types — is defined in msh-sdk-figma-find.
 * This file adds no behaviour; it exists so `@internal/figma-find-api` is a
 * usable SDK import and not merely a `bin` shim.
 *
 * Note for hydration: `hydrateFigmaFile(key, { client })` accepts an injected
 * client, so callers inside this monorepo can drive it with
 * `@internal/figma-api-fetch-file` + `@internal/figma-comments` +
 * `@internal/figma-dev-resources` instead of the engine's own thin fetch
 * client, and get this repo's auth, rate limiting, retry and request cache.
 */
export * from "@internal/figma-find";

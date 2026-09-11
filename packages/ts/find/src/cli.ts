#!/usr/bin/env node
/**
 * The `figma-find` executable, published from this monorepo alongside its nine
 * sibling `figma-*` CLIs.
 *
 * The engine is NOT reimplemented here. `@internal/figma-find`
 * (msh-sdk-figma-find) owns the query engine, the XPath subset, the REST
 * hydration and the commander grammar; this package is the distribution point
 * that puts the binary on `PATH` from `msh-api-figma`, so a consumer that
 * already depends on this monorepo gets `figma-find` the same way it gets
 * `figma-comments` or `figma-dev-resources`.
 *
 * Importing the engine's CLI entry runs it: that module builds the commander
 * program and calls `parseAsync(process.argv)` at module scope. There is
 * deliberately nothing to call here — adding argument handling would fork the
 * grammar, which is the one thing this wrapper exists to avoid.
 */
import "@internal/figma-find/cli";

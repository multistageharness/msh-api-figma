# @internal/figma-find-api

The `figma-find` CLI, distributed from this monorepo alongside its sibling
`figma-*` clients (`figma-comments`, `figma-files`, `figma-dev-resources`, …).

Eight query modes over a Figma file — `find`, `xpath`, `path`, `pages`,
`comments`, `annotations`, `dev-resources` and federated `all` — each printing
JSON.

```bash
figma-find pages P7gZnWH3DvPDE217ZKcBXU --json
figma-find xpath P7gZnWH3DvPDE217ZKcBXU "//FRAME[contains(@name,'Feature')]/TEXT" --json
figma-find find P7gZnWH3DvPDE217ZKcBXU --name Button --type TEXT,FRAME --json
figma-find all P7gZnWH3DvPDE217ZKcBXU "checkout" --json
```

A token comes from `--token` or `FIGMA_TOKEN` / `FIGMA_API_TOKEN` /
`FIGMA_ACCESS_TOKEN`. `--input <path>` queries a local `FigmaFile` JSON instead
of the REST API, which is how the test suite runs offline.

## What this package is (and is not)

**It is a distribution point, not an implementation.** The engine — query
dispatch, the XPath subset, REST hydration, the commander grammar — lives in
[`@internal/figma-find`](../../../../../msh-sdk-figma-find/v100/packages/ts)
(the `msh-sdk-figma-find` repo). This package owns exactly two things:

- `src/cli.ts` — the `bin` entry, a single `import "@internal/figma-find/cli"`.
- `src/index.ts` — a re-export, so `@internal/figma-find-api` is a usable SDK
  import and not merely a shim.

It exists so consumers that already depend on this monorepo get `figma-find` on
`PATH` the same way they get `figma-comments`, without a second checkout. Do not
add argument parsing or query logic here — forking the grammar is the one thing
the wrapper exists to prevent. Engine changes belong upstream.

## Hydration

`hydrateFigmaFile(key, { client })` accepts an injected client, so callers inside
this monorepo can drive the engine with `@internal/figma-api-fetch-file` +
`@internal/figma-comments` + `@internal/figma-dev-resources` and get this repo's
auth, rate limiting, retry and request cache instead of the engine's own thin
fetch client. `msh-ui-FigmaFindConsole`'s dev-server backend does exactly that.

## Layout note

Sibling packages here ship a dual ESM/CJS build (`dist/*.mjs` + `lib/*.js`).
This one is **ESM-only**: the upstream engine is `"type": "module"` with no CJS
entry, so a `require()`-able build would not work. Output goes to `lib/`.

## Targets

```bash
make build      # tsc src/ -> lib/
make test       # offline smoke tests of the built binary
make typecheck
make audit      # typecheck + test
```

# TypeScript Port Conventions

This `ts/` tree is a faithful TypeScript port of the sibling `mjs/` JavaScript module.
Every package here mirrors the same-named package under `../mjs/<pkg>/`.

The canonical, already-TypeScript reference package is **`figma-fetch`** — copied verbatim
from `mjs/figma-fetch` (it was authored in TS). Use it as the exemplar for the build
pipeline, tsconfig matrix, and `package.json` shape. Do **not** modify `figma-fetch`.

## Source of types

Each `.mjs` file in the source carries JSDoc (`@param {string}`, `@returns {Promise<Object>}`).
Several packages also ship hand-written `.d.mts` declaration files. **Derive TypeScript types
from the JSDoc and the `.d.mts` files.** Where the source is genuinely dynamic (`{object}`,
`{Object}`, untyped figma API payloads), use `Record<string, any>`, `any`, or a small local
`interface` — do not invent strict shapes that the runtime doesn't guarantee.

The port must be **behaviorally identical** to the source. Port the logic line-for-line; only
add type annotations, convert import extensions, and split/merge declaration files. Do not
"improve", refactor, or drop functionality.

## Per-package layout

For a **`src/`-style** source package (`comments`, `components`, `files`, `projects`, `variables`):

```
ts/<pkg>/
  src/
    index.ts                  # from <pkg>/index.mjs (merge in <pkg>/index.d.mts types)
    core/exceptions.ts        # from <pkg>/src/core/exceptions.mjs (+ exceptions.d.mts)
    core/service.ts           # from <pkg>/src/core/service.mjs (+ service.d.mts)
    core/client.ts            # ONLY if a real client.mjs exists (most are client.mjs.bak → SKIP)
    interfaces/sdk.ts         # from <pkg>/src/interfaces/sdk.mjs (+ sdk.d.mts)
    interfaces/cli.ts         # from <pkg>/src/interfaces/cli.mjs (keep the #!/usr/bin/env node shebang)
    health-check-server.ts    # from <pkg>/health-check-server.mjs
  package.json
  tsconfig.json  tsconfig.esm.json  tsconfig.cjs.json  tsconfig.types.json
  .gitignore
  README.md                   # copy from source; fix obvious `.mjs` import refs in code fences to the built paths
```

For a **flat** source package (`dev-resources`, `library-analytics`, `webhooks`):

```
ts/<pkg>/
  src/
    index.ts                  # from <pkg>/index.mjs
    sdk.ts                    # from <pkg>/sdk.mjs
    service.ts                # from <pkg>/service.mjs (if present)
    cli.ts                    # from <pkg>/cli.mjs (keep shebang)
    errors.ts                 # from <pkg>/errors.mjs (if present)
    client.ts                 # ONLY if a real client.mjs exists (client.mjs.bak → SKIP)
    health-check-server.ts    # from <pkg>/health-check-server.mjs
  package.json + tsconfig*.json + .gitignore + README.md
```

> `dev-resources` already has a `types.d.ts` — fold its types into the relevant `.ts` files.

## Import rules (CRITICAL — matches figma-fetch / NodeNext emit)

- Relative imports inside `src/` use a **`.js`** extension, NOT `.ts` and NOT `.mjs`:
  `import { FigmaXService } from './core/service.js';`
  (The build's `rename:mjs` + `fix:imports` steps rewrite emitted `.js`→`.mjs` and the
  specifiers `'./x.js'`→`'./x.mjs'`. TypeScript resolves `'./x.js'` to `x.ts` at compile time.)
- The cross-package dependency stays `@figma-api/fetch` (resolves to `../figma-fetch`):
  `import { FigmaApiClient } from '@figma-api/fetch';`
- Third-party imports unchanged: `import { Command } from 'commander';` etc.

## tsconfig matrix — copy figma-fetch's four files VERBATIM

`tsconfig.json`, `tsconfig.esm.json`, `tsconfig.cjs.json`, `tsconfig.types.json` are identical
to `figma-fetch`'s. Copy them byte-for-byte (they reference `src/**/*` and emit to `dist`/`lib`).
The base `tsconfig.json` uses `"strict": true`; if a faithful port produces strict errors that
can only be fixed by changing behavior, relax with explicit local types or `any` rather than
altering logic. As a last resort a package MAY set `"strict": false` in its own `tsconfig.json`,
but prefer keeping strict and typing dynamic values as `any`/`Record<string, any>`.

## package.json — model on figma-fetch + the source package

Start from the **source** `<pkg>/package.json`, then apply figma-fetch's TS build surface:

- `"main": "./lib/index.js"`, `"module": "./dist/index.mjs"`, `"types": "./dist/index.d.ts"`.
- `"exports"`: the `.` entry → `{ "types": "./dist/index.d.ts", "import": "./dist/index.mjs", "require": "./lib/index.js" }`.
  For every subpath the source exported (`./service`, `./sdk`, `./cli`, `./exceptions`, …),
  map to the matching `dist`/`lib` path (e.g. `./sdk` → `dist/interfaces/sdk.mjs` for src-style,
  or `dist/sdk.mjs` for flat-style). `cli` import target is the built `.mjs`.
- `"bin"`: point to the built CLI, e.g. `"figma-<pkg>": "lib/interfaces/cli.js"` (src-style) or
  `"lib/cli.js"` (flat). CJS `lib` is executable via node.
- `"files": ["dist", "lib", "README.md"]`.
- Keep `"type": "module"`, keep the source's runtime `dependencies` (chalk/commander/ora/etc.)
  and `peerDependencies` (`@figma-api/fetch: file:../figma-fetch`).
- `"devDependencies"`: keep the source's, plus add `typescript: ^5.0.0`,
  `@types/node: ^20.0.0`, and `@typescript-eslint/*`/`eslint` like figma-fetch.
- `"scripts"`: copy figma-fetch's TS scripts EXACTLY:
  `clean`, `build` (`clean && build:esm && build:cjs && rename:mjs && fix:imports`),
  `build:esm`, `build:cjs`, `build:types`, `rename:mjs`, `fix:imports`, `prepublishOnly`.
  Also add `"typecheck": "tsc -p tsconfig.json --noEmit"`. Keep a `lint` (`eslint src --ext .ts`).
  Keep `test` if straightforward (see Tests).

## Tests (secondary — must NOT block the build)

The build gate is `npm run build` (tsc) compiling clean. Tests are best-effort:
- Copy each `tests/**/*.test.mjs` into `ts/<pkg>/tests/` and update its imports to the **built**
  output (`../dist/...mjs` or the package name). Set `test` to build-then-jest if you keep them.
- If a test can't be made to run without significant rework, leave it copied but do not wire it
  into a blocking script. Never let tests gate the TS build.

## .gitignore

Copy figma-fetch's `.gitignore` (`node_modules/ dist/ lib/ *.tsbuildinfo …`).

## Definition of done for a package

1. All source `.mjs` logic is ported to `.ts` under `src/` with types from JSDoc/`.d.mts`.
2. `src/index.ts` re-exports the same public surface as the source `index.mjs` (+ types).
3. The four tsconfig files, `package.json`, `.gitignore`, `README.md` exist.
4. `npx tsc -p tsconfig.json --noEmit` reports **zero errors** for the package
   (assuming `@figma-api/fetch` and node_modules are present at the `ts/` workspace root).

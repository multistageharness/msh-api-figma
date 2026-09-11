---
name: msh-api-figma-test-strategy
description: The house testing strategy for the eleven TypeScript packages under msh-api-figma/v100/packages/ts/ — invariants (plain-ESM .test.mjs suites against BUILT dist/ output, injected mock fetcher with exact endpoint assertions), per-test-folder knowledge for every package, a SPEC-to-tests procedure, and a conformance checklist. Use when asked to create tests for a package from a SPEC, add or extend a test suite in packages/ts, answer "what does a conforming suite for package X look like", or review generated tests for strategy drift. For live Figma API verification via curl use the msh-api-figma-curl-tests skill; to capture a real-file fixture use the msh-api-figma-fixture-capture skill.
---

# msh-api-figma-test-strategy

The testing strategy of the `msh-api-figma/v100/packages/ts/` npm workspace, frozen as
knowledge (verified 2026-09-11 across all eleven packages). Per-package specifics live in
[`references/per-package.md`](references/per-package.md) — an agent must be able to answer
"what does a conforming suite for package X look like?" from that file alone.

**Sibling skills:** live-API curl verification → **`msh-api-figma-curl-tests`**;
capturing a real Figma file as a house-shaped fixture → **`msh-api-figma-fixture-capture`**.
Test generation under this skill is fully offline — it never needs a file id or token.

## Invariants (all eleven packages)

1. **Plain-ESM suites.** Tests are `.test.mjs` files, native ESM, no TypeScript transform
   (`jest.base.config.mjs`: `transform: {}`). Jest packages import test API from
   `@jest/globals` (`import { jest, describe, test, expect } from "@jest/globals"`).
2. **Tests import BUILT output, never source.** Suites import `../../dist/….mjs` (or
   `../dist/….mjs` for root-layout folders) — `jest.base.config.mjs:4-7` documents that a
   package must be **built before its tests run**. Never import from `src/`.
   From the workspace root: `make test-pkg PKG=<dir>` (root Makefile) or
   `npm run build --workspace=<dir> && npm run test --workspace=<dir>`.
3. **Runner.** Ten packages run Jest as native ESM:
   `node --experimental-vm-modules ../node_modules/.bin/jest` (the binary is hoisted to the
   workspace root `node_modules`). One outlier: **`find`** uses the Node built-in runner
   (`node --test tests/*.test.mjs`). Never change a package's runner.
4. **Per-package Jest config extends the shared base.** Each Jest package has a
   `jest.config.mjs` that spreads `../jest.base.config.mjs`, sets `displayName`, and keeps
   `testMatch: ["<rootDir>/tests/**/*.test.mjs"]`. New test files must land where that glob
   already matches — a conforming suite requires **zero config changes**.
5. **Services are tested through an injected mock fetcher.** Construct the service with a
   hand-built fetcher whose verbs are `jest.fn()` stubs, then assert the **exact endpoint
   path and params/body** passed. Two fetcher shapes exist (see per-package entries):
   - `{ request: jest.fn() }` — request-style (comments).
   - `{ get, post, put, delete: jest.fn() }` — generic-verb style (most services).
   Never mock the network layer (no fetch/undici interception in service tests) and never
   hit the real API.
6. **Error mapping is asserted with the package's typed exceptions** imported from built
   output (e.g. `ValidationError`, `NotFoundError` from `../../dist/core/exceptions.mjs`),
   via `await expect(...).rejects.toThrow(SomeError)`.
7. **Loggers are silenced** by injecting `{ debug/info/warn/error: jest.fn() }` (or no-op
   functions) wherever the constructor accepts one.
8. **Offline by design.** No suite needs network, `FIGMA_TOKEN`, or a real file id. File
   payloads come from checked-in fixtures or inline literals.
9. **Suite headers explain intent.** Every test file opens with a `/** ... */` comment
   naming what is under test (and, where relevant, the build-before-test note).
10. **Empty suites don't fail.** A package whose glob matches nothing passes
    `--passWithNoTests` in its test script (`webhooks` does) — copy that flag only when a
    package legitimately may have zero matching tests.

## SPEC-to-tests procedure

Given a package SPEC (API surface + behaviors — a PRD, README contract, or endpoint list):

1. **Locate the target package's entry** in
   [`references/per-package.md`](references/per-package.md); it pins layout, runner,
   import paths, and fetcher shape. Sanity-check the entry against one real sibling file
   before writing (entries carry a "verified as of" date; the tree wins if they disagree).
2. **Enumerate the SPEC's surface**: every public method/command, its Figma endpoint
   (path + HTTP verb + params/body), its validation rules, and its error mapping.
3. **Plan one `describe` block per method/behavior group**, and within it:
   - the happy path: stub the fetcher verb to resolve a realistic payload, call the
     method, assert the **exact path string** (e.g. `/v1/files/test-file-key/comments`)
     and the exact `params`/`body`/`method` argument, and assert the unwrapped return;
   - input validation: invalid/empty/null inputs reject with the typed error
     (`ValidationError` etc.) **without** the fetcher being called;
   - error mapping: stub a rejection / not-found payload and assert the mapped exception;
   - any SPEC'd local behavior (filtering, sorting, pagination, stats) with inline mock
     payloads.
4. **Name files by surface**: `service.test.mjs` for the service, `sdk.test.mjs` for an
   SDK wrapper, `cli.test.mjs` for CLI-level tests, `<feature>.test.mjs` for a named
   feature — placed per the package's layout (`tests/unit/` or `tests/` root — see entry).
5. **Reuse the package's established helpers** (recordingFetcher, ProxyTestHelper,
   fixtures — named in the entry) instead of inventing new ones.
6. **Run it**: build then test, from the workspace root:
   `make test-pkg PKG=<dir>` — or the aggregate `make test` for the full workspace gate.
7. **Score against the conformance checklist** below; fix every miss before presenting.

## Conformance checklist

A generated suite conforms iff every box ticks:

- [ ] File(s) are `.test.mjs`, plain ESM, under the package's `tests/` layout exactly
      where the existing glob matches (`tests/unit/` vs `tests/` root per the entry).
- [ ] Zero changes to the package's `jest.config.mjs`, `package.json`, or Makefile
      (and zero edits to sibling suites).
- [ ] All package imports target built output (`dist/….mjs`) — no `src/` imports.
- [ ] Jest packages import from `@jest/globals`; `find` uses `node:test` + `node:assert`.
- [ ] Services constructed with an injected mock fetcher of the package's documented
      shape; no real network, no token.
- [ ] At least one assertion pins an **exact endpoint path** (and params/body) per
      fetcher-calling method.
- [ ] Validation and error paths assert the package's typed exceptions.
- [ ] Logger silenced where the constructor accepts one.
- [ ] Suite passes via the package's **existing** test script (`npm test` in the package,
      or `make test-pkg PKG=<dir>` from the workspace root) after a fresh build.
- [ ] Suite header comment states what is under test.

## Anti-patterns (each one is strategy drift)

- Importing `src/` or TypeScript files into a suite.
- Adding a TS transform, babel, or ts-jest to make source imports work.
- Mocking `fetch`/undici globally in a service test instead of injecting a fetcher.
- Asserting `toHaveBeenCalled()` without pinning the endpoint path.
- Moving a package's tests between `tests/` and `tests/unit/`, or renaming its runner.
- Requiring `FIGMA_TOKEN` or network in a unit suite (live verification belongs to
  `msh-api-figma-curl-tests`; real payloads to `msh-api-figma-fixture-capture`).

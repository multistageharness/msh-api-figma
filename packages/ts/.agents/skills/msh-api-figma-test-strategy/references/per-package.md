# Per-package test-folder knowledge — msh-api-figma/v100/packages/ts

Verified 2026-09-11 against the live tree. One entry per workspace package (the eleven
declared in `packages/ts/package.json` `workspaces`). If an entry disagrees with the tree,
the tree wins — fix the entry.

Conventions used below:
- **Runner** — the package's `scripts.test` verbatim.
- **Layout** — where `.test.mjs` files live; the Jest glob is always
  `<rootDir>/tests/**/*.test.mjs`, so both `tests/` root and `tests/unit/` match.
- **Imports** — what the suites import from built output.
- **Fetcher mock** — the injected-fetcher shape a new suite should reuse.

---

## figma-fetch (`@internal/figma-api-fetch`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** `tests/unit/` — 6 files: `config-egress-getme`, `hardening`, `placeholder`,
  `proxy-tls-adapter`, `schemas`, `testing-rail` (`.test.mjs` each).
- **Imports:** everything from `../../dist/index.mjs` (wide named-export surface:
  `FigmaApiClient`, `RetryHandler`, `NativeFetchAdapter`, typed errors,
  `parseFileKey`, `redactProxy`, `parseRetryAfterHeader`, `FakeFigmaClient`, `isOffline`).
- **Pattern:** this is the HTTP-client package — tests exercise retry/timeout/abort
  behavior, error taxonomy, schema parsing, and proxy/TLS adapters directly; there is no
  service+fetcher split here. It also ships the **testing rail** other packages may use:
  `FakeFigmaClient` (fixture-serving fake with generic verbs) and `isOffline`.
- **Notes:** canonical reference package (`CONVENTIONS.md`: do not modify). Suite headers
  cite epic/story ids.

## figma-fetch-file (`@internal/figma-api-fetch-file`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** `tests/unit/` (`client-endpoints`, `engine-parity`, `sizing`) plus
  **`tests/fixtures/`** (`chunk-mjs-baseline.json` — checked-in data fixture).
- **Imports:** own `../../dist/index.mjs` (`FigmaFileClient`, `DOWNLOAD_RETRY_PROFILE`)
  **and** the sibling's built output `../../../figma-fetch/dist/index.mjs` (typed errors,
  schemas) — cross-package imports also target `dist/`, never source.
- **Fetcher mock:** local `recordingAdapter(script)` helper — an injected adapter that
  records every request and replays scripted responses; endpoint URLs pinned exactly.
- **Notes:** `client-endpoints.test.mjs` also loads an external mock-file fixture from
  `msh-sdk-figma-downloader/v300/packages/shared/fixtures/mock-file.json` via a long
  relative `new URL(...)` — keep that pattern if you need the same fixture.

## comments (`@internal/figma-comments`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** `tests/unit/` — `service.test.mjs`, `reactions.test.mjs`.
- **Imports:** `FigmaCommentsService` from `../../dist/core/service.mjs`, typed errors
  from `../../dist/core/exceptions.mjs` (`NotFoundError`, `ValidationError`,
  `AuthorizationError`, `CommentError`), SDK from `../../dist/interfaces/sdk.mjs`.
- **Fetcher mock:** **request-style** — `{ request: jest.fn() }`; construct
  `new FigmaCommentsService({ fetcher: mockFetcher, logger: <4×jest.fn()> })`; assert
  exact calls like `("/v1/files/test-file-key/comments", { params: {} })` and POST bodies
  (`{ method: "POST", body: {...} }`).
- **Notes:** the exemplar for the mockFetcher pattern; also tests local behaviors
  (thread assembly, search, stats, CSV/Markdown export) from stubbed payloads.

## components (`@internal/figma-components-api`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** `tests/unit/` — `service.test.mjs`.
- **Imports:** `FigmaComponentsService` from `../../dist/core/service.mjs`; errors
  (`PaginationError`, `ValidationError`) from `../../dist/core/exceptions.mjs`.
- **Fetcher mock:** generic-verb + extras —
  `{ get, post, request, getStats: jest.fn(() => ({ totalRequests: 0 })), healthCheck: jest.fn(() => Promise.resolve(true)) }`;
  logger `{ debug, warn, error }` of `jest.fn()`.
- **Notes:** suite contains 2 deliberately skipped tests (they show in output as skipped —
  that is expected, not a failure).

## dev-resources (`@internal/figma-dev-resources`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** **`tests/` root** — `sdk.test.mjs`, `cli.test.mjs`.
- **Imports:** SDK tests mock the service module with
  `jest.unstable_mockModule("../dist/service.mjs", ...)` (module-level mocking — note the
  single `../` because tests sit at `tests/` root), then dynamically import the SDK.
- **Fetcher mock:** shared `mockMethods` object of `jest.fn()`s installed on a
  `MockFigmaDevResourcesService` class; CLI tests exercise extracted helper functions
  inline (no child-process spawning).
- **Notes:** the only package using `jest.unstable_mockModule`; keep new SDK-level tests
  on that pattern here, but prefer injected fetchers for service-level tests.

## files (`@internal/figma-files-api`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** `tests/unit/` (`service.test.mjs`) plus **`tests/test-helpers/`**
  (`proxy-test-utils.mjs` — exports `ProxyTestHelper` and a mocked undici `ProxyAgent`;
  helper files are NOT test files and must not be named `*.test.mjs`).
- **Imports:** `FigmaFilesService` from `../../dist/core/service.mjs`; errors
  (`NodeNotFoundError`, `ValidationError`) from `../../dist/core/exceptions.mjs`.
- **Fetcher mock:** generic-verb —
  `{ get, post, put, delete, getStats, healthCheck }`, all `jest.fn()`.
- **Notes:** reuse `ProxyTestHelper` (setup/teardown saves & restores
  `HTTP_PROXY`/`HTTP_PROXY_TOKEN` env) for anything proxy-related.

## find (`@internal/figma-find-api`)

- **Runner:** **`node --test tests/*.test.mjs`** — the workspace's one non-Jest package.
  Do not convert it to Jest; do not use `@jest/globals` here.
- **Layout:** `tests/` root — `cli.test.mjs` (glob is non-recursive: new files must sit
  directly in `tests/`).
- **Imports/pattern:** `import { test } from "node:test"`,
  `assert from "node:assert/strict"`; smoke-tests the **built CLI** (`../lib/cli.js`) via
  `execFile`, writing a fixture JSON to a `mkdtemp` tmpdir and asserting `--help`,
  bad-subcommand, and `--input <fixture>` behavior. Offline by design.
- **Notes:** deliberately thin — the engine is owned (and heavily tested) by
  `msh-sdk-figma-find`; only test what this package ships (the CLI binary reaching the
  engine's grammar).

## library-analytics (`@internal/figma-library-analytics`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** **`tests/` root** — `service.test.mjs`.
- **Imports:** **default export** — `FigmaLibraryAnalyticsService from "../dist/service.mjs"`
  (flat dist, no `core/` subdir; single `../`).
- **Fetcher mock:** minimal generic-verb — `{ get: jest.fn() }`;
  `new FigmaLibraryAnalyticsService({ fetcher })`; constructor throws
  `"fetcher parameter is required"` without one.

## projects (`@internal/figma-projects`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** `tests/unit/` — `service.test.mjs`.
- **Imports:** `FigmaProjectsService` from `../../dist/core/service.mjs`; `NotFoundError`,
  `ValidationError` from `../../dist/core/exceptions.mjs`.
- **Fetcher mock:** generic-verb — `{ get, post }`; logger `{ debug, warn, error }`.
  Endpoints under test: `GET /v1/teams/:id/projects`, `GET /v1/projects/:id/files`.

## variables (`@internal/figma-variables-sdk`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest`
- **Layout:** `tests/unit/` — `service.test.mjs`.
- **Imports:** `FigmaVariablesService` from `../../dist/core/service.mjs`; errors from
  `../../dist/core/exceptions.mjs`.
- **Fetcher mock:** generic-verb — `{ get, post }`. The suite declares the endpoint paths
  as constants up front (`/v1/files/:key/variables/local`, `.../published`, and the POST
  write path `.../variables`) and asserts against them — copy that style.
- **Notes:** suite header records why generic verbs are used (bespoke fetcher methods the
  shipped client never implemented) — keep tests on generic verbs.

## webhooks (`@internal/figma-webhooks`)

- **Runner:** `node --experimental-vm-modules ../node_modules/.bin/jest --passWithNoTests`
  (the `--passWithNoTests` flag is deliberate — an empty match must not fail the
  aggregate run).
- **Layout:** `tests/unit/` — `sdk.test.mjs`.
- **Imports:** `FigmaWebhooksSDK` from `../../dist/index.mjs`; `node:crypto` for HMAC.
- **Fetcher mock:** local `recordingFetcher(responder)` helper — generic verbs that push
  `{ method, path, arg }` onto a `calls` array and return the responder's scripted value;
  a shared `silent` no-op logger object. Asserts v2 endpoints (`/v2/webhooks`),
  snake_case bodies, response unwrapping, local pagination, and HMAC signature
  verification with real `createHmac` digests.

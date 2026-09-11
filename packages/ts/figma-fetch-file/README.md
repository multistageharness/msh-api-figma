# @internal/figma-api-fetch-file

The Figma **file-download domain**: the three file endpoints plus the chunked
large-file download engine, composed over
[`@internal/figma-api-fetch`](../figma-fetch)'s `FigmaApiClient`.

```
skeleton (?depth=N) → frontier ids → batched /nodes (bounded concurrency)
                                   → adaptive re-chunking of over-budget batches
                                   → sink callback (consumer persists the bytes)
```

## Why this package (and not `files`)

The workspace's `files` package covers the same endpoints but declares CLI
runtime dependencies (`chalk`, `commander`, `ora`) a library consumer must not
inherit, and has no notion of chunked download. `figma-fetch-file` composes
`FigmaApiClient` directly and owns the one capability nothing else in the
workspace has: the chunking engine. Its only runtime dependency is
`@internal/figma-api-fetch`.

## Surface

- `FigmaFileClient` — `fetchSkeleton` / `fetchNodes` / `fetchWholeFile`, with
  the downloader's retry profile (`DOWNLOAD_RETRY_PROFILE`: deterministic
  0.5s→15s doubling backoff, no jitter, timeouts retried, `Retry-After`
  honoured) and a 60s default timeout.
- `collectFrontierIds(skeleton, depth)` — pure frontier walk, document order.
- `downloadChunks({ client, fileKey, frontierIds, depth, sink, … })` — the
  driver: batches, bounded-concurrency fetch, re-chunking. Yields every part to
  `sink` and returns manifest-shaped metadata.
- `sizing` — tier presets (`sm`/`md`/`large`/`xl`/`xxxxl`), `classify`,
  `resolveStrategy`.
- `testing` — `FixtureFetchAdapter`, an injectable offline transport serving a
  fixture document through all three endpoints (including `?depth=N`
  truncation).

## Recorded decisions

1. **`ids` encoding** — query strings are built by hand;
   `ids.map(encodeURIComponent).join(",")` keeps the comma **literal** (as the
   downloader's `figmaClient.mjs` always has), where `URLSearchParams` would
   emit `%2C`. Figma accepts both; the emitted URLs are kept byte-identical to
   the code this package replaces so the cross-language parity gate never has
   to wonder about them. Pinned in `src/client/FigmaFileClient.ts` and its
   tests.
2. **`sizing` seam** — the whole of the downloader's `sizing.mjs` moved into
   this package (`src/sizing/`). It is pure, and its budgets drive the re-chunk
   decision, which also lives here. The byte budget is evaluated on the
   canonical `stringify` serialization — exactly the bytes the consumer writes —
   so nothing about it is a consumer-side concern.
3. **Testing rail: new adapter, not an extension of `FakeFigmaClient`** —
   `FakeFigmaClient` replaces `FigmaApiClient` wholesale, so nothing behind it
   (retry, request building, adapters) executes, and its route table cannot
   express `?depth=N` truncation. The engine's tests need the real client code
   path with only the transport faked, which is the `FetchAdapter` injection
   seam. Rationale recorded in `src/testing/FixtureFetchAdapter.ts`.

## The sink seam (why the driver never touches disk)

Part-file bytes anchor the TS↔Python parity contract of
`msh-sdk-figma-downloader/v300`. The driver therefore decides *what* to fetch
and *how* to re-chunk; the consumer decides *how bytes land on disk*:

```ts
const result = await downloadChunks({
  client, fileKey, frontierIds, depth,
  sink: async ({ file, json }) => {
    await fs.writeFile(path.join(partsDir, file), json, "utf8");
  },
});
```

`sink` receives `{ file, sha, ids, payload, json, bytes, elapsedMs, groupIndex,
groupSha, rechunked }`; `json` is the canonical serialization (U+2028/U+2029
escaped) — write those bytes verbatim. Resume stays a consumer concern via the
`resumeGroup` hook: return a prior group's parts to skip fetching it.

## Build / test

Same chain as `figma-fetch`: `npm run build` (ESM `dist/*.mjs` + CJS
`lib/*.js`), `npm run test` (jest over the built output). Tests reference the
shared fixture at
`msh-sdk-figma-downloader/v300/packages/shared/fixtures/mock-file.json`; they
do not copy it.

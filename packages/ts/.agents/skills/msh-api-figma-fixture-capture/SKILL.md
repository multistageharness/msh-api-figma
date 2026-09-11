---
name: msh-api-figma-fixture-capture
description: Capture a real Figma file payload as a test fixture in the established house shape (name, lastModified, version, document tree of typed nodes — the contract shown by msh-sdk-figma-analysis-file-payload/v100/packages/ts/fixtures/sample-file.json). Use when asked to capture/create/refresh a fixture from a Figma file id, produce a sample-file.json-shaped payload from a real file, or get realistic test data for the packages/ts suites. Requires a USER-PROVIDED file id (ask if missing — never invent one) and $FIGMA_TOKEN in the environment. For composing the live curl call itself see the msh-api-figma-curl-tests skill; for writing the tests that consume fixtures see the msh-api-figma-test-strategy skill.
---

# msh-api-figma-fixture-capture

Turn a **user-provided** Figma file id into a fixture JSON shaped like the house
reference: `msh-sdk-figma-analysis-file-payload/v100/packages/ts/fixtures/sample-file.json`
— a captured `GET /v1/files/:key` response with top level `name`, `lastModified`,
`version`, and a `document` tree of typed nodes (`id`, `name`, `type`, `children`), plus
`components` / `componentSets` / `styles` maps when present.

**Sibling skills:** the curl command conventions (auth header, proxy flags, doc pointers)
are owned by **`msh-api-figma-curl-tests`**; suites that consume fixtures follow
**`msh-api-figma-test-strategy`**.

## Inputs — ask, never invent (binding)

- **File id:** must come from the user or the requesting task. If absent, **ask** — never
  fabricate one, never scavenge an id from docs, fixtures, or git history for a live call.
- **Token:** read from `$FIGMA_TOKEN` only. Never ask for the token in chat, never write
  it to disk, never let it appear in the fixture, logs, or command echoes.
  Preflight: `test -n "$FIGMA_TOKEN"` — if unset, tell the user to export it and stop.
- **Destination:** chosen by the requesting context (e.g. `<pkg>/tests/fixtures/`); there
  is no hardcoded destination. With no stated destination, write to the session scratchpad
  and report the path.

## Procedure

1. Preflight the token; confirm the file id with the user if not supplied.
2. Capture (per the CURL.md convention — `-L`, header auth):
   ```bash
   curl -sS -L \
     -H "X-Figma-Token: $FIGMA_TOKEN" \
     "https://api.figma.com/v1/files/FILE_ID" \
     -o <dest>.json
   ```
   Behind a proxy, add the proxy flags per the curl skill's docs. On non-200: 403 → token
   scope/validity, 404 → wrong id (re-confirm with the user), 429 → respect Retry-After.
3. **Validate the shape** (node, no new dependencies):
   ```bash
   node -e '
     const j = require(process.argv[1]);
     const miss = ["name","lastModified","version","document"].filter(k => !(k in j));
     if (miss.length) { console.error("missing top-level keys:", miss); process.exit(1); }
     const d = j.document;
     if (d.type !== "DOCUMENT" || !d.id || !Array.isArray(d.children)) {
       console.error("document root is not a typed node tree"); process.exit(1);
     }
     console.log("shape OK:", j.name, "version", j.version);
   ' <dest>.json
   ```
   Compare against `sample-file.json` for the fuller node-level contract (CANVAS/FRAME/
   TEXT children with ids and types) when the consumer needs specific node kinds.
4. **Scan for leakage:** the fixture must not contain the token —
   `grep -F "$FIGMA_TOKEN" <dest>.json` must match nothing (run only when the variable is
   set; do not print the token while checking).
5. **Report** the destination path, top-level keys, file size, and this warning verbatim:
   a captured fixture embeds **real design content** (layer names, text). Do not commit it
   anywhere the repo mirrors/publishes without the user explicitly accepting that, or
   sanitizing first (the deploy secret gate does NOT catch design content).

## Size and reduction

A large file can produce a multi-megabyte fixture. Never truncate silently: report the
size, and if the consumer needs something smaller, reduce **explicitly with the user**
(e.g. keep one CANVAS/page subtree, or use `GET /v1/files/:key/nodes?ids=…` for a
node-scoped payload — see the curl skill) and say what was dropped.

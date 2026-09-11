---
name: msh-api-figma-curl-tests
description: Turn "verify endpoint X against the live Figma API" into a correct, runnable curl command, grounded in the repo's two curated curl references (msh-api-figma/v100/docs/figma.v3.1.0.curl.md and msh-api-figma/v100/CURL.md). Use when asked to curl the Figma API, smoke-test an endpoint live, verify a file/comments/components/webhooks/variables endpoint with a real token, or build a curl command with proxy flags. Token comes from $FIGMA_TOKEN (environment only); file ids and other ids are asked for, never invented. For offline unit-test creation use the msh-api-figma-test-strategy skill; to save a live file payload as a test fixture use the msh-api-figma-fixture-capture skill.
---

# msh-api-figma-curl-tests

Produce runnable curl invocations against the live Figma API, exactly as the repo's two
curated references document them. This skill is a **pointer to those documents, not a copy**
— endpoint knowledge must come from them at use time, so the skill breaks visibly (not
silently) if they move.

**Sibling skills:** writing offline unit tests → **`msh-api-figma-test-strategy`**;
capturing a full file payload as a house-shaped fixture → **`msh-api-figma-fixture-capture`**.

## Sources of truth (read at use time — do not answer from memory)

1. `msh-api-figma/v100/docs/figma.v3.1.0.curl.md` — the full reference: base URL
   (`https://api.figma.com`), the `X-Figma-Token` auth header, and per-endpoint curl
   examples for every family (Files, Projects, Comments, Comment Reactions, Users,
   Components, Component Sets, Styles, Webhooks, Activity Logs, Payments, Variables,
   Dev Resources, Library Analytics), each with proxy flags (`-x`, `-U`).
2. `msh-api-figma/v100/CURL.md` — short forms: `$FIGMA_TOKEN` env convention, `curl -L`
   file/nodes/images examples, `--proxy` variant, and saving raw JSON with `-o`.

**If either file is missing at its path, STOP and report it** — do not reconstruct
endpoints from memory. Where memory and the docs disagree, the docs win.

## Procedure

1. **Identify the endpoint family** from the request, then open the matching `##`/`###`
   section of `docs/figma.v3.1.0.curl.md` (grep its headings). Use `CURL.md` for the
   short `-L` file-download forms.
2. **Collect user values — ask, never invent (binding):**
   - `FILE_KEY` / file id, node ids, team/project/comment/webhook ids: if the request
     doesn't supply them, **ask the user**. Never fabricate an id, never reuse an id
     found in docs or fixtures for a live call.
   - Token: **always** `$FIGMA_TOKEN` from the environment. Never ask the user to paste
     a token into chat, never inline a literal token, never write one to disk. Preflight:
     `test -n "$FIGMA_TOKEN" || echo "FIGMA_TOKEN not set"` — if unset, tell the user to
     export it and stop.
3. **Compose the command** matching the documented form byte-for-byte apart from the
   substituted user values: same base URL, same `-H "X-Figma-Token: $FIGMA_TOKEN"` header
   (single quotes would suppress expansion — use double quotes), same verb, same query
   params. Keep `-L` where the doc uses it.
4. **Proxy variant** (only when the user is behind a proxy): the full reference documents
   `-x http://proxy.example.com:8080 -U proxy_user:proxy_pass`; `CURL.md` shows the
   equivalent `--proxy` spelling. Substitute the user's real proxy host/credentials —
   ask for them, and never echo proxy credentials back in logs or saved files.
5. **Run (or hand over) and interpret:** append `-w '\nHTTP %{http_code}\n'` (or
   `-o /dev/null -s` for a pure smoke test) when the goal is a status check. A live smoke
   call is successful on HTTP 200. On 403 check the token; on 404 check the id with the
   user; on 429 respect Retry-After — do not hammer the API in a loop.
6. **Hygiene when saving output:** files written with `-o` contain real design content —
   put them where the requesting task says (scratchpad by default), and never commit them
   without the user's say-so. The output of `curl -v` contains the token header — avoid
   `-v` in anything that gets saved or pasted.

## Quick map (family → doc section)

All in `docs/figma.v3.1.0.curl.md` (grep the heading): Files (`## Files Endpoints` — file
JSON, nodes, render images, image fills, metadata, versions), Projects, Comments,
Comment Reactions, Users (`/v1/me`), Components, Component Sets, Styles, Webhooks (v2),
Activity Logs, Payments, Variables (Enterprise), Dev Resources, Library Analytics.
This map is an index only — the command shape always comes from the document.

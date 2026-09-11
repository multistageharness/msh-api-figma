# msh-ui Conventions Changelog

Ledger for every change to [conventions.md](conventions.md), newest first. Entry format:
`## <yyyy-mm-dd> — <one-line summary>`, followed by the rule ids touched, the evidence
paths (non-archived `msh-ui-*` Makefiles only), and a one-line rationale. Entries are
appended by the Self-update procedure in [../SKILL.md](../SKILL.md) — never edit an old
entry.

## 2026-08-26 — Initial rule set UI-01…UI-12

- **Rules:** UI-01 organism header block, UI-02 fail-fast preamble (exact, ordered),
  UI-03 the four knobs, UI-04 `PORT` ↔ `vite.config.ts` agreement + `strictPort`,
  UI-05 one port per organism, UI-06 the invariant lifecycle core, UI-07 three-tier
  idempotent `stop`, UI-08 the `run-server`/`run-preview` foreground pair, UI-09
  `.ONESHELL` inert under make 3.81 (judgment), UI-10 the backend integration block
  (advisory — one reference implementation), UI-11 sibling repos use their own package
  manager, UI-12 docs echo the same port (advisory).
- **Evidence (3-package survey):**
  `msh-ui-FigmaFileHealthMetrics/v100/Makefile` (PORT 5205),
  `msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile` (PORT 5206),
  `msh-ui-FigmaFindConsole/v100/Makefile` (PORT 5208, the UI-10 backend reference),
  plus each package's `vite.config.ts`, `README.md` and `.AGENT.md` for UI-04/UI-12.
  Byte-identity of the invariant core verified by port-normalized diff of the first two
  (differs only in the header block and `.PHONY`). `make --version` → GNU Make 3.81,
  the basis of UI-09.
- **Rationale:** the family is copy-derived, so the failure mode is not bad style but
  silent divergence — a retyped `stop` that loses a tier, a `PORT` that no longer matches
  vite. The rules pin what must stay identical (UI-02/03/06/07) and mechanize the
  cross-file invariants a single-file audit cannot see (UI-04/05/12 in
  `ui-port-registry.sh`).
- **Tagging note:** UI-10 is advisory because only `msh-ui-FigmaFindConsole` implements
  it — 1/3 packages, below the ≥2 convention threshold this skill inherits from
  `makefile-self-improve`. Promote it to mandatory-when-applicable, and its findings
  from `warn` to `error`, when a second package grows a `dev/server/` backend.
- **Drift found and fixed in the same change:** `msh-ui-FigmaAbsoluteToReactMapping`
  had neither `run-server` nor `run-preview` (UI-08); `msh-ui-FigmaFileHealthMetrics`
  gained both earlier the same day. Both now carry the pair, making UI-08 3/3.

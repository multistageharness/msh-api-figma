# Makefile Conventions — RCM-figma house style

Extracted 2026-08-24 from the 12 non-archived Makefiles in this repo. The authoritative
reference is `msh-sdk-figma-downloader/v300/packages/ts/Makefile`; when files disagree,
the reference wins. Rules are cited by stable id (MK-NN) from `../SKILL.md` flows and
mechanized by `../scripts/makefile-audit.sh`.

Tag meanings: **mandatory** — the audit reports a violation as `error`; **advisory** —
reported as `warn` (or judgment-only, not mechanized).

## MK-01 — Header comment block

**Tag:** mandatory
**Statement:** The file opens with a `##`-prefixed comment block (within the first 10
lines) naming the package and stating its contract (what it is, what it depends on, what
`install`/`test` actually do).
**Rationale:** The header is where a Makefile explains its non-obvious constraints — e.g.
the reference's "the SDK ships built dist/ + lib/ output, so `make sdk` must run before
the CLI or its tests". Without it every reader re-derives the contract from recipes.
**Evidence:** `msh-sdk-figma-downloader/v300/packages/ts/Makefile`,
`msh-sdk-figma-downloader/v300/packages/py/Makefile`,
`msh-sdk-figma-downloader/v300/packages/Makefile`,
`msh-sdk-figma-downloader/v100/Makefile` (entire downloader family, 7/12 files).
**Audit:** `##` at line start within the first 10 lines.

## MK-02 — `.DEFAULT_GOAL := help`

**Tag:** mandatory
**Statement:** `.DEFAULT_GOAL := help` is set, so a bare `make` prints the help.
**Rationale:** A bare `make` must never build or mutate anything by surprise.
**Evidence:** 11/12 files, e.g. `msh-sdk-figma-downloader/v300/packages/ts/Makefile`,
`msh-ui-FigmaFindConsole/v100/Makefile`.
**Audit:** literal `.DEFAULT_GOAL := help` (whitespace-tolerant).

## MK-03 — `.PHONY` is complete and exact

**Tag:** mandatory
**Statement:** `.PHONY` lists exactly the recipe targets that do not produce a file of
their own name — no missing entries, no stale ones.
**Rationale:** A missing entry breaks the target the day a same-named file appears; a
stale entry claims a target that does not exist and rots the inventory.
**Evidence:** all 12 files keep `.PHONY` in sync, e.g.
`msh-sdk-figma-downloader/v300/packages/ts/Makefile`,
`msh-sdk-figma-downloader/v200/packages/Makefile`.
**Audit:** set-compare `.PHONY` words against defined rule targets, both directions.

## MK-04 — Every phony target carries a `## ` inline doc

**Tag:** mandatory
**Statement:** Every phony target's rule line ends with `## <one-line doc>`
(`target: deps ## doc`).
**Rationale:** The inline doc is the canonical per-target documentation (see MK-05) and
what awk-style help generators render.
**Evidence:** 11/12 files, e.g. `msh-sdk-figma-downloader/v300/packages/ts/Makefile`,
`msh-ui-FigmaFileHealthMetrics/v100/Makefile`.
**Audit:** each `.PHONY` target's rule line contains `## `.

## MK-05 — Help enumerates the documented targets

**Tag:** advisory (variant-aware)
**Statement:** The `help` recipe presents every documented target. Two accepted
mechanisms: **echo-curated** (reference style — one `@echo` line per target, kept in sync
with the `##` docs) and **awk-generated** (help renders the `##` docs from
`$(MAKEFILE_LIST)` automatically).
**Rationale:** `make help` is the package's front door. The `##` inline docs (MK-04) are
the source of truth; echo-curated help is curated prose that must *mention* every
documented target, and awk-generated help is in sync by construction.
**Evidence:** echo-curated: `msh-sdk-figma-downloader/v300/packages/ts/Makefile` and the
downloader family (7 files); awk-generated:
`msh-sdk-figma-find/v100/packages/ts/Makefile`, `msh-ui-FigmaFindConsole/v100/Makefile`
(4 files).
**Audit:** if the help recipe uses `awk` + `MAKEFILE_LIST` → single `warn` noting the
variant; else every `make <name>` the help body mentions must be a defined target
(`warn` per stale mention). Curated help may omit minor targets (the reference family
omits `help` itself, and the py twin omits its no-op `install`), so missing mentions
are reviewed in update mode, not emitted by the script.

## MK-06 — Canonical target vocabulary

**Tag:** mandatory (core set)
**Statement:** The core targets `help install typecheck test audit clean` all exist —
`install` as an explicit no-op echo where there is nothing to install ("present for
umbrella uniformity"), `audit` as the offline aggregate gate (`typecheck test`, plus
package gates like `check`/`parity`). Recognized package-specific extensions (legitimate,
never removed): `mock run build check parity sdk test-* dev stop up down watch status
logs run-* lint`.
**Rationale:** Umbrella Makefiles and agents drive every package through the same six
verbs; the extensions are where a package's real personality lives.
**Evidence:** core complete in the downloader family and
`msh-sdk-figma-find/v100/packages/ts/Makefile`; no-op `install` pattern in
`msh-sdk-figma-downloader/v300/packages/py/Makefile`; extensions across
`msh-ui-FigmaFindConsole/v100/Makefile` (`run-server`, `run-preview`),
`msh-sdk-figma-downloader/v300/packages/Makefile` (`test-ts`, `test-py`, `parity`).
**Audit:** all six core names present among defined targets.

## MK-07 — Variable style

**Tag:** advisory (judgment — not mechanized)
**Statement:** User-overridable knobs use `?=` (e.g. `FILE_KEY ?=`, `PYTHON ?=`,
`PKG_MANAGER ?=`); internal fixed paths use `:=` (e.g. `SDK_DIR :=`, `PID_FILE :=`); all
variables are declared before the first target.
**Rationale:** `?=` is the documented override surface (`make run FILE_KEY=...`); `:=`
marks what is not meant to be overridden.
**Evidence:** `msh-sdk-figma-downloader/v300/packages/ts/Makefile`,
`msh-sdk-figma-downloader/v300/packages/py/Makefile`,
`msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile`.
**Audit:** judgment — reviewed in update mode, not emitted by the script.

## MK-08 — Tab-indented recipes

**Tag:** mandatory
**Statement:** Recipe lines are indented with a real tab, never spaces.
**Rationale:** Space-indented recipes are a make syntax error ("missing separator") —
the most common editor-introduced corruption.
**Evidence:** all 12 files.
**Audit:** any line directly following a rule line that starts with spaces then a command.

## MK-09 — `.ONESHELL` bash family (accepted variant)

**Tag:** mandatory (conditional — only emitted when `.ONESHELL:` is present)
**Statement:** A Makefile may adopt the family style for long-running UI / dev-server
packages: `SHELL := /bin/bash` + `.ONESHELL:` + `.SHELLFLAGS := -euo pipefail -c`,
awk-generated help (the MK-05 accepted variant), and the dev-server target vocabulary
(`dev stop up down watch status logs`, all MK-06-recognized extensions). When
`.ONESHELL:` is present, `SHELL := /bin/bash` and a `.SHELLFLAGS` containing
`pipefail` MUST accompany it.
**Rationale:** Under `.ONESHELL` every recipe runs as one multi-line shell script; with
the default `/bin/sh -c` and no `-e`/`pipefail`, a failing mid-recipe command is
silently swallowed and make reports success. The trio restores fail-fast semantics.
Update mode must never rewrite this family toward the echo-curated reference style.
**Evidence:** `msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile`,
`msh-ui-FigmaFileHealthMetrics/v100/Makefile`, `msh-ui-FigmaFindConsole/v100/Makefile`,
`msh-sdk-figma-find/v100/packages/ts/Makefile` (4 non-archived files, complete trio in
each).
**Audit:** if `.ONESHELL` is declared and either `SHELL := /bin/bash` or a
`.SHELLFLAGS` line containing `pipefail` is missing → `error`; silent otherwise.

## Known variants

- **awk-help + `.ONESHELL` style** (`SHELL := /bin/bash`, `.ONESHELL:`,
  `.SHELLFLAGS := -euo pipefail -c`, awk-generated help): the msh-ui trio and
  `msh-sdk-figma-find/v100/packages/ts/Makefile`. Codified as **MK-09** (2026-08-24) —
  a coherent alternative style; update mode must not silently rewrite it toward the
  reference.
- **Outlier:** `msh-primitive-figma-node-types/v100/packages/py-figma-node-types/Makefile`
  predates the conventions (no header, no `.DEFAULT_GOAL`, no `##` docs) — a candidate
  for update mode, not evidence.

## Rule id policy

Ids are append-only. A new rule takes the next free MK-NN; ids are never renumbered and
never reused. A retired rule keeps its entry, tagged `retired`, so old findings stay
interpretable. Every change to this file is recorded in [CHANGELOG.md](CHANGELOG.md).

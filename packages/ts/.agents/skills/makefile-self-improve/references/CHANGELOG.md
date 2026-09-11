# Conventions Changelog

Ledger for every change to [conventions.md](conventions.md), newest first. Entry format:
`## <yyyy-mm-dd> — <one-line summary>`, followed by the rule ids touched, the evidence
paths (non-archived repo Makefiles only), and a one-line rationale. Entries are appended
by the Self-update procedure in [../SKILL.md](../SKILL.md) — never edit an old entry.

## 2026-08-24 — Calibration expectation refresh: figma-find now header-complete

- **Rules:** none changed (conventions.md untouched). SKILL.md's Self-update calibration
  list only: `msh-sdk-figma-find/v100/packages/ts/Makefile` expectation updated from
  "exit 1, MK-01 error + MK-05 warn" to "exit 1, MK-05 warn only".
- **Evidence:** `msh-sdk-figma-find/v100/packages/ts/Makefile:1-9` (the `##` header block
  added by the makefile-conventions-rollout plan, story 06/01/01); audit re-run observed
  empirically: warn-only output, exit code 1.
- **Rationale:** the plan fixed the file's MK-01 violation, so the old expectation would
  make every future amendment's step-3 calibration check fail against a now-clean header.

## 2026-08-24 — MK-09: `.ONESHELL` bash family codified as accepted variant

- **Rules:** MK-09 added (new id; MK-01…MK-08 untouched). Conditional-mandatory: when
  `.ONESHELL:` is present, `SHELL := /bin/bash` and a `pipefail` `.SHELLFLAGS` must
  accompany it; the family's awk-help and dev-server vocabulary are named as accepted.
- **Evidence:** `msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile`,
  `msh-ui-FigmaFileHealthMetrics/v100/Makefile`,
  `msh-ui-FigmaFindConsole/v100/Makefile`,
  `msh-sdk-figma-find/v100/packages/ts/Makefile`.
- **Rationale:** 4 non-archived Makefiles share the coherent style (≥2 threshold met);
  user accepted the convention ruling in the makefile-conventions-rollout plan
  (story 05/01/01, 2026-08-24). The mechanized check guards the one dangerous partial
  adoption (`.ONESHELL` without fail-fast shell), not the style choice itself.

## 2026-08-24 — Initial rule set MK-01…MK-08

- **Rules:** MK-01 header block, MK-02 `.DEFAULT_GOAL := help`, MK-03 `.PHONY` exact,
  MK-04 `## ` inline docs, MK-05 help/doc sync (variant-aware, advisory), MK-06 core
  vocabulary, MK-07 variable style (advisory, judgment-only), MK-08 tab recipes.
- **Evidence (12-file survey):**
  `msh-sdk-figma-downloader/v300/packages/ts/Makefile` (reference),
  `msh-sdk-figma-downloader/v300/packages/py/Makefile`,
  `msh-sdk-figma-downloader/v300/packages/Makefile`,
  `msh-sdk-figma-downloader/v200/packages/figma-downloader-ts/Makefile`,
  `msh-sdk-figma-downloader/v200/packages/figma-downloader-py/Makefile`,
  `msh-sdk-figma-downloader/v200/packages/Makefile`,
  `msh-sdk-figma-downloader/v100/Makefile`,
  `msh-sdk-figma-find/v100/packages/ts/Makefile`,
  `msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile`,
  `msh-ui-FigmaFileHealthMetrics/v100/Makefile`,
  `msh-ui-FigmaFindConsole/v100/Makefile`,
  `msh-primitive-figma-node-types/v100/packages/py-figma-node-types/Makefile` (outlier).
- **Rationale:** extracted from the msh-sdk-figma-downloader v300 family; reference:
  `packages/ts/Makefile`. MK-05's mechanized direction is "help never names a
  nonexistent target" because the reference family curates help (the py twin omits its
  no-op `install`), so "help mentions everything" would flag the reference itself.

---
name: makefile-self-improve
description: Create a house-style Makefile for a package, audit/update an existing one against the repo's Makefile conventions, or evolve the conventions themselves. Use when asked to add a Makefile, fix/standardize a Makefile, or when a Makefile diverges from msh-sdk-figma-downloader/v300/packages/ts/Makefile.
---

# makefile-self-improve

This skill encodes the RCM-figma house Makefile style. The authoritative reference is
`msh-sdk-figma-downloader/v300/packages/ts/Makefile`; the codified rules live in
[`references/conventions.md`](references/conventions.md) (stable ids MK-01…MK-08), the
instantiable starting points in [`references/templates/`](references/templates/), and the
mechanical checker in [`scripts/makefile-audit.sh`](scripts/makefile-audit.sh). Every flow
below cites MK-NN rule ids — never re-derive style from examples, and never edit the
rules outside the Self-update procedure.

**Routing:** if the target is an `msh-ui-*` package, use the **`msh-ui-makefile`** skill
instead — it owns UI-01…UI-12, the vite dev-server specialization of these rules, and its
output is checked against both rule sets. This skill still applies there (MK rules are
never suspended), but it does not know the family's port registry, lifecycle recipes, or
backend block.

## Mode dispatch

Decide the mode from the argument by file existence alone — no judgment:

| Argument | Mode |
| --- | --- |
| a directory with no `Makefile` inside | **Create** |
| a path to (or a directory containing) an existing `Makefile` | **Update** |
| the user explicitly asks to change/add/retire a convention | **Self-update** |
| none | list candidates and ask |

Candidate listing for the no-argument case (run from the repo root):

```bash
find . \( -name package.json -o -name pyproject.toml \) \
  -not -path '*/node_modules/*' -not -path '*/.archives/*' -not -path '*/legacy/*' \
  -not -path '*/.ai/*' -not -path '*/.claude/*' \
  | while read -r m; do d=$(dirname "$m"); [ -f "$d/Makefile" ] || echo "$d"; done | sort -u
```

Present the resulting directories and ask which to target.

Mid-flow route: **Update** mode may escalate into **Self-update** (see its escalation
rule) when it meets a coherent-but-different style rather than simple drift.

## Create mode

1. **Detect the package kind** and pick the template:

   | Signal in the target directory | Template |
   | --- | --- |
   | `package.json` present | `references/templates/Makefile.node-package.tmpl` |
   | `pyproject.toml`, or a top-level python package dir (`<name>/__init__.py`) | `references/templates/Makefile.python-package.tmpl` |
   | no sources of its own, but child dirs containing Makefiles | `references/templates/Makefile.umbrella.tmpl` |
   | both node and python signals | ask the user |

2. **Instantiate in the scratchpad** (never draft in the package): copy the template,
   delete its placeholder-legend block, and fill every `{{...}}` marker per the
   value-source table below. Delete optional blocks whose placeholder has no source, and
   remove the deleted target's name from `.PHONY` and the help body in the same edit.

   | Placeholder | Source | If absent |
   | --- | --- | --- |
   | `{{PACKAGE_NAME}}` | `name` in `package.json` / `[project].name` in `pyproject.toml` / directory name (umbrella) | directory name |
   | `{{PACKAGE_DESC}}` | `description` field | one line written from the package README |
   | `{{TYPECHECK_COMMAND}}` | `scripts.typecheck`; else `node --check` over sources / `$(PYTHON) -m py_compile` over sources | `@echo "TODO: typecheck"` + flag to user |
   | `{{TEST_COMMAND}}` | `scripts.test` / configured runner; else `$(PYTHON) -m unittest discover` when a `tests/` dir exists | `@echo "TODO: test"` + flag to user |
   | `{{RUN_COMMAND}}` | `bin` entry in `package.json` / `__main__` module | delete the optional `run` block entirely |
   | `{{BUILD_DEP}}` | build commands for workspace `file:` deps that ship built output (reference: the `sdk` target) | delete the optional `sdk` block (and the `sdk` prerequisite on `test:`) |
   | `{{CHILD_DIRS}}` | child dirs containing Makefiles | n/a — umbrella requires them |

   **Hard rule: never invent a command the package does not define.** A mandatory target
   with no real source gets a `@echo "TODO: ..."` recipe and an explicit callout in the
   final report — never a guessed invocation.

3. **Verify the candidate** (still in the scratchpad):
   - `grep '{{' <candidate>` → no output;
   - `make -n -f <candidate> help` and `make -n -f <candidate> <target>` for every
     `.PHONY` target succeed (note: recipes containing `$(MAKE)` recurse even under
     `-n` — for an umbrella, run from a directory where the child paths resolve);
   - `scripts/makefile-audit.sh <candidate>` exits 0.

4. **Install**: move the candidate to `<package>/Makefile` only after step 3 passes.

5. **Present**: show the user the generated file and the audit output. Do not commit.

## Update mode

1. **Read the whole Makefile** before touching it.
2. **Audit**: `scripts/makefile-audit.sh <path>`; capture the `MK-NN⇥severity⇥message`
   findings.
3. **Apply the mapped minimal edit** for each finding, per the finding→edit table below.
4. **Re-run the audit**; loop steps 3–4 until it exits 0, or until only `warn` findings
   remain that the user has explicitly declined to take.
5. **Regression gate**: `make -n <target>` for every `.PHONY` target must still succeed.
6. **Present a unified diff** of the Makefile. Do not commit.

Finding→edit map (`auto` = apply directly; `review` = apply, then call it out to the
user in the diff presentation):

| Rule | Edit | Kind |
| --- | --- | --- |
| MK-01 missing header block | Compose a `##` header from the package's README/manifest: name line + contract lines | review |
| MK-02 missing/wrong `.DEFAULT_GOAL` | Set `.DEFAULT_GOAL := help` (add a `help` target from the matching template if none exists) | auto |
| MK-03 target missing from `.PHONY` | Append the target name to the `.PHONY` line | auto |
| MK-03 stale `.PHONY` entry | Remove only the word from the `.PHONY` line — never delete the target | auto |
| MK-04 phony target lacks `## ` doc | Add a one-line doc derived from the recipe | review |
| MK-05 help out of sync (echo style) | Add/adjust echo lines to match the `##` docs — canonical direction is `##` → help, never the reverse | auto |
| MK-05 awk-help variant (warn) | Leave as-is unless the user asks otherwise | — |
| MK-06 missing mandatory target | Add the block from the matching template, filling commands per the create-mode value-source table (TODO-echo if sourceless) | review |
| MK-08 space-indented recipe | Re-indent with a tab | auto |
| MK-09 `.ONESHELL` without the bash fail-fast trio | Add the missing `SHELL := /bin/bash` and/or `.SHELLFLAGS := -euo pipefail -c` beside `.ONESHELL:` — never remove `.ONESHELL` itself | auto |

MK-07 (variable style) is judgment-only — the audit never emits it; check it by eye and
propose changes separately.

**Preservation rules (binding):**

> Never delete or rename an unrecognized target, variable, or comment. Never reorder
> existing recipes. Package-specific targets (`mock`, `run`, `parity`, `sdk`, `dev`,
> `test-integration`, …) are legitimate vocabulary extensions — they get docs added,
> never removal.

**Escalation rule:** if the Makefile's style is coherent but systematically different —
e.g. awk-generated help throughout, `.ONESHELL` with `SHELL := /bin/bash` (the msh-ui
family style) — do not rewrite it toward the reference. For an `msh-ui-*` package that
style is codified: hand off to the **`msh-ui-makefile`** skill (UI-01…UI-12) rather than
editing. Otherwise stop editing and route to [Self-update](#self-update) for the
drift-vs-convention decision.

## Self-update

How this skill improves itself when it meets a Makefile pattern that
[`references/conventions.md`](references/conventions.md) does not cover.

### Decision rule — drift or convention?

An unknown pattern is a **candidate convention** iff at least one of:

- it appears in **≥2** Makefiles found by the non-archived sweep
  (`find . -name Makefile -not -path '*/node_modules/*' -not -path '*/.archives/*'
  -not -path '*/legacy/*' -not -path '*/.ai/*'` from the repo root) — paths under
  `.archives/` or `legacy/` **never** count as evidence;
- the user explicitly requests it as a convention.

Otherwise it is **drift**: return to [Update mode](#update-mode) and fix the Makefile.

### Amendment procedure

1. **Edit `references/conventions.md`.** A new rule takes the next free MK-NN id. Never
   renumber, never reuse an id; a retired rule keeps its entry, tagged `retired`.
2. **Append a dated entry to [`references/CHANGELOG.md`](references/CHANGELOG.md)**:
   rule id(s) touched, what changed, the evidence paths, and a one-line rationale.
3. **If the rule is mechanically checkable**, update
   [`scripts/makefile-audit.sh`](scripts/makefile-audit.sh) and its severity map in the
   same change, then re-run the calibration set and confirm the expected outcomes:
   - `msh-sdk-figma-downloader/v300/packages/ts/Makefile` → exit 0
   - `msh-sdk-figma-downloader/v300/packages/py/Makefile` → exit 0
   - `msh-sdk-figma-downloader/v300/packages/Makefile` → exit 0
   - `msh-sdk-figma-find/v100/packages/ts/Makefile` → exit 1, MK-05 warn only (awk-help
     variant; the MK-01 header was added 2026-08-24 by the makefile-conventions-rollout
     plan — warn-only findings still exit 1)
4. **Present the combined diff** of `conventions.md` + `CHANGELOG.md` + the audit script
   to the user before declaring done. Do not commit.

The finding→edit table in [Update mode](#update-mode) must gain a row whenever an
amendment adds an audit-emittable rule.

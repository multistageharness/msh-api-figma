---
name: msh-ui-makefile
description: Set up or update the Makefile of an msh-ui-* frontend package — the vite dev-server organism pattern (PORT knob, PID/log lifecycle, run-server/run-preview, optional backend block) that RCM-figma's UI components all share. Use when adding a Makefile to a new msh-ui-* component, when one drifts from its siblings, when a dev-server target (dev/stop/up/down/watch/status/logs/run-server) is missing or misbehaving, when allocating a port for a new UI organism, or when wiring a dev/server backend into one.
---

# msh-ui-makefile

The `msh-ui-*` packages in RCM-figma are near-identical by construction: each is an
atomic-design **organism** with a vite dev server, a port it owns, and the same eight
lifecycle targets. **Lines 9–66 of every non-backend one are byte-identical modulo
`$(PORT)`** (verified 2026-08-26). This skill exists to keep that true — the pattern is
copied, never re-derived.

The rules live in [`references/conventions.md`](references/conventions.md) (stable ids
**UI-01…UI-12**), the instantiable pattern in
[`references/templates/`](references/templates/), and the mechanical checkers in
[`scripts/`](scripts/). Every flow below cites UI-NN ids — never re-derive style from
one example package, and never edit the rules outside the Self-update procedure.

## Relationship to `makefile-self-improve` — read this first

Two skills, one Makefile, no overlap:

| | `makefile-self-improve` | **this skill** |
| --- | --- | --- |
| Scope | every Makefile in RCM-figma (SDK, API, UI) | `msh-ui-*` frontend packages only |
| Owns | MK-01…MK-09, the repo-wide house style | UI-01…UI-12, the vite dev-server specialization |
| Answers | "is this a house-style Makefile?" | "is this an msh-ui organism Makefile?" |

**Both audits must pass.** UI rules layer on top of MK rules and never contradict them.
Run this skill's audit *and* the house one on anything you produce:

```bash
.claude/skills/msh-ui-makefile/scripts/ui-makefile-audit.sh   <path>   # UI-01..UI-12
.claude/skills/makefile-self-improve/scripts/makefile-audit.sh <path>  # MK-01..MK-09
```

**Expected non-finding:** the house audit always emits exactly one `warn` on this
family —

```
MK-05	warn	help is awk-generated from $(MAKEFILE_LIST) (accepted variant; echo-curated is the reference style)
```

That is the ratified MK-09 variant, not drift. **Never "fix" it** by converting the
awk help to echo-curated help — MK-09's own text forbids rewriting this family toward
the reference style. A house-audit run on an msh-ui Makefile is clean when that warn is
the only line.

If the target package is **not** `msh-ui-*`, stop and use `makefile-self-improve`
instead.

## Mode dispatch

Decide by file existence alone — no judgment:

| Situation | Mode |
| --- | --- |
| an `msh-ui-*` package directory with no `Makefile` | **Setup** |
| an `msh-ui-*` package with a `Makefile` | **Update** |
| the package has `dev/server/` but no `backend` target | **Add-backend** (after Update) |
| the user asks to change/add/retire a UI-NN convention | **Self-update** |
| no argument | run the survey below and ask which package |

Survey (from the RCM-figma root):

```bash
.claude/skills/msh-ui-makefile/scripts/ui-port-registry.sh          # the family + its ports
for m in msh-ui-*/*/Makefile; do
  printf '%s: ' "$m"
  .claude/skills/msh-ui-makefile/scripts/ui-makefile-audit.sh "$m" | tr '\n' ' ' || true
  echo
done
```

## Setup mode

For a new UI organism, or one that never had a Makefile.

1. **Allocate the port (UI-04, UI-05)** — this comes first, because it is the only value
   that must be consistent across four files:

   ```bash
   .claude/skills/msh-ui-makefile/scripts/ui-port-registry.sh --next   # e.g. 5207
   ```

   The allocator returns the lowest free port **at or above the family's floor** (5205);
   it never hands out 5200–5204, since nothing records what reserved them.

2. **Instantiate the template** in the scratchpad — never draft inside the package.
   Copy [`references/templates/Makefile.msh-ui.tmpl`](references/templates/Makefile.msh-ui.tmpl),
   delete its placeholder-legend block, and fill the three markers:

   | Placeholder | Source | If absent |
   | --- | --- | --- |
   | `{{PACKAGE_NAME}}` | `name` in `package.json` | directory name — and flag it |
   | `{{ORGANISM_DESC}}` | the opening sentence of the package `README.md`, naming the organism | one line written from `src/` — and flag it |
   | `{{PORT}}` | step 1 | n/a — never guess a port |

   Everything below the knob block is the invariant core (UI-06). Copy it verbatim: do
   not reflow, re-indent, or "improve" a recipe. Recipes are tab-indented (MK-08) — check
   that the copy did not convert tabs to spaces.

3. **Make the port true in the other three places (UI-04, UI-12).** The Makefile only
   *addresses* the port; vite owns it. All four must agree:

   | File | Required content |
   | --- | --- |
   | `Makefile` | `PORT ?= <N>` **and** the `PORT=<N>` mention in the `##` header |
   | `vite.config.ts` | `server: { port: <N>, strictPort: true }` — `strictPort` is mandatory |
   | `README.md` | the quick-start `http://localhost:<N>` |
   | `.AGENT.md` | the `Dev URL: http://localhost:<N>` line |

   Without `strictPort`, vite silently picks another port when `<N>` is taken and every
   Makefile target then addresses the wrong one.

4. **If the package has `dev/server/`**, continue into [Add-backend](#add-backend-mode)
   before verifying.

5. **Verify** (still in the scratchpad):
   - `grep '{{' <candidate>` → no output;
   - `scripts/ui-makefile-audit.sh <candidate>` → exit 0;
   - `makefile-self-improve/scripts/makefile-audit.sh <candidate>` → only the expected
     MK-05 awk-help warn;
   - `make -n -f <candidate> <target>` succeeds for every `.PHONY` target.

6. **Install** — move the candidate to `<package>/Makefile` only after step 5 passes.
   Then run `scripts/ui-port-registry.sh` from the repo root: it must show the new row
   with matching `MAKEFILE`/`VITE`/`DOCS` columns and report no `COLLISION`.

7. **Present** the file and both audit outputs. Do not commit.

## Update mode

For an existing `msh-ui-*` Makefile that has drifted from its siblings.

1. **Read the whole Makefile** before touching it.
2. **Audit both ways** — `scripts/ui-makefile-audit.sh <path>` and the house
   `makefile-audit.sh <path>`; capture the `UI-NN`/`MK-NN` findings.
3. **Run `scripts/ui-port-registry.sh`** for the cross-file rules (UI-04, UI-05, UI-12)
   the single-file audit cannot see.
4. **Apply the mapped minimal edit** for each finding, per the table below.
5. **Re-audit**; loop 4–5 until the UI audit exits 0 and the house audit shows only the
   expected MK-05 warn.
6. **Regression gate:** `make -n <target>` for every `.PHONY` target still succeeds.
7. **Present a unified diff.** Do not commit.

Finding→edit map (`auto` = apply directly; `review` = apply, then call it out):

| Rule | Edit | Kind |
| --- | --- | --- |
| UI-01 missing/short header | Compose the `##` block from the package README: name line, organism sentence, lifecycle + `PORT=N` contract | review |
| UI-01 header port ≠ knob | Correct the **header** to match `PORT ?=`, never the reverse (the knob is checked against vite by UI-04) | auto |
| UI-02 missing/reordered preamble | Restore the exact four lines in order | auto |
| UI-03 missing/renamed knob | Restore the knob with its required operator and default | auto |
| UI-04 Makefile/vite mismatch | Ask which port is correct, then make all four files agree (step 3 of Setup) — never pick one silently | review |
| UI-04 `strictPort` absent | Add `strictPort: true` to `vite.config.ts` | auto |
| UI-05 collision | Reallocate the *newer* package via `--next` and update its four files | review |
| UI-06 missing lifecycle target | Copy the block verbatim from the template; add the name to `.PHONY` in the same edit | auto |
| UI-07 `stop` missing a tier | Replace the whole `stop` recipe with the template's — partial tiers are worse than none | auto |
| UI-07 `dev`/`clean` missing `stop` dep | Add the prerequisite | auto |
| UI-08 missing `run-server`/`run-preview` | Add from the template (backend variant if `dev/server/` exists); update `.PHONY` and the header's lifecycle list | auto |
| UI-10 backend target absent | Route to [Add-backend](#add-backend-mode) | review |
| UI-11 `$(PKG_MANAGER)` inside a sibling checkout | Replace with that repo's own manager (`npm`) | auto |
| UI-12 doc port drift | Update `README.md`/`.AGENT.md` to the Makefile's port | auto |

**Preservation rules (binding):**

> Never delete or rename an unrecognized target, variable, or comment. Never reorder
> existing recipes. A package-specific target beyond the family vocabulary is a
> legitimate extension — it gets a `## ` doc (MK-04) and a `.PHONY` entry, never removal.
> Never remove `.ONESHELL:` on the grounds that it is inert (UI-09).

**Escalation rule:** if the divergence is coherent and deliberate rather than drift —
a second package implementing the backend block, a new lifecycle verb appearing in more
than one package — stop editing and route to [Self-update](#self-update).

## Add-backend mode

Only for a package whose `vite.config.ts` mounts something from `dev/server/`. Reference
implementation: `msh-ui-FigmaFindConsole/v100/Makefile`. This is **UI-10**, an optional
extension with a single reference implementation — not yet a ratified convention.

1. **Enumerate the sibling repos** the dev server imports, and for each one record: the
   checkout path, the build command **in that repo's own package manager**, and the
   `node_modules` path that proves the link exists.
2. **Splice** [`references/templates/backend-block.tmpl`](references/templates/backend-block.tmpl),
   once per sibling, working through its four-item splice checklist in full: knobs,
   `.PHONY`, the `backend` prerequisite on `dev`/`watch`/`run-server`, and the header
   block. A partial splice is inert.
3. **Honour graceful degradation (UI-10).** A missing sibling checkout prints a
   remediation hint and `exit 0`. The dev server must still boot with the route
   returning 503 — the UI is the deliverable; the sibling repos are optional context.
   Never let a missing checkout fail `make dev`.
4. **Honour UI-11.** Inside a sibling checkout, run that repo's own manager (`npm` for
   the current siblings). `$(PKG_MANAGER)` is correct only for linking back into *this*
   package. Running `pnpm install` inside an npm-installed sibling displaces its
   `node_modules` — a destructive side effect of a target that claims only to build.
5. **Honour UI-09.** macOS ships GNU Make 3.81, where `.ONESHELL:` is parsed and
   **ignored**: every recipe line runs in its own shell. Multi-line logic needs `\`
   continuations with `;` separators, and every directory change needs a
   `( cd … && … )` subshell. A bare `cd` on its own line does not carry to the next.
6. **Verify** both degradation paths, since only one is usually exercised:
   ```bash
   make backend                                   # siblings present: builds + links
   make backend <SIBLING>_DIR=/nonexistent        # absent: hint + exit 0, never failure
   make -n dev && make -n watch && make -n run-server   # all reach backend first
   ```
7. Re-run both audits and present the diff. Do not commit.

## Self-update

How this skill improves itself when it meets an `msh-ui-*` pattern
[`references/conventions.md`](references/conventions.md) does not cover.

### Decision rule — drift or convention?

An unknown pattern is a **candidate convention** iff at least one of:

- it appears in **≥2** `msh-ui-*` packages found by the non-archived sweep
  (`ls -d msh-ui-*/*/Makefile` from the repo root) — paths under `.archives/` or
  `legacy/` **never** count as evidence;
- the user explicitly requests it as a convention.

Otherwise it is **drift**: return to [Update mode](#update-mode) and fix the Makefile.

The ≥2 threshold is why UI-10 is tagged advisory with one reference implementation.
When a second package grows a `dev/server/` backend, re-tag UI-10
mandatory-when-applicable and promote its audit findings from `warn` to `error` in the
same change.

### Amendment procedure

1. **Edit `references/conventions.md`.** A new rule takes the next free UI-NN. Never
   renumber, never reuse; a retired rule keeps its entry, tagged `retired`.
2. **Append a dated entry to [`references/CHANGELOG.md`](references/CHANGELOG.md)**:
   rule ids touched, what changed, the evidence paths, and a one-line rationale.
3. **If the rule is mechanically checkable**, update
   [`scripts/ui-makefile-audit.sh`](scripts/ui-makefile-audit.sh) (single-file) or
   [`scripts/ui-port-registry.sh`](scripts/ui-port-registry.sh) (cross-file) and its
   severity map in the same change, then re-run the calibration set and confirm:

   | Target | Expected |
   | --- | --- |
   | `msh-ui-FigmaFileHealthMetrics/v100/Makefile` | exit 0 |
   | `msh-ui-FigmaFindConsole/v100/Makefile` | exit 0 (the backend reference) |
   | `msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile` | exit 0 |
   | `ui-port-registry.sh` over the family | exit 0, three rows, ports 5205/5206/5208 |
   | `ui-port-registry.sh --next` | 5207 |
   | a template instantiated per Setup mode | exit 0 from both audits (bar the MK-05 warn) |

4. **If the change touches the invariant core**, apply it to **every** `msh-ui-*`
   package in the same change and re-verify the byte-identity claim:
   ```bash
   sed 's/520[0-9]/PORT/g' msh-ui-A/v100/Makefile > /tmp/a.mk
   sed 's/520[0-9]/PORT/g' msh-ui-B/v100/Makefile > /tmp/b.mk
   diff /tmp/a.mk /tmp/b.mk   # only the header block and .PHONY may differ
   ```
   A core change landed in one package and not its siblings is how this family stops
   being a family.
5. **Present the combined diff** — `conventions.md` + `CHANGELOG.md` + scripts +
   affected Makefiles — before declaring done. Do not commit.

The finding→edit table in [Update mode](#update-mode) must gain a row whenever an
amendment adds an audit-emittable rule.

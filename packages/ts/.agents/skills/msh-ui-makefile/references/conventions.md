# msh-ui-* Makefile Conventions — the vite dev-server organism pattern

Extracted 2026-08-26 from the three non-archived `msh-ui-*` packages in RCM-figma:

| Package | Path | PORT | Backend |
| --- | --- | --- | --- |
| `@internal/figma-file-health-metrics` | `msh-ui-FigmaFileHealthMetrics/v100/Makefile` | 5205 | no |
| `@internal/figma-absolute-to-react-mapping` | `msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile` | 5206 | no |
| `@internal/figma-find-console` | `msh-ui-FigmaFindConsole/v100/Makefile` | 5208 | yes |

These rules are cited by stable id (**UI-NN**) from `../SKILL.md` and mechanized by
`../scripts/ui-makefile-audit.sh`. Ids are append-only — never renumbered, never reused;
a retired rule keeps its entry tagged `retired`. Every change is recorded in
[CHANGELOG.md](CHANGELOG.md).

Tag meanings: **mandatory** — the audit reports a violation as `error`; **advisory** —
reported as `warn`; **judgment** — reviewed by eye, never emitted by the script.

## Relationship to `makefile-self-improve`

That skill owns the **repo-wide** house style (MK-01…MK-09) across SDK, API and UI
packages. This skill owns the **msh-ui-* frontend specialization** of it. The layering is
strict and non-negotiable:

- MK rules still apply in full. A Makefile this skill produces must exit 0 from
  `makefile-self-improve/scripts/makefile-audit.sh` as well as from this skill's audit.
- Where both speak, MK states the general rule and UI states the concrete msh-ui value.
  MK-09 ratifies the `.ONESHELL` bash family as an accepted variant; **UI-02** fixes its
  exact four-line form. MK-06 lists `dev stop up down watch status logs` as recognized
  extensions; **UI-06** makes them mandatory for this family and fixes their recipes.
- This skill never contradicts an MK rule. If following a UI rule would violate an MK
  rule, that is a defect in this document — fix it through the Self-update procedure,
  not by shipping the Makefile.

## The invariant core

The single most important fact about this family: **everything from `SHELL :=` to the
end of a non-backend `msh-ui-*` Makefile is byte-identical modulo `$(PORT)`**. Verified
2026-08-26:

```bash
sed 's/520[0-9]/PORT/g' msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile > /tmp/a.mk
sed 's/520[0-9]/PORT/g' msh-ui-FigmaFileHealthMetrics/v100/Makefile      > /tmp/b.mk
diff /tmp/a.mk /tmp/b.mk   # only the header block, and one local ## comment, differ
```

That core is boilerplate to be **copied**, never retyped. Three substitution points
(package name, organism description, port) plus the optional backend chain cover every
observed difference. That is what makes the pattern repeatable across UI components.

Package-specific `##` comments *inside* the core are allowed and are not drift — e.g.
`msh-ui-FigmaFileHealthMetrics/v100/Makefile:69-71` explains why its `run-server` has no
backend to prepare. Comments explain a package's position in the family; recipes do not
get to vary.

## UI-01 — Organism header block

**Tag:** mandatory
**Statement:** The file opens with a `##` block (MK-01) whose first content line is
`<package-name> — vite dev-server Makefile`, followed by a sentence identifying the
atomic-design organism, then the lifecycle contract: which targets manage the dev server,
the `PORT=NNNN`, that PID/log files back it, that `typecheck`/`test` run offline, and
that `install` uses `PKG_MANAGER` (default pnpm).
**Rationale:** These packages are near-identical by construction, so the header is the
only place a reader learns *which* organism this is and what is different about it —
the port it owns, and whether a backend is wired in.
**Evidence:** 3/3 — `msh-ui-FigmaFindConsole/v100/Makefile:1-22`,
`msh-ui-FigmaFileHealthMetrics/v100/Makefile:1-10`,
`msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile:1-9`.
**Audit:** a `##` line matching `vite dev-server Makefile` within the first 10 lines, and
a `##` line naming the port that agrees with `PORT ?=`.

## UI-02 — The fail-fast preamble, exact and in order

**Tag:** mandatory
**Statement:** Immediately after the header, these four lines appear in this order:

```make
SHELL := /bin/bash
.DEFAULT_GOAL := help
.ONESHELL:
.SHELLFLAGS := -euo pipefail -c
```

**Rationale:** The MK-09 trio, pinned to one spelling. `.ONESHELL` without
`-euo pipefail` silently swallows mid-recipe failures and reports success; `SHELL` must
be bash because `.SHELLFLAGS` uses `-o pipefail`, which `/bin/sh` on macOS does not
accept. Order is fixed so the block is diffable across the family at a glance.
**Evidence:** 3/3, byte-identical —
`msh-ui-FigmaFindConsole/v100/Makefile:23-26`,
`msh-ui-FigmaFileHealthMetrics/v100/Makefile:11-14`,
`msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile:10-13`.
**Audit:** all four lines present; `.DEFAULT_GOAL` is MK-02's job, the rest are UI-02's.

## UI-03 — The four knobs

**Tag:** mandatory
**Statement:** Exactly these variables, with these operators and defaults, declared
before the first target:

```make
PKG_MANAGER ?= pnpm
PORT        ?= <the organism's port>
PID_FILE    := .dev.pid
LOG_FILE    := .dev.log
```

`?=` for the two override surfaces (`make dev PORT=5299`), `:=` for the two fixed paths
(MK-07). A backend-integrated package adds sibling-path knobs after these, `?=` for the
checkout paths and `:=` for the derived `node_modules` link paths.
**Rationale:** `stop`, `status`, `logs`, `clean` and `health` all address the server
through exactly these four names. Renaming one silently breaks the lifecycle in a way
`make -n` cannot catch.
**Evidence:** 3/3 —
`msh-ui-FigmaFindConsole/v100/Makefile:28-31` (plus its sibling knobs at 39-49),
`msh-ui-FigmaFileHealthMetrics/v100/Makefile:16-19`,
`msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile:15-18`.
**Audit:** each of the four present with the required operator; `PKG_MANAGER` defaults to
`pnpm`; `PID_FILE`/`LOG_FILE` are `.dev.pid`/`.dev.log`.

## UI-04 — `PORT` agrees with `vite.config.ts`

**Tag:** mandatory (cross-file)
**Statement:** `PORT ?= N` in the Makefile equals `server: { port: N, strictPort: true }`
in the package's `vite.config.ts`. `strictPort: true` is itself required.
**Rationale:** This is the family's sharpest footgun. Vite owns the listening port;
the Makefile only *addresses* it — `stop` kills `lsof -ti tcp:$(PORT)`, `status` reports
`$(PORT)`, `health` curls `$(PORT)`. If the two disagree, `make dev` starts a server and
`make stop` silently no-ops on an empty port, leaving an orphan holding the real one.
`strictPort` matters for the same reason: without it vite quietly falls back to the next
free port and every Makefile target is then pointed at the wrong one.
**Evidence:** 3/3 — 5205 (`vite.config.ts:7` / `Makefile:17`), 5206
(`vite.config.ts:7` / `Makefile:16`), 5208 (`vite.config.ts:10` / `Makefile:29`).
**Audit:** `../scripts/ui-port-registry.sh` — parses both files per package and reports
`MISMATCH`.

## UI-05 — One port per organism, allocated from the 52xx block

**Tag:** mandatory (cross-package)
**Statement:** Every `msh-ui-*` package owns a distinct port in the 5200–5299 block. A
new organism takes the lowest free port **at or above the family's current floor** (5205
today); ports are never recycled from a retired package without updating its docs.
Nothing in the tree records why 5200–5204 were skipped, so the allocator does not hand
them out — moving the floor down is a deliberate decision, not a default.
**Rationale:** `strictPort: true` (UI-04) turns a collision into a hard startup failure,
and the family is explicitly designed to run several organisms side by side.
**Evidence:** 5205, 5206, 5208 — distinct, no collisions (2026-08-26 sweep). 5207 is
free and is the next allocation; nothing in the tree claims it.
**Audit:** `../scripts/ui-port-registry.sh` — reports `COLLISION` and prints the next
free port.

## UI-06 — The invariant lifecycle core

**Tag:** mandatory
**Statement:** These eight targets exist with the recipes given in
`../references/templates/Makefile.msh-ui.tmpl`, copied verbatim:
`clean dev watch stop status logs up down`. Their bodies are not a matter of local
judgment — differences between packages are drift, not personality.
**Rationale:** Agents and humans drive every organism through the same verbs. The
recipes encode non-obvious details (the background `&` + `$$!` PID capture, the
`sleep 1` before reading the PID file, `kill -0` for liveness) that get quietly
re-derived wrong when retyped.
**Evidence:** byte-identical across
`msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile:28-66` and
`msh-ui-FigmaFileHealthMetrics/v100/Makefile:29-67` (verified by the port-normalized
diff above); `msh-ui-FigmaFindConsole/v100/Makefile:121-159` matches except for the
`backend` prerequisites UI-10 adds.
**Audit:** all eight defined.

## UI-07 — `stop` is three-tier and idempotent; `dev` and `clean` depend on it

**Tag:** mandatory
**Statement:** `stop` escalates PID file → `lsof -ti tcp:$(PORT)` → `pkill -f
"vite.*$(PORT)"`, swallows every failure (`|| true`), and ends with a bare `@true`.
`dev: stop` and `clean: stop` both list it as a prerequisite.
**Rationale:** `stop` must succeed against a server that was never started, one whose
PID file is stale, and one started outside make — otherwise `make dev` (which stops
first) fails on a clean checkout. The trailing `@true` guarantees exit 0 even when the
final `pkill` matched nothing, which under `-e` would otherwise abort the target.
**Evidence:** 3/3 — `msh-ui-FigmaFileHealthMetrics/v100/Makefile:42-51`,
`msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile:41-50`,
`msh-ui-FigmaFindConsole/v100/Makefile:134-143`; `dev: stop` at `:32`, `:31`, `:124`.
**Audit:** `stop` recipe contains all three tiers; `dev` and `clean` list `stop`.

## UI-08 — The foreground pair: `run-server` and `run-preview`

**Tag:** mandatory
**Statement:** `run-server` runs the dev server in the **foreground** — the documented
"just run the app" entry point, distinct from `dev` (background, PID-file managed) and
from `watch` (foreground, no extra preflight). `run-preview` runs
`$(PKG_MANAGER) run build` then `$(PKG_MANAGER) run preview` against the production
bundle. In a backend-integrated package `run-server` depends on `backend` and prints any
environment preflight warning first (UI-10).
**Rationale:** `dev` detaches, so a caller who wants to watch output and Ctrl-C out
needs a foreground target that is still the *full* app — including backend preparation
where one exists. `run-preview` is the only way to exercise the built bundle, which is
what the organism actually ships.
**Evidence:** 3/3 — `msh-ui-FigmaFindConsole/v100/Makefile:161-170` (backend variant),
`msh-ui-FigmaFileHealthMetrics/v100/Makefile:72-78`,
`msh-ui-FigmaAbsoluteToReactMapping/v100/Makefile:68-74`. The rule was ratified at 2/3
(the ≥2 threshold); `msh-ui-FigmaAbsoluteToReactMapping` lacked both targets until the
2026-08-26 rollout, which update mode fixed, bringing it to 3/3.
**Audit:** both targets defined; `run-preview` invokes build then preview.

## UI-09 — `.ONESHELL` is inert under macOS make 3.81

**Tag:** mandatory
**Statement:** Despite UI-02 declaring `.ONESHELL:`, assume **every recipe line runs in
its own shell**. Multi-line shell logic therefore uses explicit `\` continuations with
`;` separators, and any directory change is wrapped in a `( cd … && … )` subshell — never
a bare `cd` on its own line. A variable set on one line is not visible on the next.
**Rationale:** `.ONESHELL` was added in GNU Make 3.82; macOS ships 3.81 (verified:
`make --version` → `GNU Make 3.81`), which parses the directive and ignores it. A recipe
written in true one-shell style — bare `cd`, then a command on the next line — runs that
command in the *original* directory, and a bare `cd` leaks nothing but also protects
nothing. This is the family's most common silent breakage; `msh-ui-FigmaFindConsole`
carries an in-file NOTE about it precisely because its backend targets were written
against it.
**Rationale for keeping `.ONESHELL` anyway:** it is correct-and-inert here and correct
under 3.82+ where the `-euo pipefail` flags also start applying per-recipe; removing it
would be a regression on any non-macOS runner. Never "fix" UI-02 by deleting it.
**Evidence:** `msh-ui-FigmaFindConsole/v100/Makefile:59-63` (the NOTE) and its
`figma-find`/`msh-api-figma` recipes at `:64-109`; the `stop`/`status` recipes in all
three packages use `\` continuations for exactly this reason.
**Audit:** judgment — the script cannot tell an intended-multiline recipe from a
sequence of independent lines. Reviewed by eye in setup and update mode.

## UI-10 — The backend integration block (optional extension)

**Tag:** advisory — **one reference implementation only**
**Statement:** When a package has a `dev/server/` mounted by `vite.config.ts`, it adds:

1. one prepare target per sibling repo it consumes (build, then link into
   `node_modules`);
2. an aggregate `backend:` target depending on all of them, which `dev`, `watch` and
   `run-server` take as a prerequisite;
3. a `health:` target curling the running server's health endpoint;
4. `?=` knobs for each sibling checkout path (so the repos are relocatable and each is
   repointable independently) and `:=` for the derived link paths.

**Graceful degradation is the binding part:** a missing sibling checkout prints a
remediation hint and `exit 0` — never a failure. The dev server must still boot with the
route returning 503, because the UI is the deliverable and the sibling repos are
optional context.
**Rationale:** These organisms are demoed and reviewed on machines that have only some
of the sibling checkouts. A hard failure here makes the whole package un-runnable to
prepare a backend the reviewer may not need.
**Evidence:** `msh-ui-FigmaFindConsole/v100/Makefile:33-119,161-166` — **1/3 packages**.
Per the ≥2 threshold this is a documented optional pattern with a single reference
implementation, **not** a ratified convention. Re-tag it mandatory-when-applicable once
a second package implements it.
**Audit:** conditional — only when `dev/server/` exists in the package. Checks that
`backend` is defined, that `dev`/`watch`/`run-server` depend on it, and that `health`
exists.

## UI-11 — Sibling repos build with their own package manager

**Tag:** mandatory (conditional — applies inside UI-10 blocks)
**Statement:** `$(PKG_MANAGER)` addresses **this** package only. Any command run inside a
sibling checkout uses that repo's own manager explicitly — `npm` for the current
siblings. Linking back into this package's `node_modules` is the one place
`$(PKG_MANAGER)` is correct.
**Rationale:** The sibling SDK/API repos are npm-installed. Running `pnpm install` inside
one moves its npm-installed `node_modules` aside, breaking the checkout for its own
tooling — a destructive side effect of a target the user thinks only builds.
**Evidence:** `msh-ui-FigmaFindConsole/v100/Makefile:59-63` (the NOTE states it),
`:73,76,81,102` (`npm` inside siblings) vs `:84,107` (`$(PKG_MANAGER)` for the local
link).
**Audit:** within a UI-10 block, a `( cd "$(<SIBLING>_DIR)" … )` subshell containing
`$(PKG_MANAGER)` → `error`.

## UI-12 — Docs echo the same port

**Tag:** advisory
**Statement:** The port in `PORT ?=` also appears in the package's `README.md`
quick-start and in the `Dev URL:` line of `.AGENT.md`, and nowhere do they show a
different one.
**Rationale:** `.AGENT.md` is what an agent reads before touching the package; a stale
port there sends it to another organism's server, which under `strictPort` is a live
process serving a different app rather than a connection refused.
**Evidence:** 3/3 — `README.md:17` + `.AGENT.md:17` = 5205;
`README.md:18` + `.AGENT.md:17` = 5206; `README.md:13,73` + `.AGENT.md:17` = 5208.
**Audit:** `../scripts/ui-port-registry.sh` reports `DOCDRIFT` per file.

## Known variants

- **Backend-integrated organism** (`msh-ui-FigmaFindConsole`): the UI-10 block. Its
  header block is correspondingly long (22 lines) because it must explain two optional
  sibling dependencies and their degradation behaviour. Not drift.
- **`install` is real everywhere here.** Unlike the SDK family (MK-06's no-op `install`
  for umbrella uniformity), every msh-ui package has real dependencies, so `install` is
  always `$(PKG_MANAGER) install`.

## Rule id policy

Append-only. A new rule takes the next free UI-NN; ids are never renumbered and never
reused. A retired rule keeps its entry tagged `retired` so old findings stay
interpretable. Every change to this file is recorded in [CHANGELOG.md](CHANGELOG.md).

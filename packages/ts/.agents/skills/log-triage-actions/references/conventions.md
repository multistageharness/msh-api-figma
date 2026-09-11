# Action-log conventions (AL-01 … AL-13)

Stable rule ids. Cite them by id in triage output; never re-derive these from an
example report. Change them only through the skill's **Self-update** mode.

The reference implementation these were extracted from is the RCM-figma
`npm-test-all.log` triage: 4 failing packages that collapsed to 2 root causes,
one of which was a path bug masquerading as a missing repository.

---

## Analysis rules

### AL-01 — Group by root cause, never by failing unit
A log reports *symptoms*. The report's spine is **causes**. Four failing
packages that share one broken path constant are **one** issue with four
symptoms, not four issues.

Write the count difference explicitly ("4 failing packages, 2 root causes") —
it is the single most useful line in the report for whoever reads it next.

### AL-02 — Distrust the log's own framing; disprove it before accepting it
An error message states what the code *observed*, not what is *wrong*.
`ENOENT: no such file` is a claim that a path did not resolve — it is **not**
evidence that a file is missing. Before accepting any surface reading, run the
check that could disprove it:

| Log says | Also check |
| --- | --- |
| file/dir missing | `find` it repo-wide — it may exist at a different depth |
| no tests found | do test files exist? is the matcher matching them? |
| module not found | is it unbuilt, unlinked, or misnamed? |
| permission denied | ownership vs. the sandbox, not just the mode bits |
| timeout / hang | is it waiting on network, a port, or a prompt? |

In the reference run this rule was the whole ballgame: the "missing"
`msh-test-integration-figma-manifest/figma.json` was present the entire time,
one directory below where a `../`-counting constant looked.

### AL-03 — Default configuration in a log is a signal, not noise
When a log echoes a tool's **default** settings, the project config is not
loading. Recognising `testMatch: **/__tests__/**/*.[jt]s?(x)` as Jest's stock
default — not the repo's — is what turns "no tests found" into "no config
file". Compare any echoed config against a **working sibling** in the same
workspace; the diff is usually the entire diagnosis.

### AL-04 — Count path segments explicitly, in a table
Never eyeball `../../../../../..`. Resolve one segment per row from the
module's own directory and mark the intended stop:

| `..` | resolves to |
| --- | --- |
| 5 | `msh-sdk-figma-analysis-file-payload/` |
| 6 | `RCM-figma/` ← repo root, **correct** |
| 7 | `multistageharness-com/` ← **escaped the repo** |

This makes an off-by-one auditable instead of assertable.

### AL-05 — Prefer the code's own stated intent as the oracle
A doc comment, type, or test name that specifies intended behaviour settles
what "correct" means without guessing. The reference fix was confirmed by the
constant's own comment ("The repo-root key manifest" … "sits two levels under
`packages/ts` … so the depth holds either way"), which fixed both the target
and the depth. Quote that oracle in the report.

### AL-06 — Separate "dormant" from "broken"
A suite that never ran is a **silent coverage hole**, categorically worse than
a suite that ran and failed — the failure is the useful signal; the silence is
the defect. Say so, and quantify it ("121 real assertions were dormant").

---

## Repair rules

### AL-07 — Never green-wash
Do **not** make a log green by weakening what it checks. Banned unless the user
explicitly asks, and then only with the trade-off recorded:

- adding `--passWithNoTests`, `--allow-empty`, `|| true`, `continue-on-error`
- skipping, `.skip`, `xit`, deleting or commenting out a failing assertion
- loosening a threshold, snapshot, or timeout to fit the observed value
- catching and swallowing the error that surfaced the bug

Record the temptation you rejected and why — the reference report's
"Deliberately **not** done" note on `--passWithNoTests` is the model. A green
log that runs nothing is strictly worse than a red one.

### AL-08 — Match the working sibling, don't invent
When peers exist, copy their pattern exactly (structure, naming, comment
style). New files should be indistinguishable from the ones already there.
Cite the sibling you matched.

### AL-09 — Verify the fix's preconditions before claiming the fix
Confirm the assumptions the fix rests on. The reference run checked that
`dist/core/service.mjs` actually existed before adding configs whose base
contract is "tests import built output" — otherwise the configs would have
been correct and the tests would still have failed.

---

## Reporting rules

### AL-10 — Every claim carries an anchor
`path:line`, a quoted log line with its line number, a table, or verbatim
command output. No unsourced assertions about what the code does. Prefer a
`diff` block over prose for any edit.

### AL-11 — Verify twice: each fix alone, then the original producer
1. Run each fixed unit **individually** — proves that fix works.
2. Re-run **the exact command that produced the log** — proves nothing else
   broke and that the reported state is real.

Report both, with real numbers (`17/17 passed`), never "should now pass". If
step 2 is impossible because the log has no producer in this repo (AL-13), say
so and give the reason — "not re-run" is a legitimate result; an omitted step
that reads as done is not.

### AL-12 — Interrogate every remaining skip, warning, and silence
A green run is not automatically a clean one. For each surviving skip/warn,
establish whether it is **by design** or a **newly masked failure**, and record
the evidence either way.

In the reference run, 6 suites moved from *erroring* to *skipped*. That is only
acceptable because the corpus directory was verified to hold zero per-key
files, making `hasCorpus()` false — the documented "partial corpus is a normal
state" path. Same green log, opposite conclusions, decided by one `ls`.

### AL-13 — A pasted log becomes a file before it becomes evidence
Log text pasted into the prompt has no `path:line`, so under AL-10 nothing in
it can be cited. Persist it verbatim to `<run folder>/input.log` **before**
analysing, then read it back from disk and cite it like any committed log.

Verbatim is the whole point of the rule:

- No reformatting, re-wrapping, or de-duplication — line numbers must match
  what the user pasted, or every citation in the report is off.
- No trimming of "noise". The install chatter above a failure is exactly where
  AL-03 finds echoed defaults, and AL-02's disproof usually lives in the lines
  nobody thought were part of the error.
- Strip ANSI escapes into a *separate* `input.clean.log` if readability demands
  it. Overwriting the original destroys the only copy — the paste is not
  re-fetchable the way a file on disk is.

The origin also has to survive into the report: a pasted log usually has no
discoverable producer, which means AL-11's second verification (re-run the
producer) may be unavailable. Record that as unavailable **with the reason**.
Reporting only the per-unit half as though it were the full check is the
failure mode this rule exists to prevent.

---

## Required sections of ACTIONS.md

In order. Omit a section only when it is genuinely empty, and say so.

| # | Section | Must contain |
| --- | --- | --- |
| — | Header | repo, UUID, date, source log — its path or `input.log` if pasted (AL-13) — its producer or "unknown", start/end state |
| 1 | Issues found | one `###` per **root cause** (AL-01), each with log evidence, root cause, and the disproved surface reading (AL-02) |
| 2 | Changes applied | one `###` per fix, as diffs; the sibling matched (AL-08); what was deliberately not done (AL-07) |
| 3 | Verification | per-unit results, then the full producer re-run (AL-11); skip/warning interrogation (AL-12) |
| 4 | Tools used | step → tool → purpose table, in execution order |
| 5 | Follow-ups | improvements identified but **not** applied, with rationale |

Section 5 is not optional padding: a triage that fixed the instance but not the
class should say which check would have caught it. The reference report's
follow-up — that `webhooks` passes `--passWithNoTests` and would therefore lose
its tests *silently* — is a live bug found only by generalising the fix.

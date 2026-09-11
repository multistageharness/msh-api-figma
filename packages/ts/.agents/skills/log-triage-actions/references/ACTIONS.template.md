# Action Log — <one-line goal, e.g. "Resolve failures in `logs/npm-test-all.log`">

- **Repo:** <RepoName>
- **UUID:** <UUID>
- **Date:** <yyyy-mm-dd>
- **Source log:** `<path>` (produced by `<producer command or script>`)
  <or, for a pasted log (AL-13): `input.log` — pasted by the user, N lines,
  producer `<identified command>` / **not identified** because <reason>>
- **Commit:** `<short sha>` on `<branch>`<, working tree dirty>
- **Starting state:** <e.g. 4 of 17 packages FAILED>
- **Ending state:** <e.g. 17 of 17 packages PASSED>

---

## 1. Issues found in the log

<State the symptom→cause collapse up front (AL-01):>
The log contained **N distinct root causes**, not M independent failures.

### Issue A — <cause in plain language, not the error string>

<Affected units, as a list or table.>

Log evidence (`<log path>:<line>`):

```
<verbatim excerpt — the smallest span that proves the point>
```

<Why that excerpt means what you say it means. If it is a tool default, say so
explicitly (AL-03).>

**Root cause.** <The actual mechanism. One paragraph.>

<Disprove the surface reading (AL-02): what the log appeared to say, what you
ran to test that, and what you found instead. For path bugs, include the
segment table (AL-04). Quote any in-code oracle that settles intent (AL-05).>

> <Callout for severity reframing where it applies — e.g. dormant vs. broken
> (AL-06). Delete if not applicable.>

### Issue B — <…>

<Same shape.>

---

## 2. Changes applied

### Fix A — <what changed, imperatively>

<Files created/edited, as a list.>

```diff
- <before>
+ <after>
```

<The working sibling this matches (AL-08), and any precondition verified
before applying (AL-09).>

> Deliberately **not** done: <the green-washing shortcut rejected, and why it
> would have hidden the defect (AL-07). Delete only if nothing was tempting.>

### Fix B — <…>

---

## 3. Verification

<Per-unit results first (AL-11 step 1):>

| Unit | Result |
| --- | --- |
| <name> | <e.g. 2 suites, **56 passed**> |

<Then the full re-run of the original producer (AL-11 step 2), verbatim:>

```
<command>
<result line, e.g. RESULT: all packages passed   (17 / 17)>
```

<If the producer could not be identified — typically a pasted log from another
machine or repo (AL-13) — replace the block above with: "**End-to-end re-run:
not possible.** <reason>", and say what that leaves unverified. Do not
substitute a command that merely looks equivalent.>

**On the remaining skips/warnings** — <for each surviving skip or warning,
by-design or masked, with the evidence that decides it (AL-12). Delete only if
the run is genuinely silent.>

<Note the post-state of the log file itself if the producer rewrites it.>

---

## 4. Tools used

| Step | Tool | Purpose |
| --- | --- | --- |
| <in execution order> | <Read/Grep/Bash/Edit/Write/…> | <what it established> |

---

## 5. Follow-ups worth considering (not applied)

1. **<Fix the class, not just the instance.>** <Which check would have caught
   this automatically, and where it would live.>
2. **<Fragility left in place.>** <What will break this again, and the sturdier
   alternative.>
3. **<Open question for the user / CI.>**

#!/usr/bin/env bash
##
## ui-makefile-audit.sh — check one msh-ui-* Makefile against the frontend
## dev-server conventions (references/conventions.md, rules UI-01..UI-12).
##
## Scope: SINGLE FILE. The cross-file rules — UI-04 (Makefile vs vite.config.ts),
## UI-05 (port uniqueness), UI-12 (docs) — live in ui-port-registry.sh, and
## UI-09 (.ONESHELL is inert under make 3.81) is judgment-only. UI-10/UI-11 are
## emitted only when the package actually has a dev/server/ backend.
##
## This audit is a SUPPLEMENT, never a replacement: the house rules still apply,
## so also run ../../makefile-self-improve/scripts/makefile-audit.sh on the file.
##
## Severity map mirrors the conventions doc tags:
##   UI-01/02/03/06/07/08/11 -> error, UI-10 -> warn.
##
## Output: one "UI-NN<TAB>error|warn<TAB>message" line per finding on stdout, in
## rule order; nothing on stdout when clean; diagnostics on stderr.
## Exit: 0 clean, 1 findings, 2 usage/unreadable file.
##
## Bash 3.2 compatible (stock macOS): no mapfile, no associative arrays.
##
set -euo pipefail

usage() {
  echo "usage: ui-makefile-audit.sh <path-to-Makefile>" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
case "$1" in
  -h|--help) usage ;;
esac
MF="$1"
if [ ! -f "$MF" ] || [ ! -r "$MF" ]; then
  echo "error: unreadable file: $MF" >&2
  exit 2
fi
PKG_DIR=$(dirname "$MF")

# Structured parse. Records (tab-separated):
#   T <name> <deps>      rule target and its prerequisite list
#   RCP <name> <body>    one recipe line belonging to <name>, leading tab stripped
#                        and inner tabs flattened to spaces so the record stays
#                        exactly three tab-separated fields
PARSED=$(awk -F'\n' '
  /^[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/ && $0 !~ /:=/ && $0 !~ /\?=/ && $0 !~ /\+=/ && $0 !~ /^\.PHONY/ {
    line = $0
    name = line; sub(/[ \t]*:.*$/, "", name)
    deps = line; sub(/^[^:]*:[ \t]*/, "", deps); sub(/##.*$/, "", deps)
    gsub(/[ \t]+$/, "", deps)
    print "T\t" name "\t" deps
    cur = name
    next
  }
  /^\t/ {
    if (cur != "") {
      body = $0
      sub(/^\t+/, "", body)
      gsub(/\t/, " ", body)
      print "RCP\t" cur "\t" body
    }
    next
  }
  /^[^ \t]/ { cur = "" }
' "$MF")

TARGETS=$(printf '%s\n' "$PARSED" | awk -F'\t' '$1 == "T" { print $2 }' | tr '\n' ' ')

FINDINGS=""
add() { # id sev msg
  FINDINGS="${FINDINGS}UI-${1}	${2}	${3}
"
}
has_target() { case " $TARGETS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
deps_of() { printf '%s\n' "$PARSED" | awk -F'\t' -v n="$1" '$1 == "T" && $2 == n { print $3; exit }'; }
recipe_of() { printf '%s\n' "$PARSED" | awk -F'\t' -v n="$1" '$1 == "RCP" && $2 == n { print $3 }'; }
dep_has() { # target dep
  case " $(deps_of "$1") " in *" $2 "*) return 0 ;; *) return 1 ;; esac
}

# ---- UI-01 — organism header block -----------------------------------------
if ! head -n 10 "$MF" | grep -q '^##.*vite dev-server Makefile'; then
  add 01 error "no '## <package> — vite dev-server Makefile' header line within the first 10 lines"
fi

MKPORT=$(grep -E '^PORT[ 	]*\?=' "$MF" 2>/dev/null | head -n1 |
  sed -E 's/^PORT[ 	]*\?=[ 	]*([0-9]+).*/\1/' || true)
case "$MKPORT" in ''|*[!0-9]*) MKPORT="" ;; esac

if [ -n "$MKPORT" ]; then
  HDRPORT=$(grep -E '^##' "$MF" | grep -oE 'PORT=[0-9]+' | head -n1 | grep -oE '[0-9]+' || true)
  if [ -z "$HDRPORT" ]; then
    add 01 error "the header block does not state the port (expected a '## ... PORT=$MKPORT ...' line)"
  elif [ "$HDRPORT" != "$MKPORT" ]; then
    add 01 error "header says PORT=$HDRPORT but the knob is PORT ?= $MKPORT"
  fi
fi

# ---- UI-02 — the fail-fast preamble, exact and in order ---------------------
L_SHELL=$(grep -nE '^SHELL[ 	]*:=[ 	]*/bin/bash[ 	]*$' "$MF" | head -n1 | cut -d: -f1 || true)
L_ONE=$(grep -nE '^\.ONESHELL:' "$MF" | head -n1 | cut -d: -f1 || true)
L_FLAGS=$(grep -nE '^\.SHELLFLAGS[ 	]*:=' "$MF" | head -n1 | cut -d: -f1 || true)

[ -n "$L_SHELL" ] || add 02 error "missing 'SHELL := /bin/bash' (required by the .ONESHELL fail-fast trio)"
[ -n "$L_ONE" ]   || add 02 error "missing '.ONESHELL:'"
if [ -z "$L_FLAGS" ]; then
  add 02 error "missing '.SHELLFLAGS := -euo pipefail -c'"
elif ! sed -n "${L_FLAGS}p" "$MF" | grep -q -- '-euo pipefail -c'; then
  add 02 error ".SHELLFLAGS does not read '-euo pipefail -c' (fail-fast semantics incomplete)"
fi
if [ -n "$L_SHELL" ] && [ -n "$L_ONE" ] && [ -n "$L_FLAGS" ]; then
  if [ "$L_SHELL" -gt "$L_ONE" ] || [ "$L_ONE" -gt "$L_FLAGS" ]; then
    add 02 error "preamble out of order (expected SHELL, .DEFAULT_GOAL, .ONESHELL, .SHELLFLAGS)"
  fi
fi

# ---- UI-03 — the four knobs -------------------------------------------------
grep -qE '^PKG_MANAGER[ 	]*\?=[ 	]*pnpm[ 	]*$' "$MF" || \
  add 03 error "missing knob 'PKG_MANAGER ?= pnpm'"
[ -n "$MKPORT" ] || add 03 error "missing knob 'PORT ?= <nnnn>'"
grep -qE '^PID_FILE[ 	]*:=[ 	]*\.dev\.pid[ 	]*$' "$MF" || \
  add 03 error "missing knob 'PID_FILE := .dev.pid'"
grep -qE '^LOG_FILE[ 	]*:=[ 	]*\.dev\.log[ 	]*$' "$MF" || \
  add 03 error "missing knob 'LOG_FILE := .dev.log'"

# ---- UI-06 — the invariant lifecycle core -----------------------------------
for t in clean dev watch stop status logs up down; do
  has_target "$t" || add 06 error "lifecycle target '$t' is not defined"
done

# ---- UI-07 — stop is three-tier; dev and clean depend on it -----------------
if has_target stop; then
  STOP=$(recipe_of stop)
  printf '%s' "$STOP" | grep -q 'PID_FILE' || \
    add 07 error "'stop' does not consult \$(PID_FILE) (tier 1 of PID file > lsof > pkill)"
  printf '%s' "$STOP" | grep -q 'lsof' || \
    add 07 error "'stop' has no 'lsof -ti tcp:\$(PORT)' fallback (tier 2)"
  printf '%s' "$STOP" | grep -q 'pkill' || \
    add 07 error "'stop' has no 'pkill -f' fallback (tier 3)"
  printf '%s\n' "$STOP" | grep -qE '^@?true[ ]*$' || \
    add 07 error "'stop' does not end in '@true' (it must exit 0 when nothing was running)"
fi
has_target dev   && ! dep_has dev stop   && add 07 error "'dev' does not list 'stop' as a prerequisite"
has_target clean && ! dep_has clean stop && add 07 error "'clean' does not list 'stop' as a prerequisite"

# ---- UI-08 — the foreground pair --------------------------------------------
has_target run-server || add 08 error "'run-server' is not defined (foreground counterpart to background 'dev')"
if has_target run-preview; then
  PREV=$(recipe_of run-preview)
  printf '%s' "$PREV" | grep -q 'run build' || \
    add 08 error "'run-preview' does not build before previewing"
  printf '%s' "$PREV" | grep -q 'run preview' || \
    add 08 error "'run-preview' does not run the preview server"
else
  add 08 error "'run-preview' is not defined (build + serve the production bundle)"
fi

# ---- UI-10 / UI-11 — backend block, only when dev/server/ exists ------------
if [ -d "$PKG_DIR/dev/server" ]; then
  has_target backend || \
    add 10 warn "dev/server/ exists but no 'backend' target prepares it"
  has_target health || \
    add 10 warn "dev/server/ exists but no 'health' target queries the running backend"
  if has_target backend; then
    for t in dev watch run-server; do
      if has_target "$t" && ! dep_has "$t" backend; then
        add 10 warn "'$t' does not list 'backend' as a prerequisite (it would start without the API mounted)"
      fi
    done
  fi
  # UI-11 — never run this package's manager inside a sibling checkout.
  BAD=$(printf '%s\n' "$PARSED" | awk -F'\t' '$1 == "RCP" { print $3 }' |
    grep -E '\([ ]*cd[ ]+"?\$\(' | grep 'PKG_MANAGER' || true)
  if [ -n "$BAD" ]; then
    add 11 error "a '( cd \$(..._DIR) ... )' subshell runs \$(PKG_MANAGER) — sibling repos build with their own manager (npm); pnpm would displace their node_modules"
  fi
fi

if [ -z "$FINDINGS" ]; then
  exit 0
fi
printf '%s' "$FINDINGS" | grep -v '^$'
exit 1

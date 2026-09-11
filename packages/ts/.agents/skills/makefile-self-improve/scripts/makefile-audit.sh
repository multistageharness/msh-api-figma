#!/usr/bin/env bash
##
## makefile-audit.sh — check one Makefile against the house conventions
## (references/conventions.md, rules MK-01..MK-09; MK-07 is judgment-only
## and never emitted). Severity map mirrors the conventions doc tags:
## MK-01/02/03/04/06/08/09 -> error, MK-05 -> warn.
##
## Output: one "MK-NN<TAB>error|warn<TAB>message" line per finding on stdout,
## in source-line order; nothing on stdout when clean; diagnostics on stderr.
## Exit: 0 clean, 1 findings, 2 usage/unreadable file.
##
## Bash 3.2 compatible (stock macOS): no mapfile, no associative arrays.
##
set -euo pipefail

usage() {
  echo "usage: makefile-audit.sh <path-to-Makefile>" >&2
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

# Single structured parse pass. Emits:
#   HDR <line>            '##' comment line within the first 10 lines
#   DG <line>             '.DEFAULT_GOAL := help'
#   P <line> <name>       entry on a .PHONY line
#   T <line> <name> <0|1> rule target (1 = rule line carries '## ' doc)
#   HAWK <line>           help recipe uses awk + MAKEFILE_LIST
#   HM <line> <name>      'make <name>' token inside the help recipe body
#   S <line>              space-indented recipe line (not a backslash continuation)
PARSED=$(awk '
  NR <= 10 && /^##/          { print "HDR", NR }
  /^\.DEFAULT_GOAL[ \t]*:=[ \t]*help[ \t]*$/ { print "DG", NR }

  /^\.PHONY[ \t]*:/ {
    line = $0
    sub(/^\.PHONY[ \t]*:/, "", line)
    n = split(line, w, /[ \t]+/)
    for (i = 1; i <= n; i++) if (w[i] != "") print "P", NR, w[i]
    in_recipe = 0; in_help = 0; prev_cont = 0
    next
  }

  # rule line: "name:" or "name: deps", not a variable assignment
  /^[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/ && $0 !~ /:=/ && $0 !~ /\?=/ && $0 !~ /\+=/ {
    name = $0
    sub(/[ \t]*:.*$/, "", name)
    hasdoc = ($0 ~ /## /) ? 1 : 0
    print "T", NR, name, hasdoc
    in_recipe = 1
    in_help = (name == "help") ? 1 : 0
    prev_cont = 0
    next
  }

  /^\t/ {
    if (in_help) {
      if ($0 ~ /awk/ && $0 ~ /MAKEFILE_LIST/) print "HAWK", NR
      line = $0
      while (match(line, /make [a-z][a-z0-9-]*/)) {
        tok = substr(line, RSTART + 5, RLENGTH - 5)
        print "HM", NR, tok
        line = substr(line, RSTART + RLENGTH)
      }
    }
    prev_cont = ($0 ~ /\\[ \t]*$/) ? 1 : 0
    next
  }

  /^ +[^ ]/ {
    if (in_recipe && !prev_cont) print "S", NR
    prev_cont = ($0 ~ /\\[ \t]*$/) ? 1 : 0
    next
  }

  { in_recipe = 0; in_help = 0; prev_cont = 0 }
' "$MF")

# Findings accumulate as "line<TAB>MK-NN<TAB>sev<TAB>msg" for source-line ordering.
FINDINGS=""
add() { # line id sev msg
  FINDINGS="${FINDINGS}${1}	MK-${2}	${3}	${4}
"
}

in_list() { # needle "list of words"
  case " $2 " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

PHONY=$(printf '%s\n' "$PARSED" | awk '$1 == "P" { print $3 }' | tr '\n' ' ')
TARGETS=$(printf '%s\n' "$PARSED" | awk '$1 == "T" { print $3 }' | tr '\n' ' ')
PHONY_LINE=$(printf '%s\n' "$PARSED" | awk '$1 == "P" { print $2; exit }')
[ -n "$PHONY_LINE" ] || PHONY_LINE=1

# MK-01 — header comment block in the first 10 lines
if ! printf '%s\n' "$PARSED" | grep -q '^HDR '; then
  add 1 01 error "no '##' header comment block within the first 10 lines"
fi

# MK-02 — .DEFAULT_GOAL := help
if ! printf '%s\n' "$PARSED" | grep -q '^DG '; then
  add 1 02 error "'.DEFAULT_GOAL := help' is not set"
fi

# MK-03 — .PHONY complete and exact (both directions)
for t in $TARGETS; do
  if ! in_list "$t" "$PHONY"; then
    line=$(printf '%s\n' "$PARSED" | awk -v n="$t" '$1 == "T" && $3 == n { print $2; exit }')
    add "$line" 03 error "target '$t' is missing from .PHONY"
  fi
done
for p in $PHONY; do
  if ! in_list "$p" "$TARGETS"; then
    add "$PHONY_LINE" 03 error ".PHONY lists '$p' but no such target is defined"
  fi
done

# MK-04 — every phony target's rule line carries '## ' (skip stale entries: MK-03 owns those)
for p in $PHONY; do
  if in_list "$p" "$TARGETS"; then
    hasdoc=$(printf '%s\n' "$PARSED" | awk -v n="$p" '$1 == "T" && $3 == n { print $4; exit }')
    if [ "$hasdoc" != "1" ]; then
      line=$(printf '%s\n' "$PARSED" | awk -v n="$p" '$1 == "T" && $3 == n { print $2; exit }')
      add "$line" 04 error "phony target '$p' has no '## ' inline doc"
    fi
  fi
done

# MK-05 — help/doc sync (advisory): awk variant noted once; echo style must not
# name nonexistent targets (curated omissions are allowed — see conventions.md)
HAWK_LINE=$(printf '%s\n' "$PARSED" | awk '$1 == "HAWK" { print $2; exit }')
if [ -n "$HAWK_LINE" ]; then
  add "$HAWK_LINE" 05 warn "help is awk-generated from \$(MAKEFILE_LIST) (accepted variant; echo-curated is the reference style)"
else
  MK05=$(printf '%s\n' "$PARSED" | awk '$1 == "HM" { print $2, $3 }' | while read -r line tok; do
    [ -n "$tok" ] || continue
    if ! in_list "$tok" "$TARGETS"; then
      printf '%s\tMK-05\twarn\thelp mentions '\''make %s'\'' but no such target is defined\n' "$line" "$tok"
    fi
  done)
  if [ -n "$MK05" ]; then
    FINDINGS="${FINDINGS}${MK05}
"
  fi
fi

# MK-06 — core vocabulary present
for c in help install typecheck test audit clean; do
  if ! in_list "$c" "$TARGETS"; then
    add 1 06 error "core target '$c' is not defined (mandatory vocabulary: help install typecheck test audit clean)"
  fi
done

# MK-09 — .ONESHELL requires the bash fail-fast trio (conditional; see conventions.md)
ONESHELL_LINE=$(grep -n '^\.ONESHELL' "$MF" | head -n1 | cut -d: -f1 || true)
if [ -n "$ONESHELL_LINE" ]; then
  if ! grep -q '^SHELL[ \t]*:=[ \t]*/bin/bash[ \t]*$' "$MF"; then
    add "$ONESHELL_LINE" 09 error ".ONESHELL is set but 'SHELL := /bin/bash' is missing (fail-fast trio incomplete)"
  fi
  if ! grep -E '^\.SHELLFLAGS[ \t]*:?=' "$MF" | grep -q 'pipefail'; then
    add "$ONESHELL_LINE" 09 error ".ONESHELL is set but no .SHELLFLAGS with 'pipefail' is declared (fail-fast trio incomplete)"
  fi
fi

# MK-08 — tab-indented recipes
MK08=$(printf '%s\n' "$PARSED" | awk '$1 == "S" { print $2 }' | while read -r line; do
  printf '%s\tMK-08\terror\trecipe line %s is space-indented (recipes need a real tab)\n' "$line" "$line"
done)
if [ -n "$MK08" ]; then
  FINDINGS="${FINDINGS}${MK08}
"
fi

if [ -z "$FINDINGS" ]; then
  exit 0
fi
printf '%s' "$FINDINGS" | grep -v '^$' | sort -n -k1,1 | cut -f2-
exit 1

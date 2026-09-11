#!/usr/bin/env bash
##
## ui-port-registry.sh — the cross-file port checks for the msh-ui-* family
## (references/conventions.md: UI-04 Makefile/vite agreement, UI-05 uniqueness,
## UI-12 docs echo the same port). These three rules span more than one file, so
## ui-makefile-audit.sh (single-file) cannot see them.
##
## Usage:
##   ui-port-registry.sh [--root <dir>]        audit every msh-ui-* package
##   ui-port-registry.sh --next [--root <dir>] print the next free 52xx port
##                                             (lowest free at or above the
##                                             family's current floor)
##   ui-port-registry.sh --list [--root <dir>] print the registry table only
##
## <dir> defaults to the nearest ancestor of $PWD that contains msh-ui-* dirs.
##
## Output: the registry table on stdout (PACKAGE<TAB>MAKEFILE<TAB>VITE<TAB>DOCS),
## then one "UI-NN<TAB>error|warn<TAB>message" line per finding.
## Exit: 0 clean, 1 findings, 2 usage/no packages found.
##
## Bash 3.2 compatible (stock macOS): no mapfile, no associative arrays.
##
set -euo pipefail

PORT_LO=5200
PORT_HI=5299

usage() {
  echo "usage: ui-port-registry.sh [--next|--list] [--root <dir>]" >&2
  exit 2
}

MODE=audit
ROOT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --next) MODE=next; shift ;;
    --list) MODE=list; shift ;;
    --root) [ "$#" -ge 2 ] || usage; ROOT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done

# Locate the family root by walking up until a directory holds msh-ui-* children.
if [ -z "$ROOT" ]; then
  d=$PWD
  while [ "$d" != "/" ]; do
    if ls -d "$d"/msh-ui-*/ >/dev/null 2>&1; then ROOT=$d; break; fi
    d=$(dirname "$d")
  done
fi
if [ -z "$ROOT" ] || ! ls -d "$ROOT"/msh-ui-*/ >/dev/null 2>&1; then
  echo "error: no msh-ui-* packages found (searched upward from $PWD; use --root)" >&2
  exit 2
fi

# One record per package: name<TAB>mkport<TAB>viteport<TAB>strict<TAB>docports<TAB>dir
# Empty numeric fields mean "not declared"; kept as '-' so the table stays aligned.
RECORDS=""
for mf in "$ROOT"/msh-ui-*/*/Makefile; do
  [ -f "$mf" ] || continue
  dir=$(dirname "$mf")
  name=$(basename "$(dirname "$dir")")/$(basename "$dir")

  mkport=$(grep -E '^PORT[ 	]*\?=' "$mf" 2>/dev/null | head -n1 |
    sed -E 's/^PORT[ 	]*\?=[ 	]*([0-9]+).*/\1/' || true)
  case "$mkport" in ''|*[!0-9]*) mkport="-" ;; esac

  vc="$dir/vite.config.ts"
  viteport="-"; strict="no"
  if [ -f "$vc" ]; then
    viteport=$(grep -oE 'port:[ ]*[0-9]+' "$vc" 2>/dev/null | head -n1 |
      grep -oE '[0-9]+' || true)
    case "$viteport" in ''|*[!0-9]*) viteport="-" ;; esac
    if grep -qE 'strictPort:[ ]*true' "$vc" 2>/dev/null; then strict="yes"; fi
  fi

  docports=$(cat "$dir/README.md" "$dir/.AGENT.md" 2>/dev/null |
    grep -oE 'localhost:[0-9]+' | grep -oE '[0-9]+' | sort -u | tr '\n' ',' |
    sed 's/,$//' || true)
  [ -n "$docports" ] || docports="-"

  RECORDS="${RECORDS}${name}	${mkport}	${viteport}	${strict}	${docports}	${dir}
"
done

RECORDS=$(printf '%s' "$RECORDS" | grep -v '^$' || true)
if [ -z "$RECORDS" ]; then
  echo "error: no msh-ui-*/*/Makefile under $ROOT" >&2
  exit 2
fi

# --next: lowest free port AT OR ABOVE the family's lowest allocated port,
# counting every port any package claims in either file (a half-applied rename
# must not hand out a colliding port).
#
# Why not start at $PORT_LO: the family's allocations begin at 5205 and nothing
# in the tree records what — if anything — reserved 5200-5204. Handing those out
# would be a guess against an unknown, so the allocator only ever moves upward
# from the existing floor. Widen this deliberately if the low end is confirmed
# free.
if [ "$MODE" = "next" ]; then
  USED=$(printf '%s\n' "$RECORDS" | awk -F'\t' '{print $2"\n"$3}' | grep -E '^[0-9]+$' | sort -u)
  p=$(printf '%s\n' "$USED" | sort -n | head -n1)
  case "$p" in ''|*[!0-9]*) p=$PORT_LO ;; esac
  [ "$p" -ge "$PORT_LO" ] || p=$PORT_LO
  while [ "$p" -le "$PORT_HI" ]; do
    if ! printf '%s\n' "$USED" | grep -qx "$p"; then echo "$p"; exit 0; fi
    p=$((p + 1))
  done
  echo "error: no free port in ${PORT_LO}-${PORT_HI}" >&2
  exit 2
fi

printf 'PACKAGE\tMAKEFILE\tVITE\tSTRICT\tDOCS\n'
printf '%s\n' "$RECORDS" | awk -F'\t' '{printf "%s\t%s\t%s\t%s\t%s\n", $1, $2, $3, $4, $5}'

[ "$MODE" = "list" ] && exit 0

FINDINGS=""
add() { # id sev msg
  FINDINGS="${FINDINGS}UI-${1}	${2}	${3}
"
}

# UI-04 — Makefile PORT agrees with vite.config.ts, and strictPort is on.
while IFS='	' read -r name mkport viteport strict docports dir; do
  [ -n "$name" ] || continue
  if [ "$mkport" = "-" ]; then
    add 03 error "$name: no 'PORT ?=' knob in the Makefile"
  elif [ "$viteport" = "-" ]; then
    add 04 error "$name: Makefile declares PORT=$mkport but vite.config.ts declares no server.port"
  elif [ "$mkport" != "$viteport" ]; then
    add 04 error "$name: MISMATCH — Makefile PORT=$mkport, vite.config.ts port=$viteport (make stop/status/health would address the wrong port)"
  fi
  if [ "$viteport" != "-" ] && [ "$strict" != "yes" ]; then
    add 04 error "$name: vite.config.ts sets port $viteport without 'strictPort: true' (vite may silently fall back to another port)"
  fi
  # UI-12 — every port named in README.md / .AGENT.md is this package's port.
  if [ "$mkport" != "-" ] && [ "$docports" != "-" ]; then
    for dp in $(printf '%s' "$docports" | tr ',' ' '); do
      if [ "$dp" != "$mkport" ]; then
        add 12 warn "$name: DOCDRIFT — README.md/.AGENT.md reference localhost:$dp but PORT=$mkport"
      fi
    done
  fi
done <<EOF
$RECORDS
EOF

# UI-05 — one port per organism.
DUPES=$(printf '%s\n' "$RECORDS" | awk -F'\t' '$2 ~ /^[0-9]+$/ {print $2}' | sort | uniq -d)
for d in $DUPES; do
  who=$(printf '%s\n' "$RECORDS" | awk -F'\t' -v p="$d" '$2 == p {print $1}' | tr '\n' ' ')
  add 05 error "COLLISION on port $d — claimed by: ${who% }"
done

if [ -z "$FINDINGS" ]; then
  exit 0
fi
printf '%s' "$FINDINGS" | grep -v '^$'
exit 1

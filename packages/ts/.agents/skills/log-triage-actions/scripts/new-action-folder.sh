#!/usr/bin/env bash
# Mint (or locate) an action-log folder under <repo>/.ai/actions/<RepoName>/<UUID>/.
#
# The folder is the deliverable's home: one ACTIONS.md per triage run, plus any
# evidence files that run needs to keep. The UUID is minted here rather than by
# the model so two runs can never collide and so the path is reproducible from
# the shell alone.
#
# Usage:
#   new-action-folder.sh                 # mint a new folder, print its path
#   new-action-folder.sh --uuid <UUID>   # reuse/resume a specific run folder
#   new-action-folder.sh --list          # list existing runs, newest first
#   new-action-folder.sh --latest        # print the most recent run folder
#
# Prints the absolute folder path on stdout; everything else goes to stderr, so
# the output is safe to capture:  DIR="$(new-action-folder.sh)"

set -euo pipefail

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

# Repo root and name come from git, so the skill works from any subdirectory.
# Fall back to CWD when this is not a git checkout.
if ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  ROOT="$PWD"
  printf 'warning: not a git repo — anchoring to CWD (%s)\n' "$ROOT" >&2
fi
REPO_NAME="$(basename "$ROOT")"
BASE="$ROOT/.ai/actions/$REPO_NAME"

MODE=new
WANT_UUID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --uuid)   MODE=reuse; WANT_UUID="${2:-}"; [ -n "$WANT_UUID" ] || die "--uuid needs a value"; shift 2 ;;
    --list)   MODE=list; shift ;;
    --latest) MODE=latest; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' >&2
      exit 0 ;;
    *) die "unknown argument: $1  (see --help)" ;;
  esac
done

case "$MODE" in
  list)
    [ -d "$BASE" ] || die "no action logs yet at ${BASE#"$ROOT"/}"
    # Newest first. -t sorts by mtime; the trailing grep keeps only run folders.
    ls -1t "$BASE" | while read -r d; do
      [ -d "$BASE/$d" ] || continue
      if [ -f "$BASE/$d/ACTIONS.md" ]; then status="ACTIONS.md"; else status="(empty)"; fi
      printf '%s  %s\n' "$d" "$status"
    done
    exit 0 ;;
  latest)
    [ -d "$BASE" ] || die "no action logs yet at ${BASE#"$ROOT"/}"
    latest="$(ls -1t "$BASE" 2>/dev/null | head -n1 || true)"
    [ -n "$latest" ] || die "no run folders under ${BASE#"$ROOT"/}"
    printf '%s\n' "$BASE/$latest"
    exit 0 ;;
  reuse)
    DIR="$BASE/$WANT_UUID" ;;
  new)
    if command -v uuidgen >/dev/null 2>&1; then
      UUID="$(uuidgen)"
    else
      # Portable fallback: kernel UUID source, uppercased to match uuidgen.
      UUID="$(tr 'a-f' 'A-F' < /proc/sys/kernel/random/uuid 2>/dev/null)" \
        || die "no uuidgen and no /proc/sys/kernel/random/uuid — pass --uuid explicitly"
    fi
    DIR="$BASE/$UUID" ;;
esac

mkdir -p "$DIR"

# Context the model would otherwise have to re-derive, and that pins the report
# to a specific commit. Written once; never overwritten on --uuid reuse.
if [ ! -f "$DIR/.run-context" ]; then
  {
    printf 'repo_name=%s\n' "$REPO_NAME"
    printf 'repo_root=%s\n' "$ROOT"
    printf 'started_utc=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'date_local=%s\n'  "$(date '+%Y-%m-%d')"
    printf 'git_commit=%s\n'  "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    printf 'git_branch=%s\n'  "$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    printf 'git_dirty=%s\n'   "$(test -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" && echo yes || echo no)"
  } > "$DIR/.run-context"
fi

printf '%s\n' "$DIR"

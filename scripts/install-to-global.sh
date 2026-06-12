#!/usr/bin/env bash
set -euo pipefail

# Build the local security-research fork and overwrite the npm-global
# @moonshot-ai/kimi-code dist directory. The previous global dist is backed up
# as dist-backup-<timestamp>.

SKIP_BUILD=false
RESTORE=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --restore) RESTORE=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_DIST="$REPO_ROOT/apps/kimi-code/dist"

if ! command -v pnpm >/dev/null 2>&1; then
  echo 'pnpm is not in PATH. Please install pnpm and try again.' >&2
  exit 1
fi

if command -v kimi >/dev/null 2>&1; then
  GLOBAL_PREFIX="$(dirname "$(command -v kimi)")"
elif command -v npm >/dev/null 2>&1; then
  GLOBAL_PREFIX="$(npm prefix -g | tr -d '\r\n')"
else
  echo 'Could not determine npm global prefix and kimi is not in PATH.' >&2
  exit 1
fi

if [ -z "$GLOBAL_PREFIX" ]; then
  echo 'Could not determine npm global prefix.' >&2
  exit 1
fi

# Convert Windows path to Unix if running in Git Bash / MSYS
if command -v cygpath >/dev/null 2>&1; then
  GLOBAL_PREFIX="$(cygpath -u "$GLOBAL_PREFIX")"
fi

GLOBAL_PKG="$GLOBAL_PREFIX/node_modules/@moonshot-ai/kimi-code"
if [ ! -d "$GLOBAL_PKG" ]; then
  echo "Global package not found: $GLOBAL_PKG" >&2
  echo "Run 'npm install -g @moonshot-ai/kimi-code' first." >&2
  exit 1
fi

LATEST_BACKUP() {
  find "$GLOBAL_PKG" -maxdepth 1 -type d -name 'dist-backup-*' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-
}

if [ "$RESTORE" = true ]; then
  BACKUP="$(LATEST_BACKUP)"
  if [ -z "$BACKUP" ]; then
    echo "No dist-backup-* directory found in $GLOBAL_PKG. Nothing to restore." >&2
    exit 1
  fi
  DIST="$GLOBAL_PKG/dist"
  if [ -d "$DIST" ]; then
    REMOVED="$GLOBAL_PKG/dist-removed-$(date +%Y%m%d-%H%M%S)"
    mv "$DIST" "$REMOVED"
    echo "Moved current dist to $REMOVED"
  fi
  mv "$BACKUP" "$DIST"
  echo "Restored $(basename "$BACKUP") to dist."
  kimi --version
  exit 0
fi

if [ "$SKIP_BUILD" = false ]; then
  if [ ! -d "$REPO_ROOT/node_modules" ]; then
    echo 'Running pnpm install...'
    (cd "$REPO_ROOT" && pnpm install)
  fi
  echo 'Building workspace packages and app...'
  (cd "$REPO_ROOT" && pnpm -r run build)
fi

if [ ! -d "$LOCAL_DIST" ]; then
  echo "Local dist not found: $LOCAL_DIST. Build failed or run without --skip-build." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
GLOBAL_DIST="$GLOBAL_PKG/dist"
BACKUP_PATH="$GLOBAL_PKG/dist-backup-$TIMESTAMP"

if [ -d "$GLOBAL_DIST" ]; then
  mv "$GLOBAL_DIST" "$BACKUP_PATH"
  echo "Backed up global dist to $BACKUP_PATH"
fi

cp -R "$LOCAL_DIST" "$GLOBAL_DIST"
echo "Copied local dist to $GLOBAL_DIST"

echo 'Verifying kimi --version...'
if ! kimi --version; then
  echo 'kimi --version failed. Check the global package.' >&2
  exit 1
fi

cat <<EOF

Deployment complete.
Rollback: ./scripts/install-to-global.sh --restore
EOF

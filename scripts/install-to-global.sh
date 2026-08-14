#!/usr/bin/env bash
set -euo pipefail

# Build the local security-research fork and install it as a SEPARATE global
# package "kimi-code-security" with the `ksec` command, leaving the official
# @moonshot-ai/kimi-code install (the `kimi` command) untouched.
#
# How it works:
#   1. On first run, the official global package directory is cloned to
#      <npm-prefix>/node_modules/kimi-code-security (without dist), so the
#      native optional deps (node-pty, clipboard) come along.
#   2. The clone's package.json is rewritten: name -> kimi-code-security,
#      bin  -> { "ksec": "dist/main.mjs" }.
#   3. The freshly built apps/kimi-code/dist replaces the clone's dist; the
#      previous dist is kept as dist-backup-<timestamp> inside the clone.
#   4. `ksec` shims are derived from the official `kimi` shims in the global
#      prefix by rewriting the package path.
#
# Rollback: --restore swaps the clone's newest dist-backup-* back to dist.

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
elif command -v ksec >/dev/null 2>&1; then
  GLOBAL_PREFIX="$(dirname "$(command -v ksec)")"
elif command -v npm >/dev/null 2>&1; then
  GLOBAL_PREFIX="$(npm prefix -g | tr -d '\r\n')"
else
  echo 'Could not determine npm global prefix and neither kimi nor ksec is in PATH.' >&2
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

DONOR_PKG="$GLOBAL_PREFIX/node_modules/@moonshot-ai/kimi-code"
KSEC_PKG="$GLOBAL_PREFIX/node_modules/kimi-code-security"

if [ ! -d "$KSEC_PKG" ] && [ ! -d "$DONOR_PKG" ]; then
  echo "Neither $KSEC_PKG nor the donor package $DONOR_PKG exists." >&2
  echo "Run 'npm install -g @moonshot-ai/kimi-code' first (needed once as the dependency donor)." >&2
  exit 1
fi

LATEST_BACKUP() {
  find "$KSEC_PKG" -maxdepth 1 -type d -name 'dist-backup-*' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-
}

if [ "$RESTORE" = true ]; then
  if [ ! -d "$KSEC_PKG" ]; then
    echo "ksec package not found: $KSEC_PKG. Nothing to restore." >&2
    exit 1
  fi
  BACKUP="$(LATEST_BACKUP)"
  if [ -z "$BACKUP" ]; then
    echo "No dist-backup-* directory found in $KSEC_PKG. Nothing to restore." >&2
    exit 1
  fi
  DIST="$KSEC_PKG/dist"
  if [ -d "$DIST" ]; then
    REMOVED="$KSEC_PKG/dist-removed-$(date +%Y%m%d-%H%M%S)"
    mv "$DIST" "$REMOVED"
    echo "Moved current dist to $REMOVED"
  fi
  mv "$BACKUP" "$DIST"
  echo "Restored $(basename "$BACKUP") to dist."
  ksec --version
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

# First run: clone the donor package (minus any dist) so native optional deps
# (node-pty, clipboard) and metadata come along. A leftover/incomplete clone
# (no package.json) is removed and redone. CON is excluded: a stray file with
# that reserved device name exists in some donor installs and breaks copying.
if [ ! -f "$KSEC_PKG/package.json" ]; then
  rm -rf "$KSEC_PKG"
  echo "Cloning donor package to $KSEC_PKG (first run)..."
  mkdir -p "$KSEC_PKG"
  tar -C "$DONOR_PKG" --exclude='./dist' --exclude='./dist-backup-*' --exclude='./dist-removed-*' --exclude='./CON' -cf - . |
    tar -C "$KSEC_PKG" -xf -
fi

# Repoint the clone's identity: its own name, the `ksec` bin entry, and the
# fork's real version (the donor's package.json may carry an older one).
node - "$KSEC_PKG/package.json" "$REPO_ROOT/apps/kimi-code/package.json" <<'EOF'
const fs = require('fs');
const file = process.argv[2];
const source = process.argv[3];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.name = 'kimi-code-security';
pkg.bin = { ksec: 'dist/main.mjs' };
pkg.version = JSON.parse(fs.readFileSync(source, 'utf8')).version ?? pkg.version;
delete pkg.publishConfig;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
EOF

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
KSEC_DIST="$KSEC_PKG/dist"
BACKUP_PATH="$KSEC_PKG/dist-backup-$TIMESTAMP"

if [ -d "$KSEC_DIST" ]; then
  mv "$KSEC_DIST" "$BACKUP_PATH"
  echo "Backed up ksec dist to $BACKUP_PATH"
fi

cp -R "$LOCAL_DIST" "$KSEC_DIST"
echo "Copied local dist to $KSEC_DIST"

# Create / refresh the `ksec` shims in the global prefix by rewriting the
# package path inside the official `kimi` shims (both / and \ spellings).
make_shim() {
  local source="$1" target="$2"
  [ -f "$source" ] || return 0
  sed -e 's|@moonshot-ai/kimi-code|kimi-code-security|g' \
      -e 's|@moonshot-ai[\\]kimi-code|kimi-code-security|g' \
      "$source" > "$target"
  chmod +x "$target" 2>/dev/null || true
  echo "Wrote shim $target"
}
make_shim "$GLOBAL_PREFIX/kimi" "$GLOBAL_PREFIX/ksec"
make_shim "$GLOBAL_PREFIX/kimi.cmd" "$GLOBAL_PREFIX/ksec.cmd"
make_shim "$GLOBAL_PREFIX/kimi.ps1" "$GLOBAL_PREFIX/ksec.ps1"

echo 'Verifying ksec --version...'
if ! ksec --version; then
  echo 'ksec --version failed. Check the shims and the ksec package.' >&2
  exit 1
fi

cat <<EOF

Deployment complete. The fork runs as 'ksec'; the official 'kimi' is untouched.
Rollback: ./scripts/install-to-global.sh --restore
EOF

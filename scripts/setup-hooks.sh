#!/usr/bin/env bash
# Installs git hooks from scripts/hooks/ into .git/hooks/.
# Called automatically via the npm "prepare" lifecycle script.

set -euo pipefail

HOOKS_DIR="scripts/hooks"
GIT_HOOKS_DIR=".git/hooks"

if [ ! -d "$GIT_HOOKS_DIR" ]; then
  echo "setup-hooks: not a git repository, skipping hook installation"
  exit 0
fi

for hook in "$HOOKS_DIR"/*; do
  hook_name=$(basename "$hook")
  target="$GIT_HOOKS_DIR/$hook_name"
  cp "$hook" "$target"
  chmod +x "$target"
  echo "setup-hooks: installed $hook_name"
done

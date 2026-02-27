#!/usr/bin/env bash
# Local CI checks — runs before push via pre-push hook.
set -euo pipefail

echo "  → TypeScript type check..."
npx tsc --noEmit

echo "  → Biome lint check..."
npx biome check .

echo "  → Frontend tests..."
npx vitest --run

echo "  ✓ All checks passed."

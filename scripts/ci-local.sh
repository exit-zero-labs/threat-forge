#!/usr/bin/env bash
# ThreatForge Local CI — runs the same checks as GitHub Actions.
#
# Usage:
#   bash scripts/ci-local.sh           # lint + test (default)
#   bash scripts/ci-local.sh --build   # lint + test + tauri build
#
# Exit codes: 0 = all checks pass, non-zero = failure.

set -euo pipefail

# Ensure cargo is in PATH (npm scripts may not inherit shell profile)
if ! command -v cargo &>/dev/null && [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

BUILD=false
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
  esac
done

step() {
  echo -e "\n${BOLD}▸ $1${RESET}"
}

pass() {
  echo -e "${GREEN}  ✓ $1${RESET}"
}

fail() {
  echo -e "${RED}  ✗ $1${RESET}"
  exit 1
}

# ── Lint ──────────────────────────────────────────────

step "Biome lint + format check"
npx biome check . || fail "Biome check failed"
pass "Biome"

step "TypeScript type check"
npx tsc --noEmit || fail "TypeScript type check failed"
pass "tsc"

step "Rust format check"
cargo fmt --manifest-path src-tauri/Cargo.toml --check || fail "cargo fmt failed"
pass "cargo fmt"

step "Clippy lint"
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings || fail "Clippy failed"
pass "Clippy"

# ── Test ──────────────────────────────────────────────

step "Frontend tests (Vitest)"
npx vitest --run || fail "Vitest failed"
pass "Vitest"

step "Rust tests"
cargo test --manifest-path src-tauri/Cargo.toml || fail "cargo test failed"
pass "cargo test"

# ── Build (optional) ─────────────────────────────────

if [ "$BUILD" = true ]; then
  step "Tauri build"
  npx tauri build || fail "Tauri build failed"
  pass "Tauri build"
fi

# ── Done ──────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}All checks passed.${RESET}\n"

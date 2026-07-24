#!/usr/bin/env bash
# ThreatForge local CI — runs the deterministic checks feasible on one development host.
#
# Usage:
#   bash scripts/ci-local.sh           # lint + test + web build (default)
#   bash scripts/ci-local.sh --e2e     # default gate + E2E tests
#   bash scripts/ci-local.sh --build   # default gate + Tauri build
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
E2E=false
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
    --e2e) E2E=true ;;
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

step "Package lockfile registry check"
npm run check:lockfile || fail "Package lockfile registry check failed"
pass "package-lock.json"

step "Tauri JavaScript/Rust version alignment"
npm run check:tauri-versions || fail "Tauri version alignment failed"
pass "Tauri versions"

step "Fetch locked Rust dependencies"
cargo fetch --manifest-path src-tauri/Cargo.toml --locked ||
  fail "Cargo dependency fetch failed"
pass "Cargo dependencies"

step "Biome lint + format check"
npx biome check . || fail "Biome check failed"
pass "Biome"

step "TypeScript type check"
npx tsc --noEmit || fail "TypeScript type check failed"
pass "tsc"

step "Cloudflare Worker type check"
npm run check:worker-types || fail "Cloudflare Worker type check failed"
pass "Worker tsc"

step "Rust format check"
cargo fmt --manifest-path src-tauri/Cargo.toml --check || fail "cargo fmt failed"
pass "cargo fmt"

step "Clippy lint"
cargo clippy --manifest-path src-tauri/Cargo.toml --frozen -- -D warnings ||
  fail "Clippy failed"
pass "Clippy"

# ── Test ──────────────────────────────────────────────

step "Frontend tests (Vitest)"
npx vitest --run || fail "Vitest failed"
pass "Vitest"

step "Rust tests"
cargo test --manifest-path src-tauri/Cargo.toml --frozen || fail "cargo test failed"
pass "cargo test"

# ── Web Build ──────────────────────────────────────────

step "Web build"
npm run build:web || fail "Web build failed"
pass "Web build"

step "Cloudflare Worker dry run"
npm run check:worker || fail "Cloudflare Worker dry run failed"
pass "Cloudflare Worker"

# ── E2E Tests (optional) ─────────────────────────────

if [ "$E2E" = true ]; then
  step "E2E tests (Playwright)"
  npx playwright test || fail "Playwright E2E tests failed"
  pass "Playwright"
fi

# ── Build (optional) ─────────────────────────────────

if [ "$BUILD" = true ]; then
  step "Tauri build"
  npx tauri build -- --frozen || fail "Tauri build failed"
  pass "Tauri build"
fi

# ── Done ──────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}All checks passed.${RESET}\n"

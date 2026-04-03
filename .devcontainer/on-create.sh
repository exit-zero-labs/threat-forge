#!/bin/bash
set -e

WORKSPACE_CONFIG="/workspace-config"
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "🔧 Setting up ThreatForge dev environment..."

# ─────────────────────────────────────────────
# 1. Workspace config — mount or clone
# ─────────────────────────────────────────────
if [ -z "$(ls -A ${WORKSPACE_CONFIG}/.ai 2>/dev/null)" ]; then
  echo "  ↳ Workspace config not mounted — cloning from GitHub..."

  git clone --depth=1 --quiet \
    https://github.com/exit-zero-labs/root-e0l-ai.git \
    "${WORKSPACE_CONFIG}/.ai"

  git clone --depth=1 --quiet \
    https://github.com/exit-zero-labs/root-e0l-claude.git \
    "${WORKSPACE_CONFIG}/.claude"

  git clone --depth=1 --quiet \
    https://github.com/exit-zero-labs/root-e0l-github.git \
    "${WORKSPACE_CONFIG}/.github-workspace"

  echo "  ✓ Workspace config cloned from GitHub"
else
  echo "  ✓ Workspace config mounted from host"
fi

# ─────────────────────────────────────────────
# 2. Symlink — .e0l → /workspace-config
# ─────────────────────────────────────────────
ln -sfn "${WORKSPACE_CONFIG}" "${REPO_ROOT}/.e0l"
echo "  ✓ Symlink: .e0l → ${WORKSPACE_CONFIG}"

# ─────────────────────────────────────────────
# 3. System deps for Tauri (Linux build)
# ─────────────────────────────────────────────
echo "  ↳ Installing Tauri system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  > /dev/null 2>&1

# ─────────────────────────────────────────────
# 4. Install Node + Rust dependencies
# ─────────────────────────────────────────────
echo "  ↳ Installing npm dependencies..."
npm ci

echo "  ↳ Building Rust backend (first build may take a few minutes)..."
cd src-tauri && cargo build 2>&1 | tail -5 && cd ..

echo ""
echo "✅ ThreatForge dev environment ready"
echo ""
echo "   Workspace config: ${WORKSPACE_CONFIG}"
echo "   Symlink: ${REPO_ROOT}/.e0l"
echo ""
echo "   Start dev server:"
echo "   $ npm run dev        (Tauri + Vite, port 1420)"
echo "   $ npm run dev:web    (web-only mode, port 3000)"

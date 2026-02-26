---
name: build-test
description: Build and test the entire ThreatForge application (frontend + Rust backend)
disable-model-invocation: true
allowed-tools: Bash, Read
---

Build and test the full ThreatForge stack.

## Steps

1. **Lint TypeScript**
   ```bash
   npx biome check .
   ```

2. **Lint Rust**
   ```bash
   cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
   ```

3. **Run frontend tests**
   ```bash
   npx vitest --run
   ```

4. **Run Rust tests**
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

5. **Build frontend**
   ```bash
   npm run build
   ```

6. **Build Tauri app**
   ```bash
   npm run tauri build
   ```

Report results for each step. If any step fails, stop and report the failure with details.

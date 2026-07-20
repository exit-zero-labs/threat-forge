---
applyTo: "src-tauri/src/{ai,commands,file_io}/**,src-tauri/capabilities/**,src-tauri/tauri.conf.json,src/lib/adapters/**,src/lib/ai-*.ts,.github/workflows/**,package.json,package-lock.json"
---

# Security

Follow `AGENTS.md`; this file routes security-sensitive changes.

- Identify the trust boundary and validate every value crossing it.
- Use `KeyStorage` for credentials; never log, serialize, display, or misroute secrets.
- Scope paths and URLs, reject traversal and unsafe schemes, and preserve strict CSP behavior.
- Keep updater, release, and dependency integrity checks fail-closed and pinned.
- Preserve canonical lockfile provenance and least-permission workflow tokens.
- Return actionable user-safe errors without exposing secrets or raw internal details.
- Invoke `security-auditor` for IPC, storage, cryptography, provider networking, updater,
  workflow, dependency, or release changes.

---
applyTo: "src-tauri/**,src/lib/adapters/tauri-*.ts,src/lib/adapters/*-adapter.ts"
---

# Tauri boundaries

Follow `AGENTS.md`; this file adds rules for Tauri commands, events, capabilities, and frontend
bridges.

- Keep commands thin and validate every frontend-controlled value before domain work.
- Keep capabilities and plugin permissions least-privilege.
- Never expose credentials, raw internal errors, or unrestricted filesystem/network access.
- Reuse typed command, event, and adapter contracts; map cancellation and failures explicitly.
- Frontend callers must validate or narrow IPC responses rather than trusting unknown payloads.
- Keep blocking work off async command paths and make cancellation behavior deliberate.
- Test both the Rust boundary and the frontend adapter when a contract changes.

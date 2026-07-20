---
applyTo: "src-tauri/src/ai/**,src/lib/ai-*.ts,src/lib/ai-*.test.ts,src/components/panels/ai-*.tsx,src/stores/chat-store.ts,src/types/chat-session.ts"
---

# AI runtime

Follow `AGENTS.md`; this file applies because ThreatForge already ships model prompts, providers,
chat output, and model-proposed actions.

- Version prompts, schemas, tools, and quality rubrics when their behavior changes.
- Treat model text and tool arguments as untrusted; parse, validate, and fail closed.
- Keep tools least-privilege, confirmation-gated, transactional, and undoable.
- Preserve provider, model, prompt/rubric version, evidence, and cost provenance where available.
- Use deterministic fixtures and hard-failure prechecks before model-based quality judgments.
- Never fabricate assets, components, data flows, threats, CVEs, evidence, or severity rationale.
- Cover malformed output, rejected actions, cancellation, retries, and irreversible-action refusal.

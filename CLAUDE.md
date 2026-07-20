# ThreatForge Claude adapter

Read and follow @AGENTS.md. It is the canonical repository contract.

<!-- Optional shared company context; Claude skips this import when the path is absent. -->
@./.e0l/.ai/AI.md

Claude discovers canonical agents and skills through `.claude/agents` and `.claude/skills`.
Claude-specific path adapters remain under `.claude/rules/` and point to the canonical
`.github/instructions/` files rather than duplicating policy.

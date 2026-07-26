# ThreatForge Copilot adapter

Read and follow the repository-root `AGENTS.md` before planning, editing, reviewing, or
changing GitHub state. It is the canonical cross-agent contract.

Apply the path-matched files in `.github/instructions/`. Do not redefine their rules here.

Canonical reusable agents and lifecycle skills live in `.claude/agents/` and `.claude/skills/`.

Company-level standards are inherited under `.e0l/` — `.e0l/first-principles/` for the standards
set and `.e0l/first-principles/anti-slop/` for what generated output must never look like. That
directory is vendored from the Exit Zero Labs workspace and is never edited here; a change belongs
upstream and propagates back down.

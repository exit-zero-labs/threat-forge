---
applyTo: ".github/**,CONTRIBUTING.md"
---

# GitHub operations

Follow `AGENTS.md` and `CONTRIBUTING.md`; this file adds repository-operation rules.

- Keep workflow permissions least-privilege and pin every third-party action to a full commit SHA.
- Never echo secrets or interpolate untrusted issue, PR, branch, or matrix text into shell code.
- Preserve exact required-check names, CODEOWNERS coverage, and owner-validation boundaries.
- Treat Project 2 fields and lifecycle values as canonical; discover live IDs instead of hard-coding
  mutable node or option IDs.
- Keep reporter urgency distinct from maintainer-owned P0/P1/P2 priority.
- Do not mutate GitHub state without explicit authorization and never use owner bypass.

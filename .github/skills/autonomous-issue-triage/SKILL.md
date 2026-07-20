---
name: autonomous-issue-triage
description: Select the next executable agent-ready ThreatForge issue
---

# Autonomous issue selection

Selection is not shaping. Consider only issues already marked `Ready` and `agent-ready`.

Reject candidates with:

- missing acceptance criteria
- unresolved dependencies or research
- required secrets, provisioning, or account access
- unmade product, design, security, or licensing decisions
- size XL
- a missing committed plan for M/L

Rank remaining work by:

1. active roadmap/parent initiative
2. P0, then P1, then P2
3. dependency leverage and unblock value
4. smaller executable size
5. oldest settled Ready item

Recommend one issue with evidence. Begin implementation only when the user has requested it.
One issue maps to one branch and one PR. Stop at verification-complete `In review`; owner
validation and merge remain human-owned.

---
name: autonomous-issue-triage
description: Select the next executable AUTO ThreatForge issue
---

# Autonomous issue selection

Selection is not shaping. Consider only issues already marked `Ready` and `AUTO`.

Reject candidates with:

- missing acceptance criteria
- unresolved dependencies or research
- required secrets, provisioning, or account access
- unmade product, design, security, or licensing decisions
- `Effort` of `High` that has not been decomposed into executable sub-issues
- a missing committed plan for `Medium` or `High`

Rank remaining work by:

1. active roadmap/parent initiative
2. `High`, then `Medium`, then `Low`; a stray `Urgent` ranks with `High` and is flagged in the
   recommendation
3. dependency leverage and unblock value
4. lower `Effort`
5. oldest settled Ready item

Recommend one issue with evidence. Begin implementation only when the user has requested it.
One issue maps to one branch and one PR. Stop at verification-complete `In progress`; owner
validation and merge remain human-owned.

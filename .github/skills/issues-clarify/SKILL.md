---
name: issues-clarify
description: Re-derive and repair the ThreatForge GitHub board after roadmap or code drift
---

# Issues clarify

Run as an explicit maintainer-requested board maintenance pass.

1. Record the current `main` commit and all open PRs for a reproducible snapshot.
2. Discover Project 2 fields/options dynamically.
3. Review every non-Done issue against current code, merged work, open PRs, parent initiatives,
   dependencies, and roadmap direction.
4. Identify obsolete, duplicate, compound, blocked, mis-sized, or incorrectly prioritized work.
5. Preserve `To triage` for genuinely unshaped reports.
6. Split compound executable work into native sub-issues; XL remains a parent.
7. Ensure exactly one autonomy label and explicit acceptance/dependency state.
8. Mutate one item at a time, read it back, and leave a concise reason for material changes.
9. Report the snapshot, changes, unresolved decisions, and remaining drift.

Do not alter repository code or invent product decisions.

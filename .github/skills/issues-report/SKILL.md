---
name: issues-report
description: Produce a read-only maintainer briefing from ThreatForge Project 2
---

# Issues report

Produce a read-only, reproducible briefing. Do not mutate GitHub or repository files.

1. Record the current `main` commit, open PR set, and report timestamp.
2. Query Project 2 fields and open issue bodies.
3. Separate:
   - Automatable executable work
   - partly blocked work with the concrete blocker
   - owner-only/HITL decisions
   - unresolved `To triage` intake
4. Map parent/sub-issue and dependency relationships.
5. Lead with one recommended maintainer action and why.
6. Use asymmetric depth: more detail for high-impact or ambiguous items, less for settled work.
7. Save any long artifact outside the repository or in a gitignored session artifact directory.

Never infer readiness from labels alone; confirm criteria, dependencies, size, and plan state.

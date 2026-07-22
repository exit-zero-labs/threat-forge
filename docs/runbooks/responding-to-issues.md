# Responding to Issues

Guide for triaging and resolving GitHub issues for ThreatForge.

## Triage Workflow

### 1. Assess the Issue

When a new issue arrives:

- **Bug report**: Can you reproduce it? Check the `.thf` file if attached.
- **Feature request**: Does it align with `docs/plans/roadmap.md` and an existing
  initiative in the Threat Forge GitHub Project?
- **Question**: Can it be answered from docs? Point to relevant documentation.

### 2. Apply Labels

| Label | When to Use |
|-------|------------|
| `bug` | Confirmed reproducible defect |
| `enhancement` | Feature request aligned with roadmap |
| `good first issue` | Scoped, well-defined, approachable for new contributors |
| `help wanted` | We'd welcome community contributions |
| `documentation` | Docs-only change needed |
| `duplicate` | Already tracked — link to existing issue |
| `wontfix` | Out of scope or conflicts with design principles |
| `security` | Security vulnerability (handle with urgency) |
| `roadmap` | Maintainer-approved strategic initiative |
| `compliance` | Signing, distribution, privacy, or platform requirements |
| `architecture` | System architecture modeling or core architecture changes |
| `ai` | BYOK assistant runtime, providers, or native tool calling |
| `browser` | Browser workspace, persistence, or web-only behavior |
| `e2e` | End-to-end, visual, or agent-driven quality coverage |

After labeling, add the issue to Project 2 and set `Status`, `Priority`, and `Size`.

Apply exactly one autonomy label:

| Label | Meaning |
|-------|---------|
| `Automatable` | An agent can reach a verification-complete PR without earlier human action |
| `HITL` | A secret, account, provisioning step, or unresolved decision is required |

Final owner validation does not make an issue `HITL`.

### 3. Shape the Work

- Keep a new, incomplete report in `To triage`.
- Use `Backlog` for triaged work that is not executable or selected.
- Move to `Ready` only when acceptance criteria, dependencies, ownership, and autonomy are
  settled.
- XS/S issues carry their executable specification in the issue.
- M/L issues require a committed plan before implementation.
- XL issues are parents and must be decomposed.
- Persist a concise triage rationale for material field decisions.

Use the `issue-triage` skill for one issue and `issues-clarify` for an explicit whole-board
drift repair pass. Both discover live Project field IDs rather than relying on saved IDs.

### 4. Respond Promptly

- Acknowledge within 48 hours, even if just "Thanks, we'll look into this"
- Ask for reproduction steps if not provided
- Ask for OS version and ThreatForge version

## Fixing a Bug

For a red CI check rather than a reported bug, start from
[Diagnosing CI Failures](diagnosing-ci-failures.md) — it distinguishes a runner
infrastructure fault from a real break.

1. **Reproduce** the bug locally
2. **Create a branch**: `git checkout -b fix/issue-description`
3. **Write a failing test** that captures the bug
4. **Fix the bug** — minimal change, don't refactor surrounding code
5. **Verify the test passes**
6. **Run anti-slop review and preflight**
7. **Run full verification**: `npm run ci:local`
8. **Open a PR** referencing the issue: `Fixes #42`
9. **Move to In review** for owner validation
10. **Close the issue** when PR is merged (GitHub auto-closes with `Fixes #N`)

## Security Issues

Security vulnerabilities require special handling:

1. **Do NOT discuss details in public issues**
2. Check `SECURITY.md` for the vulnerability reporting process
3. Fix on a private branch if possible
4. Release a patch version promptly
5. Disclose after the fix is released

## Response Templates

### Bug Acknowledged
```
Thanks for reporting this! I can reproduce the issue on [OS/version].
I'll look into a fix — tracking in this issue.
```

### Need More Info
```
Thanks for the report. Could you provide:
1. Your OS and ThreatForge version
2. Steps to reproduce the issue
3. The `.thf` file (if non-sensitive)
```

### Won't Fix
```
Thanks for the suggestion. After consideration, this doesn't align with
our current design direction because [reason]. We're keeping this closed
for now, but feel free to reopen if you have additional context.
```

### Duplicate
```
This is tracked in #[existing-issue-number]. Closing as duplicate —
please follow that issue for updates.
```

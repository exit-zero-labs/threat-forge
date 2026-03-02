# Responding to Issues

Guide for triaging and resolving GitHub issues for ThreatForge.

## Triage Workflow

### 1. Assess the Issue

When a new issue arrives:

- **Bug report**: Can you reproduce it? Check the `.thf` file if attached.
- **Feature request**: Does it align with the project roadmap (`docs/plans/roadmap.md`)?
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

### 3. Respond Promptly

- Acknowledge within 48 hours, even if just "Thanks, we'll look into this"
- Ask for reproduction steps if not provided
- Ask for OS version and ThreatForge version

## Fixing a Bug

1. **Reproduce** the bug locally
2. **Create a branch**: `git checkout -b fix/issue-description`
3. **Write a failing test** that captures the bug
4. **Fix the bug** — minimal change, don't refactor surrounding code
5. **Verify the test passes**
6. **Run full validation**: `npm run ci:local`
7. **Open a PR** referencing the issue: `Fixes #42`
8. **Close the issue** when PR is merged (GitHub auto-closes with `Fixes #N`)

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

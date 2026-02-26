---
name: implement-sprint
description: Plan and implement a sprint task from the ThreatForge implementation plan
argument-hint: "[phase-number] [sprint-number]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

Implement sprint tasks for Phase $1, Sprint $2 from the ThreatForge implementation plan.

## Steps

1. **Read the implementation plan**
   Read `docs/implementation-plan.md` and find the sprint tasks for Phase $1, Sprint $2.

2. **Understand the context**
   - Read the project document: `docs/project-document.md`
   - Check what's already been implemented in the codebase
   - Identify dependencies and prerequisites

3. **Plan the implementation**
   - Break the sprint into individual tasks
   - Identify which files need to be created or modified
   - Determine the implementation order (dependency graph)

4. **Implement each task**
   - Follow all rules in `.claude/rules/`
   - Write tests alongside implementation
   - Run lint and tests after each significant change

5. **Verify completeness**
   - Check sprint exit criteria from the implementation plan
   - Run the full test suite: `/build-test`
   - Verify the app runs: `npm run tauri dev`

6. **Commit**
   - Use Conventional Commits: `feat(scope): description` or `refactor(scope): description`
   - One commit per logical unit of work

---
name: implement-sprint
description: Plan and implement a task from the ThreatForge roadmap
argument-hint: "[task-description]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

Implement the described task from the ThreatForge roadmap.

## Steps

1. **Read the roadmap and todo**
   Read `docs/plans/roadmap.md` and `docs/plans/todo.md` to understand current state and priorities.

2. **Understand the context**
   - Read the relevant knowledge docs in `docs/knowledge/` (architecture, file-format, etc.)
   - Check what's already been implemented in the codebase
   - Identify dependencies and prerequisites

3. **Plan the implementation**
   - Break the task into individual steps
   - Identify which files need to be created or modified
   - Determine the implementation order (dependency graph)

4. **Implement each step**
   - Follow all rules in `.claude/rules/`
   - Write tests alongside implementation
   - Run lint and tests after each significant change

5. **Verify completeness**
   - Run the full test suite: `/build-test`
   - Verify the app runs: `npm run tauri dev`

6. **Commit**
   - Use Conventional Commits: `feat(scope): description` or `refactor(scope): description`
   - One commit per logical unit of work

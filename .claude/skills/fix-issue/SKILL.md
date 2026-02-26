---
name: fix-issue
description: Fix a GitHub issue following ThreatForge coding standards and conventions
argument-hint: "[issue-number]"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

Fix GitHub issue #$ARGUMENTS following ThreatForge project conventions.

## Steps

1. **Understand the issue**
   ```
   gh issue view $ARGUMENTS
   ```
   Read the full issue description, comments, and any linked PRs.

2. **Investigate the codebase**
   - Find relevant files using Grep and Glob
   - Read and understand the existing code
   - Identify the root cause (not just symptoms)

3. **Implement the fix**
   - Follow code style rules in `.claude/rules/code-style.md`
   - Follow security rules in `.claude/rules/security.md`
   - Make the minimal change needed to fix the issue

4. **Write tests**
   - Add tests that reproduce the bug and verify the fix
   - Run the relevant test suite to confirm:
     - TypeScript: `npx vitest run <test-file>`
     - Rust: `cargo test --manifest-path src-tauri/Cargo.toml`

5. **Lint and format**
   ```
   npx biome check --write .
   cargo clippy --manifest-path src-tauri/Cargo.toml
   cargo fmt --manifest-path src-tauri/Cargo.toml
   ```

6. **Create a commit**
   - Use Conventional Commits: `fix(scope): description`
   - Reference the issue: `Fixes #$ARGUMENTS`

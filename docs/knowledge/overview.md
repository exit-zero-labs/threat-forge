# ThreatForge — Overview

## What It Is

ThreatForge is an open-source, AI-enhanced threat modeling application for the browser and Tauri desktop platforms. It fills the gap between Microsoft's free but Windows-only Threat Modeling Tool (opaque `.tm7` binaries and a legacy UI) and procurement-oriented enterprise platforms.

## Core Value Proposition

> For developers and security architects who need to create threat models, ThreatForge is a free, open-source browser and desktop app that makes threat modeling fast, AI-assisted, and git-native. Unlike Microsoft Threat Modeling Tool, ThreatForge runs across supported platforms, produces human-readable files, and integrates AI to help identify threats you'd otherwise miss.

## Key Differentiators

ThreatForge differentiates itself by combining three things:

1. **UX gap filled** — A modern, keyboard-shortcut-driven interface with drag-and-drop canvas, typed components and text annotations, custom themes, and resizable panes. The kind of experience developers expect from tools like Linear, Figma, or VS Code.

2. **File format gap filled** — The `.thf` YAML format is human-readable, git-diffable, and reviewable in pull requests. Microsoft's `.tm7` is binary, while Threat Dragon's JSON is comparatively verbose. ThreatForge can import `.tm7` files directly, converting them to `.thf` with elements, flows, boundaries, and threats preserved.

3. **AI integration gap filled** — An integrated AI chat pane (BYOK) supports conversational threat analysis and iterative model refinement.

## JTBD Framework

- **Functional job:** Create, review, and maintain architectural threat models that identify security risks and their mitigations during the design phase.
- **Emotional job:** Feel confident that security has been properly considered without being a security expert; feel that threat modeling is a productive use of time, not a checkbox exercise.
- **Social job:** Demonstrate to team, auditors, and stakeholders that a thorough security review was performed.

## Who It's For

| Persona | Description |
|---------|-------------|
| **The Developer** | Full-stack dev, 25-35, forced to use MS TMT for compliance but hates the UX. Doesn't know STRIDE well. |
| **The Security Architect** | AppSec engineer, 30-45. Spends hours manually creating threat models. Can't scale across teams. |
| **The Team Lead** | Engineering manager, 30-40. Can't review threat model changes in PRs. Needs enforceable process. |

## Status

ThreatForge's core application is functional. The following capabilities are shipped:

- Modern diagramming canvas with typed components, drag-and-drop, trust boundaries, text annotations
- STRIDE threat engine with auto-generated threats per element
- AI chat pane (BYOK) with OpenAI + Anthropic support, model selector, persistent chat sessions, markdown rendering, stop generating
- `.thf` YAML file format with clean git diffs
- Import from Microsoft TMT `.tm7` files with full element, flow, boundary, and threat conversion
- Light and dark themes, resizable panes, keyboard shortcuts, command palette
- Onboarding system with interactive guides
- Frontend (Vitest), Rust (cargo), and end-to-end (Playwright) test suites
- Browser access plus Tauri v2 desktop builds for macOS, Windows, and Linux

**Status: Planned** — public-launch work remains tracked in [roadmap Phase 0](../plans/roadmap.md#phase-0--operational-foundation) and [GitHub Project 2](https://github.com/orgs/exit-zero-labs/projects/2).

## Mission

ThreatForge exists to make threat modeling accessible to every developer, not just security specialists. Security shouldn't be gated behind expensive enterprise tools or painful UX. If more teams can threat-model quickly and painlessly, the software we all depend on gets safer.

Built by [Exit Zero Labs](https://exitzerolabs.com). Ship clean. Build forward.

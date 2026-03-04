# ThreatForge — Overview

## What It Is

ThreatForge is an open-source, AI-enhanced, cross-platform desktop threat modeling application built with Tauri v2 + React + TypeScript. It fills the gap between Microsoft's free but Windows-only Threat Modeling Tool (opaque `.tm7` binaries, 2016-era UI) and enterprise platforms like ThreatModeler/IriusRisk ($20K+/year).

## Core Value Proposition

> For developers and security architects who need to create threat models, ThreatForge is a free, open-source desktop app that makes threat modeling fast, AI-assisted, and git-native. Unlike Microsoft Threat Modeling Tool, ThreatForge runs on all platforms, produces human-readable files, and integrates AI to help identify threats you'd otherwise miss.

## Key Differentiators

ThreatForge's differentiation is the combination of three things no other tool brings together:

1. **UX gap filled** — A modern, keyboard-shortcut-driven interface with drag-and-drop canvas, 44 typed components + text annotations, custom themes, and resizable panes. The kind of experience developers expect from tools like Linear, Figma, or VS Code.

2. **File format gap filled** — The `.thf` YAML format is human-readable, git-diffable, and reviewable in pull requests. Microsoft's `.tm7` is binary. Threat Dragon's JSON is verbose. Neither can be opened in a text editor and understood.

3. **AI integration gap filled** — An integrated AI chat pane (BYOK) for conversational threat analysis and iterative model refinement. No other desktop tool combines interactive modeling with native AI assistance.

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

ThreatForge is production-ready. The core application is fully functional:

- Modern diagramming canvas with 44 typed components, drag-and-drop, trust boundaries, text annotations
- STRIDE threat engine with auto-generated threats per element
- AI chat pane (BYOK) with OpenAI + Anthropic support, model selector, persistent chat sessions, markdown rendering, stop generating
- `.thf` YAML file format with clean git diffs
- 13+ themes (light and dark), resizable panes, keyboard shortcuts, command palette
- Onboarding system with interactive guides
- 416+ frontend tests, 59+ Rust tests, 40+ E2E tests
- Cross-platform via Tauri v2 (macOS, Windows, Linux)

**Remaining for public launch:** Cross-platform CI builds + code signing, auto-updater, landing page/website, launch marketing.

## Mission

ThreatForge exists to make threat modeling accessible to every developer, not just security specialists. Security shouldn't be gated behind expensive enterprise tools or painful UX. If more teams can threat-model quickly and painlessly, the software we all depend on gets safer.

Built by [Exit Zero Labs](https://exitzerolabs.com). Ship clean. Build forward.

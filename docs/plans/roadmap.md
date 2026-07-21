# ThreatForge Roadmap

This document defines product direction, sequencing, and completion gates. Live status,
priority, sizing, and ownership belong in the
[Threat Forge GitHub Project](https://github.com/orgs/exit-zero-labs/projects/2).

## Product Direction

ThreatForge will evolve from a focused threat-modeling application into a local-first,
AI-assisted system architecture design workspace. Threat modeling remains a first-class
workflow rather than the only workflow.

The product remains:

- **Local-first and no-account** — no ThreatForge SaaS account is required.
- **BYOK** — AI requests go directly to the selected provider with the user's key.
- **Portable** — documents remain human-readable, git-diffable `.thf` files.
- **Cross-platform** — browser, macOS, Windows, and Linux behavior stays intentional.
- **Safe by default** — AI mutations are validated, reviewable, and undoable.

## Phase 0 — Operational Foundation

**Goal:** Make the project maintainable and ready for trustworthy public distribution.

### Scope

- GitHub Issues and Project V2 become the only planning system.
- Only `Shreyasdbz` and `exitzerolabs-admin` can update or merge to `main`.
- Cloudflare Workers becomes the sole web origin.
- Successful changes on `main` deploy to Cloudflare without a maintainer workstation.
- Dependency, secret-scanning, and contribution policies are automated.
- macOS, Windows, and Tauri updater signing are completed and verified.

### Exit Gate

- A clean machine can install a signed release without platform trust warnings.
- The updater verifies a signed update end to end.
- `threatforge.dev` and `www.threatforge.dev` are served directly by Cloudflare.
- Production web deployments are traceable to a passing commit on `main`.
- Every active roadmap item is represented in Project 2.

## Phase 1 — Multi-Document Local-First Workspace

**Goal:** Let users work across several architecture files without losing state.

### Architecture

- Replace the singleton model store with a document registry keyed by stable document IDs.
- Keep model, canvas, history, selection, settings, and AI conversation state per document.
- Add an active-document pointer and tab operations independent of file I/O.
- Store browser document bodies and revisions in IndexedDB.
- Store lightweight tab order, active tab, and workspace preferences in localStorage.
- Keep native file paths as adapter metadata, never as document identity.

### User Experience

- Open, create, reorder, pin, and close multiple tabs.
- Show dirty, saved, externally changed, and recovery states per tab.
- Restore the previous browser workspace after restart.
- Download any browser document as a normal `.thf` file.
- Import downloaded `.thf` files without losing document identity or history.

### Exit Gate

- At least ten documents can be opened and edited independently.
- Restart restores browser tabs and content without blocking the UI thread.
- Closing dirty tabs and resolving external changes cannot silently lose data.
- Desktop and browser adapters pass the same document-session contract tests.

## Phase 2 — System Architecture Design Platform

**Goal:** Support architecture design before, during, and after threat modeling.

### Model and Canvas

- Define optional, backward-compatible architecture metadata for components and
  relationships.
- Support architecture views, layers, groups, text, notes, and non-data-flow relationships.
- Preserve threat-specific elements and STRIDE analysis as an overlay on the broader model.
- Add migrations and round-trip fixtures before any `.thf` schema version change.

### Component and Icon System

- Introduce a typed component registry separated from rendering and palette layout.
- Add curated cloud, infrastructure, database, language, framework, and security icons.
- Record source, license, trademark guidance, aliases, and visual normalization metadata.
- Support repository-reviewed icon contributions; do not accept arbitrary document uploads.
- Add search, provider/category filters, recent items, favorites, and virtualized rendering.

### Information Architecture

- Reorganize the palette, inspector, threats, and AI surfaces around the active workflow.
- Keep common actions discoverable through menus, command palette, keyboard, and context.
- Add responsive panel presets and intentional empty/loading/error states.

### Exit Gate

- Users can create a useful architecture diagram without enabling threat modeling.
- Threat analysis can be enabled on the same document without conversion or duplication.
- The component library remains fast with thousands of searchable entries.
- Icon licensing is machine-auditable.

## Phase 3 — Native BYOK AI Tool Runtime

**Goal:** Replace prompt-parsed action blocks with real provider tool calls and a safe,
multi-turn execution loop.

### Runtime

- Define a provider-neutral message, tool, tool-call, tool-result, and usage event model.
- Implement native tool calling for Anthropic and OpenAI-compatible providers.
- Keep API keys local and encrypted; no Exit Zero Labs proxy or user account is introduced.
- Stream text and tool events through one cancellable conversation state machine.
- Bound tool iterations, context size, retries, and provider errors explicitly.

### Initial Tool Surface

- Read/query the current document, selection, viewport, and available component registry.
- Add, update, delete, duplicate, and move elements.
- Add, update, reconnect, style, and delete relationships.
- Add, resize, move, and edit trust boundaries and groups.
- Add and edit text annotations, properties, threats, and mitigations.
- Select, focus, fit, and navigate the canvas.
- Apply validated batches as one transaction with one undo boundary.

### Safety and Conversation

- Validate every tool input against generated schemas and current document references.
- Show a structured preview before destructive or multi-object mutations.
- Support approval modes without allowing models to bypass validation.
- Return tool results and validation failures to the model for corrective follow-up turns.
- Persist conversation and tool history per document in IndexedDB.
- Treat all model output as untrusted and keep execution auditable.

### Exit Gate

- No graph mutation depends on parsing fenced JSON or YAML from assistant text.
- A user can iteratively ask the assistant to build, revise, and explain an architecture.
- Every mutation is reviewable, undoable, and covered by provider-contract tests.
- BYOK works without ThreatForge authentication or cloud state.

## Phase 4 — Agent-Driven E2E and Visual Quality

**Goal:** Make the real application inspectable by local coding agents and deterministic in CI.

### Browser Harness

- Add versioned workspace fixtures for empty, realistic, large, and malformed documents.
- Provide deterministic scripts for launching, seeding, clicking, dragging, and exporting.
- Capture screenshots, traces, videos, console errors, accessibility results, and DOM snapshots.
- Generate a single artifact manifest so local agents can locate and compare evidence.

### Desktop Harness

- Add a minimal Tauri E2E smoke suite for native dialogs, file associations, save/reopen,
  signing-sensitive paths, and updater flows.
- Keep browser tests for shared UI behavior and desktop tests for native boundaries only.

### Visual Review

- Commit stable cross-platform baselines where rendering is deterministic.
- Define a visual quality rubric for hierarchy, clipping, overlap, contrast, alignment, and
  responsive states.
- Document the local agent workflow for opening the app, exercising a use case, capturing
  evidence, and reporting defects with screenshots.

### Exit Gate

- A local agent can execute a documented end-to-end use case without bespoke setup.
- Every failure preserves enough evidence to reproduce it.
- Critical creation, multi-tab, persistence, AI-tool, import/export, and release flows have
  E2E coverage.

## Phase 5 — Architecture Workflow Expansion

**Goal:** Build higher-level use cases on the workspace, model, AI runtime, and quality
foundations.

Candidate initiatives include:

- Architecture review and design-quality checks
- AI-assisted decomposition and relationship discovery
- Diagram-from-repository and diagram-from-description workflows
- Architecture decision records linked to model elements
- Cloud cost, reliability, privacy, and compliance overlays
- Rich export packages for pull requests, audits, and design reviews

Each candidate requires a GitHub initiative with a validated user problem and measurable
outcome before implementation.

# ThreatForge — Product Design

## User Personas

| Attribute | Alex — The Developer | Sam — The Security Architect | Jordan — The Team Lead |
|-----------|---------------------|-----------------------------|-----------------------|
| **Role** | Full-stack developer, startup or mid-size | AppSec engineer, enterprise | Engineering manager / tech lead |
| **Age/Experience** | 25-35, 3-8 years | 30-45, security-focused | 30-40, manages 5-15 engineers |
| **Pain Points** | Forced to use MS TMT for compliance but hates UX; doesn't know STRIDE well; files are opaque in PRs | Spends hours manually creating models; can't scale across 10+ teams; tools don't integrate with modern workflows | Can't review threat model changes in PRs; no way to enforce updates as part of dev process |
| **Current Alternative** | MS TMT reluctantly, or skips it entirely | IriusRisk/ThreatModeler (if budget) or manual docs | Word docs or wiki pages with diagrams |
| **Willingness to Pay** | $0 (individual) but would sponsor $5-10/mo | Would advocate for team sponsorship | Would sponsor at company level |
| **Acquisition Channel** | GitHub trending, HN, dev Twitter/X, Reddit | OWASP community, security conferences, LinkedIn | Team recommendation from Alex or Sam |

## Feature Set (Implemented)

### Must-Have (all shipped)

| Feature | Description |
|---------|-------------|
| Diagramming canvas | DFD canvas with drag-and-drop, trust boundaries, data flows, text annotations, typed components |
| `.thf` YAML file format | Human-readable, git-diffable, schema-validated, single-file |
| STRIDE threat engine | Auto-generated threats per element type, rule-based |
| AI chat pane (BYOK) | OpenAI + Anthropic support; model selector; chat sessions (persisted per file); markdown rendering; stop generating; enhanced STRIDE prompts |
| Cross-platform | Browser plus macOS, Windows, and Linux desktop builds via Tauri v2 |
| Component library | Typed components across 10 categories (incl. Annotations) in `src/lib/registry/`, rendered through `src/components/icons/icon-renderer.tsx` |
| Themes | Built-in light and dark themes with separate light/dark selection (`src/lib/themes/presets.ts`) |
| Keyboard shortcuts | Keyboard shortcuts with Cmd+K command palette (`src/lib/command-registry.ts`) |
| Resizable panes | Draggable left/right panels with min/max constraints |
| Onboarding | Interactive guides, tooltips, What's New overlay |
| Undo/Redo | Full history with snapshot-based undo for all operations |
| Minimap | Toggleable, themed minimap with quick-hide |
| Custom scrollbars | Theme-aware scrollbars across all platforms |
| Author tracking | Name/email settings, auto-populated created_by/modified_by |
| Self-loop connectors | Data flows from a node to itself |
| Canvas panning | Arrow key nudge for elements, arrow key pan when nothing selected |
| Import from MS TMT (.tm7) | XML parser converts elements, flows, boundaries, threats to `.thf` with positions preserved |

### Should-Have (future)

Future capabilities below are not yet shipped; they are tracked in [the roadmap](../plans/roadmap.md) and GitHub Project 2.

| Future capability |
|-------------------|
| Import from Threat Dragon (.json) |
| PDF/HTML export for stakeholders |
| LINDDUN privacy methodology support |
| Multiple diagrams per model |

### Could-Have (future)

| Future capability |
|-------------------|
| CI/CD GitHub Action for validation |
| TM-BOM (CycloneDX) export |
| Collaborative editing via git merge |

## User Journey (Critical Path)

```
Download ThreatForge → Open App → First-run Welcome
  → New Model: name, description → Diagramming Canvas (drag components)
  → Add trust boundaries, data flows
  → Click 'Analyze' → STRIDE threats auto-generated
  → Open AI Chat Pane → "What threats am I missing?"
  → AI suggests threats → Accept/modify with one click
  → Save → Human-readable YAML on disk
  → Git commit + push → Clean, reviewable diff in PR
```

**Aha moments:**
1. Saving for the first time, opening the `.thf` file in VS Code, and seeing clean YAML instead of binary garbage.
2. AI suggesting a threat they hadn't considered.

**Time-to-value target:** < 10 minutes from download to first saved threat model.

## Key Screens

1. **Main Canvas** — Split view: diagramming surface (center) + properties/threats panel (right). Component palette on left with draggable elements.
2. **AI Chat Pane** — Collapsible right-side panel. Maintains conversation context about the current model. One-click accept for AI-suggested threats.
3. **Threat Analysis View** — Table/list of all threats, filterable by STRIDE category, severity, and mitigation status. Linked to diagram elements.
4. **Settings** — Tabbed dialog: General, Appearance, AI, Updates, Support.
5. **Empty State** — Branded welcome with rotating security tips, quick-start buttons, footer with links.

## Success Metrics (HEART Framework)

These are planning targets, not currently instrumented product metrics. Any collection
requires a separately scoped issue and privacy review.

| Metric | Definition | Target (6mo) | Target (12mo) |
|--------|-----------|-------------|--------------|
| **Happiness** | GitHub star growth rate | 2,000 stars | 5,000 stars; >50 NPS |
| **Engagement** | Monthly active users (measurement approach TBD) | 2,000 MAU | 8,000 MAU |
| **Adoption** | Downloads per month | 1,000/mo | 5,000/mo |
| **Retention** | % users active 30 days after first use | 25% | 35% |
| **Task Success** | % who save a complete threat model | >70% | >80% |

## Edge Cases & Error Handling

- **Offline operation — shipped:** Core diagramming and threat analysis work offline. AI remains optional.
- **File conflicts — planned:** Detecting externally changed `.thf` files and offering recovery is tracked in [roadmap Phase 1](../plans/roadmap.md#phase-1--multi-document-local-first-workspace).
- **Large models — design target:** Validate responsiveness with representative large-model fixtures before making a shipped performance claim.
- **Invalid files — shipped:** Schema validation rejects invalid files with user-safe errors.
- **API key security — shipped:** Desktop keys are AES-256-GCM encrypted at rest; browser keys use `localStorage` with an explicit in-app warning. Keys are never written to threat model files.

## Accessibility

- WCAG 2.1 AA compliance target: keyboard navigation for all canvas operations, screen reader labels, 4.5:1 contrast ratios, focus management.
- English-only currently. Internationalization is not yet scoped and requires a canonical issue before implementation.

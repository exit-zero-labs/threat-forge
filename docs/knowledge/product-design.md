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
| Diagramming canvas | DFD canvas with drag-and-drop, trust boundaries, data flows, 40+ typed components |
| `.thf` YAML file format | Human-readable, git-diffable, schema-validated, single-file |
| STRIDE threat engine | Auto-generated threats per element type, rule-based |
| AI chat pane (BYOK) | OpenAI, Anthropic, Ollama support; conversational threat analysis |
| Cross-platform | macOS, Windows, Linux via Tauri v2 |
| Component library | 40+ typed components across 9 categories with lucide icons |
| Themes | 13+ themes (light and dark), separate light/dark selection |
| Keyboard shortcuts | 27+ shortcuts, Cmd+K command palette |
| Resizable panes | Draggable left/right panels with min/max constraints |
| Onboarding | Interactive guides, tooltips, What's New overlay |
| Undo/Redo | Full history with snapshot-based undo for all operations |
| Minimap | Toggleable, themed minimap with quick-hide |
| Custom scrollbars | Theme-aware scrollbars across all platforms |
| Author tracking | Name/email settings, auto-populated created_by/modified_by |
| Self-loop connectors | Data flows from a node to itself |
| Canvas panning | Arrow key nudge for elements, arrow key pan when nothing selected |

### Should-Have (future)

| Feature | Priority |
|---------|----------|
| Import from MS TMT (.tm7) and Threat Dragon (.json) | P0 |
| PDF/HTML export for stakeholders | P1 |
| LINDDUN privacy methodology support | P2 |
| Multiple diagrams per model | P2 |

### Could-Have (future)

| Feature | Priority |
|---------|----------|
| CI/CD GitHub Action for validation | Medium |
| TM-BOM (CycloneDX) export | Medium |
| Collaborative editing via git merge | High complexity |

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

| Metric | Definition | Target (6mo) | Target (12mo) |
|--------|-----------|-------------|--------------|
| **Happiness** | GitHub star growth rate | 2,000 stars | 5,000 stars; >50 NPS |
| **Engagement** | Monthly active users (opt-in telemetry) | 2,000 MAU | 8,000 MAU |
| **Adoption** | Downloads per month | 1,000/mo | 5,000/mo |
| **Retention** | % users active 30 days after first use | 25% | 35% |
| **Task Success** | % who save a complete threat model | >70% | >80% |

## Edge Cases & Error Handling

- **Offline operation:** Core diagramming and threat analysis work fully offline. AI features degrade gracefully with clear messaging.
- **File conflicts:** If `.thf` is modified externally (e.g., git merge), the app detects changes on focus and offers to reload.
- **Large models:** Canvas uses virtualized rendering for 100+ elements.
- **Invalid files:** Schema validation on open with clear error messages pointing to the invalid section.
- **API key security:** AES-256-GCM encrypted at rest. Never written to threat model file.

## Accessibility

- WCAG 2.1 AA compliance target: keyboard navigation for all canvas operations, screen reader labels, 4.5:1 contrast ratios, focus management.
- English-only initially. i18n architecture in place for future community-driven translations.

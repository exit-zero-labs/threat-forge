# ThreatForge — Roadmap

## Current Status

ThreatForge is production-ready. All core features are implemented and tested.

### What's Done

- Diagramming canvas with 40+ typed components, drag-and-drop, trust boundaries, self-loops
- `.thf` YAML file format (single-file, inline layout, clean git diffs)
- STRIDE threat engine with auto-generated threats per element type
- AI chat pane (BYOK: OpenAI, Anthropic, Ollama)
- 13+ themes (separate light/dark selection), custom scrollbars
- 27+ keyboard shortcuts, Cmd+K command palette
- Resizable panes, minimap, undo/redo, copy/paste
- Onboarding system with guides and What's New overlay
- Author tracking (created_by, modified_by, timestamps)
- Native menus, file associations, SEO meta
- 240+ frontend tests, 40+ Rust tests, 40+ E2E tests
- Local CI (Docker + native), GitHub Actions CI

### What's Left for Launch

- [ ] Cross-platform CI builds + code signing (Apple Developer + Windows Authenticode)
- [ ] Tauri auto-updater configuration + GitHub Releases
- [ ] Cross-platform smoke testing (macOS, Windows, Linux)
- [ ] Landing page / project website
- [ ] Demo video / walkthrough (2-3 min)
- [ ] Launch marketing (HN, Reddit, security newsletters)
- [ ] Opt-in telemetry (PostHog or custom)

## Future Work

### Phase 3: Community (Post-Launch)

| Feature | Priority | Description |
|---------|----------|-------------|
| Microsoft TMT (.tm7) import | P0 | Parse binary format, convert to `.thf` |
| OWASP Threat Dragon (.json) import | P1 | Parse JSON, convert to `.thf` |
| PDF/HTML export | P1 | Generate threat model reports for stakeholders |
| Community feedback iteration | P0 | Bug fixes, UX improvements from GitHub Issues |
| LINDDUN privacy methodology | P2 | Additional threat taxonomy alongside STRIDE |
| Multiple diagrams per model | P2 | Complex systems need multiple views |

### Phase 4: Ecosystem (Months 6-12)

| Feature | Trigger | Description |
|---------|---------|-------------|
| TM-BOM (CycloneDX) export | Community requests + OWASP standard maturity | Standard interchange format |
| CI/CD GitHub Action | 1,000+ users requesting pipeline integration | Validate threat model freshness in CI |
| OWASP project application | 3,000+ stars, active community | Official OWASP recognition |
| i18n framework + translations | Community volunteers available | String externalization + translations |
| GitHub Sponsors + Open Collective | 5,000+ users | Sustainability funding |
| MCP integration | When Tauri MCP support matures | Model Context Protocol for AI tooling |

### Deferred Items

- Port/handle labels on hover
- Manual theme visual walkthrough (requires human eyes)
- Manual tab-through accessibility audit (requires human testing)

## Development Methodology

ThreatForge follows **Shape Up** (appetite-based, not estimate-based). Features that exceed their time budget get stopped and reshaped, not extended.

**Velocity assumption:** 10-15 hrs/week as a side project.

**Kill gates:**
- <100 GitHub stars in first 2 weeks post-launch → Reassess scope and positioning
- 0 external contributors after 6 months → Evaluate community strategy
- Dreading it for 3+ consecutive weeks → Take a break or archive

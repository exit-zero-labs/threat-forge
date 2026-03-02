# ThreatForge — Risk Assessment

## Risk Register

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|-----------|--------|-----------|
| Low adoption / no community | Market | Medium | High | Multi-channel launch; file-format virality; build-in-public; kill gate at <100 stars |
| Solo developer burnout | Execution | Medium | High | Scope ruthlessly (MoSCoW); accept contributions early; burnout kill gate |
| File format doesn't gain traction | Market | Medium | Medium | Support import/export from existing formats; propose to OWASP TM-BOM |
| Cross-platform Tauri bugs | Technical | Low | Medium | CI matrix on all platforms; Tailwind abstracts most differences |
| AI features perceived as gimmicky | Product | Low | Low | AI is optional, not core; focus on genuine utility; iterate on feedback |
| Threat Dragon ships v3 competitive update | Competition | Low | Medium | Move faster; modern UX is hard to retrofit; file format + AI are differentiators |

## Pre-Mortem Failure Scenarios

### Scenario 1: "Built it but nobody came" (Medium likelihood)

Ship a polished tool, launch on HN, get 200 upvotes and 50 stars... then crickets. The problem is real but the market is too niche. The repo goes stale with 0 contributors.

**Mitigation:** The $600/year cost means financial loss is trivial. Risk is limited to time invested. Launch fast, kill early if no traction.

### Scenario 2: "Lost to a day job crunch" (Medium likelihood)

Day job has a crunch period. Side project stalls for 2-3 months during a critical early period. Momentum lost.

**Mitigation:** Front-load hardest work when motivation is highest. Maintain public accountability via build-in-public thread. If stalled >1 month, post honest update.

### Scenario 3: "The file format was a mistake" (Low likelihood)

YAML edge cases make git diffs messy in practice. Users report the file is "human-readable but not human-diffable."

**Mitigation:** Validated in Phase 0 with 10 sample models. Format has been stable through extensive development. Inline layout data decision specifically addresses diff noise.

## Single Points of Failure

| SPOF | Type | Redundancy Plan |
|------|------|----------------|
| Shreyas (sole developer) | Human | Document everything; accept contributions early; readable code |
| ReactFlow (diagramming) | Library | Active community (MIT); monitor health |
| GitHub (hosting, CI, releases) | Platform | Local backups; mirror to GitLab if needed |
| Tauri v2 | Framework | 88K+ stars; large enough to be sustained |

## Reasons to Believe

- Validated pain: Microsoft TMT's UX and file format problems are widely documented
- Timing: Regulatory mandates (PCI DSS 4.0, NIST SSDF) forcing more teams to threat model
- Enterprise consolidation ($100M merger) opens mid-market gap
- Builder-market fit: Developer has React/TS skills + security engineering domain knowledge
- Tauri v2 is mature for production desktop apps
- File-format virality is proven in developer tools (Terraform, Prettier, ESLint)

## Reasons to Doubt

- Side project: Ambitious scope for evenings/weekends. High abandonment rate historically.
- Niche market: Most developers avoid threat modeling regardless of tool quality.
- No revenue: Project depends entirely on maintainer's motivation and time.
- AI competition: ChatGPT/Claude can already generate reasonable threat models from descriptions.
- Threat Dragon could improve: OWASP Threat Dragon is planning v3 with TM-BOM format.

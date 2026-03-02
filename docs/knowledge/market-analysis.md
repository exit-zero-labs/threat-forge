# ThreatForge — Market Analysis

## Market Sizing

**Top-down:** The threat modeling tools market was valued at approximately $1.06-1.28 billion in 2024-2025, growing at 14-15% CAGR, projected to reach $2.3-3.0 billion by 2030 (Mordor Intelligence, Research and Markets, GII Research). The broader application security market is projected at $21.9 billion by 2029 at 21.8% CAGR (Technavio).

**Bottom-up (open-source niche):**
- ~30M professional developers worldwide (GitHub, Evans Data Corp)
- ~15% engage with security tooling = 4.5M potential users
- ~5% would adopt a free, modern threat modeling tool = 225,000 users
- GitHub sponsorship conversion ~0.1-0.5% = 225-1,125 sponsors
- Average sponsorship ~$5-25/month = $13,500-$337,500/year potential

**SAM (directly addressable):** 2-5M developers globally using Microsoft TMT, OWASP Threat Dragon, draw.io with stencils, or no tool at all.

**SOM (Year 1):** 5,000-15,000 active users, 2,000+ GitHub stars.

## Market Dynamics

| Factor | Finding | Impact |
|--------|---------|--------|
| Regulatory mandates | PCI DSS 4.0, NIST SSDF, EU CRA all mandate threat modeling | Strong tailwind — forcing adoption beyond security teams |
| AI coding acceleration | AI-generated code increases volume needing security review | Strong tailwind — more code = more need for threat models |
| Enterprise consolidation | ThreatModeler acquired IriusRisk for $100M+ (Jan 2026) | Tailwind — creates gap in mid-market/indie space |
| OWASP TM-BOM standard | CycloneDX threat model bill of materials schema emerging | Tailwind — first-mover opportunity for format adoption |
| 78% hiring gap | Organizations struggle to hire threat modeling staff | Tailwind — AI-assisted tools fill expertise gap |
| Shift-left movement | Security moving earlier in SDLC | Tailwind — developers (not just security pros) need accessible tools |

## Competitive Landscape

| Dimension | ThreatForge | Microsoft TMT | OWASP Threat Dragon | ThreatModeler/IriusRisk | draw.io + Stencils | STRIDE-GPT |
|-----------|------------|---------------|--------------------|-----------------------|-------------------|------------|
| **Pricing** | Free (OSS) | Free | Free (OSS) | Enterprise ($$$) | Free | Free (OSS) |
| **Platform** | Win/Mac/Linux | Windows only | Web + Desktop (Electron) | SaaS | Web | Web |
| **Modern UI** | Yes | No (2016 WinForms) | Functional, dated | Yes (SaaS) | Generic | Basic |
| **AI Features** | Integrated chat pane | None | None | Jeff AI | None | Core feature |
| **Git-friendly files** | YAML, human-readable | Binary .tm7 | JSON (verbose) | Proprietary SaaS | N/A | Markdown only |
| **STRIDE support** | Yes | Yes | Yes | Yes | No (manual) | Yes |
| **GitHub Stars** | New | N/A (closed) | ~1,300 | N/A (commercial) | N/A | ~600 |
| **Offline capable** | Full offline (AI optional) | Yes | Needs server | No (SaaS) | Yes | No (needs API) |

## White Space

The genuine unmet need sits at the intersection of three gaps:

1. **UX gap:** No free tool offers a polished, fast, keyboard-shortcut-driven experience that modern developers expect.
2. **File format gap:** No tool produces files that a human can open in a text editor and understand, while also diffing cleanly in git.
3. **AI integration gap:** No desktop threat modeling tool integrates conversational AI as a first-class feature.

## Defensibility

As an open-source project, traditional moats don't apply. Community defensibility matters:

- **Network effects:** Limited for modeling (small teams), but a shared file format creates ecosystem effects (CI integrations, converters).
- **Embedding:** If `.thf` files become the standard for git-tracked threat models, switching costs increase through CI pipelines, code review workflows, and team familiarity.
- **Brand:** A tool that genuinely delights users in a space known for terrible UX builds strong word-of-mouth.
- **Honest assessment:** Anyone can fork. The real defense is execution speed, community cultivation, and becoming the reference implementation.

## Sources

- Mordor Intelligence, "Threat Modeling Tools Market Size, Share, 2025-2030 Outlook"
- Fortune, "ThreatModeler acquires IriusRisk for over $100 million" (January 2026)
- OWASP Foundation, "OWASP Threat Dragon" — github.com/OWASP/threat-dragon
- GitHub Topics, "threat-modeling" — 1,700+ star curated list
- ThreatModeler, "ThreatModeler vs. Microsoft Threat Modeling Tool" (December 2025)
- OWASP, "Threat Modeling Methodology v2.0" (May 2025)

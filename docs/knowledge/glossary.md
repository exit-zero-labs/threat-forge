# ThreatForge — Glossary & References

## Glossary

| Term | Definition |
|------|-----------|
| **STRIDE** | Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege — Microsoft's threat classification framework |
| **DFD** | Data Flow Diagram — visual representation of system components and data movement |
| **TM-BOM** | Threat Model Bill of Materials — CycloneDX standard for threat model interchange |
| **BYOK** | Bring Your Own Key — user provides their own LLM API key |
| **TMT** | Microsoft Threat Modeling Tool |
| **Tauri** | Lightweight, Rust-based framework for cross-platform desktop apps using web frontends |
| **LINDDUN** | Linkability, Identifiability, Non-repudiation, Detectability, Disclosure of Information, Unawareness, Non-compliance — privacy threat modeling framework |
| **DREAD** | Damage, Reproducibility, Exploitability, Affected Users, Discoverability — risk rating model |
| **ReactFlow** | React library for building node-based editors and interactive diagrams (MIT, xyflow) |
| **Zustand** | Lightweight state management library for React |
| **serde** | Rust framework for serializing and deserializing data structures |
| **IPC** | Inter-Process Communication — in Tauri, the JSON-RPC bridge between frontend (WebView) and backend (Rust) |
| **CSP** | Content Security Policy — HTTP header that restricts what resources a page can load |

## Element-to-STRIDE Threat Mapping

| Element Type | Applicable STRIDE Categories |
|-------------|------------------------------|
| Process | All 6: Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege |
| Data Store | Tampering, Information Disclosure, Denial of Service |
| External Entity | Spoofing, Repudiation |
| Data Flow | Tampering, Information Disclosure, Denial of Service |

## Comparable Open-Source Projects

| Project | Relevance | Stars | Outcome |
|---------|-----------|-------|---------|
| **Excalidraw** | Open-source diagramming with delightful UX | 90K+ | Proves modern UX in boring space wins |
| **OWASP Threat Dragon** | Direct competitor; OSS threat modeling | ~1,300 | Functional but not beloved; validates the space |
| **STRIDE-GPT** | AI-powered threat model generator | ~600 | Proves AI + STRIDE has demand; but output-only |
| **Insomnia** | OSS API client that disrupted Postman | Acquired | Great UX builds large communities; later acquired by Kong |
| **Linear** | Project management with exceptional UX | N/A | Fast + beautiful beats entrenched players |

## Research Sources

- Mordor Intelligence, "Threat Modeling Tools Market Size, Share, 2025-2030 Outlook" (2025)
- Research and Markets, "Threat Modeling Tools Market Size, Share & Forecast to 2032" (2025)
- Fortune, "ThreatModeler acquires IriusRisk for over $100 million" (January 2026)
- OWASP Foundation, "OWASP Threat Dragon" — github.com/OWASP/threat-dragon
- Tauri v2 stable release (October 2024) — tauri.app
- ReactFlow (xyflow) — reactflow.dev (MIT license)
- HN launch data: average repository gains 121 stars in 24h, 289 in one week (arxiv.org)
- Shape Up methodology — basecamp.com/shapeup
- OWASP, "Threat Modeling Methodology v2.0" (May 2025)

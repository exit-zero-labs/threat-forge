# Security Policy

ThreatForge is a security tool. We take the security of our own code seriously.

## Reporting a Vulnerability

If you discover a security vulnerability in ThreatForge, **please do not open a public issue.**

Instead, report it privately:

1. **GitHub Security Advisories (preferred):** Use [GitHub's private vulnerability reporting](https://github.com/exit-zero-labs/threat-forge/security/advisories/new) to submit a report directly.
2. **Email:** Send details to **admin@exitzerolabs.com**.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if you have one)

### What to Expect

- **Acknowledgement** within 48 hours
- **Initial assessment** within 7 days
- **Fix timeline** depends on severity:
  - Critical/High: patch release within 14 days
  - Medium: included in next scheduled release
  - Low: tracked for future release

## Scope

The following are in scope for security reports:

- **Tauri IPC boundary** -- unauthorized access from the frontend to Rust backend functions
- **File I/O** -- path traversal, arbitrary file read/write
- **API key handling** -- leaks via logs, error messages, telemetry, or file output
- **AI response handling** -- injection via LLM output rendered in the UI
- **YAML parsing** -- denial of service via crafted input, deserialization issues
- **Auto-update mechanism** -- signature bypass, MITM on update channel
- **Dependency vulnerabilities** -- in npm or Cargo dependencies

## Out of Scope

- Vulnerabilities in the user's own LLM API provider (Anthropic, OpenAI)
- Social engineering attacks
- Issues requiring physical access to the user's machine
- Bugs that require the user to deliberately misconfigure the application

## Security Design

ThreatForge follows these security principles:

- **API keys** use AES-256-GCM encrypted storage on desktop; the browser stores keys in `localStorage` with an explicit in-app warning. Keys are never written to threat model files
- **AI API calls** go directly from the user's machine with the user's key -- no proxy server
- **LLM output** is treated as untrusted input; the Markdown renderer escapes raw HTML by default
- **Native file I/O** is handled by Rust commands; path traversal and arbitrary file access remain explicitly in scope for security reports
- **YAML deserialization** uses typed serde validation with explicit schema version checking; unknown fields are tolerated for forward compatibility
- **Content Security Policy** is strict by default -- no inline scripts, no remote code loading
- **Auto-update signature verification** is planned through the Tauri updater; signing and end-to-end update verification remain [roadmap Phase 0](docs/plans/roadmap.md#phase-0--operational-foundation) gates

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous release | Security fixes only |
| Older | No |

## Recognition

We're happy to credit security researchers who report valid vulnerabilities. Let us know if you'd like to be acknowledged in the release notes.

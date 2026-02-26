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

- Vulnerabilities in the user's own LLM API provider (OpenAI, Anthropic, Ollama)
- Social engineering attacks
- Issues requiring physical access to the user's machine
- Bugs that require the user to deliberately misconfigure the application

## Security Design

ThreatForge follows these security principles:

- **API keys** are stored in the OS native keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service), never in files
- **AI API calls** go directly from the user's machine with the user's key -- no proxy server
- **LLM output** is treated as untrusted input and sanitized before rendering
- **File operations** are scoped via Tauri's path resolver to prevent directory traversal
- **YAML deserialization** uses strict mode (`deny_unknown_fields`) to reject malformed input
- **Content Security Policy** is strict by default -- no inline scripts, no remote code loading
- **Auto-updates** use Tauri's built-in signature verification via GitHub Releases

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous release | Security fixes only |
| Older | No |

## Recognition

We're happy to credit security researchers who report valid vulnerabilities. Let us know if you'd like to be acknowledged in the release notes.

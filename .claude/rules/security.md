# Security Rules

This is a security tool. The bar for security in our own code is high.

## API Keys
- NEVER write API keys to files, logs, or telemetry. Always use OS keychain via Tauri plugin.
- NEVER include API keys in error messages or user-facing strings.
- NEVER commit `.env` files or any file containing secrets.

## Input Validation
- Validate ALL user input on the Rust side before processing. The frontend is untrusted.
- Use serde strict deserialization for YAML files — reject unknown fields.
- Sanitize file paths to prevent directory traversal. Use Tauri's path scoping.
- Validate YAML schema version on file load. Reject unsupported versions with clear errors.

## Tauri Security
- Follow Tauri's capability system. Only grant permissions the app actually needs.
- Keep the default strict CSP. No inline scripts, no remote code loading.
- All frontend-to-backend communication via Tauri IPC only. No direct filesystem access from React.
- Use `tauri::command` with proper error handling. Never `unwrap()` in command handlers.

## Supply Chain
- Minimize dependencies. Every new crate or npm package is an attack surface.
- Pin dependency versions in `Cargo.toml` and `package.json`.
- Run `cargo audit` and `npm audit` before releases.

## AI Integration
- AI API calls go directly from the user's machine with the user's key. No proxy server.
- Never send the user's API key to any endpoint other than the configured LLM provider.
- Sanitize AI responses before rendering — treat LLM output as untrusted input.
- AI features are optional. The app must be fully functional offline.

## Code Review Checklist
- No hardcoded secrets, tokens, or credentials.
- No `unsafe` Rust without a safety comment and justification.
- No `eval()`, `dangerouslySetInnerHTML`, or dynamic code execution.
- No disabled security features (CSP bypasses, certificate skipping).

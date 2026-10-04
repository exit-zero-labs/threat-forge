# Issue 351 — Fixed browser/Rust endpoint parity

## Issue contract

- **Issue:** https://github.com/exit-zero-labs/threat-forge/issues/351
- **Parent initiative:** https://github.com/exit-zero-labs/threat-forge/issues/348 (native Feature)
- **Type:** Task
- **Effort:** High
- **Priority:** High
- **Autonomy:** AUTO
- **Dependencies:** #350
- **Architecture and constraints:** [Independent provider plan](348-provider-compatibility.md).
- **Non-goals:** Hosted proxy, configurable provider URLs, schema/persistence changes, silent model substitution and deployment.

## Objective and executable steps

- Depends on 2. Own `src/lib/adapters/provider-endpoints.ts`, its tests, Rust `src-tauri/src/ai/providers.rs`, and relevant relay tests; touch commands only if validation needs provider-specific constraints.
- Use `/v1/responses` for OpenAI in both platforms; keep Anthropic `/v1/messages`. Keep auth headers Rust-owned on desktop. Preserve redirects refused, cancellation, framing caps, body caps, error redaction, stream-ID filtering and byte limits. Update endpoint-drift checks to assert full paths, not just origins. Add narrow body rejection for contradictory provider fields where contract validation is required without maintaining a second full wire schema in Rust.
- Acceptance: frontend cannot choose URL/headers; full-path parity asserted; invalid/nonstreaming/oversized requests never send; fake credential does not appear in IPC payloads, safe messages, errors, persisted output, or test evidence.
- Targeted check: endpoint/browser/Tauri adapter suites; `cargo test --manifest-path src-tauri/Cargo.toml ai::`; Rust formatting and warning-denying Clippy. Owner validation: desktop greeting and native tool roundtrip after authorized live smoke.

## Verification and review

Run the targeted checks above, then the shared `npm run ci:local` gate once for the coherent change. Use the parent plan's independent PR, slop and security review lanes. Owner intent validation and paid/native execution are distinct from deterministic local proof.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial independent plan | Parent planning lane prepared this step against c00e63b4; owner approved plan-only publication. |

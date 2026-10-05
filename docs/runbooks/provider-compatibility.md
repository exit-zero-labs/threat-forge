# Provider compatibility verification

## Local evidence

`tests/provider-http.test.ts` runs actual localhost HTTP, fetch, SSE decoding and the tool runner with synthetic keys. Request validators reject the former Chat Completions tool request before responding. Native Rust relay tests exercise reqwest and SSE framing against joined loopback servers. Neither test proves provider account access or a desktop application launch.

Run the focused provider checks with `npm test -- src/lib/ai/providers src/lib/ai/protocol src/lib/ai/loop/turn-machine.test.ts src/lib/ai/loop/turn-runner.test.ts tests/provider-http.test.ts`. Run browser checks with `THREATFORGE_E2E_PORT=3048 CI=1 npm run test:e2e:agent -- provider-compatibility --headless`; provider routes are intercepted and keys are fake. Run `npm run ci:local` before handoff. Docker and native owner validation remain separate gates.

## Current model catalog

The curated choices were checked on 2026-10-03 against [OpenAI's current model guide](https://developers.openai.com/api/docs/guides/latest-model) and [Anthropic's model overview](https://platform.claude.com/docs/en/models/overview). OpenAI requests use stateless Responses with `store:false`, explicitly non-strict optional tool schemas and encrypted reasoning replay. Anthropic replay preserves signed thinking and redacted blocks. Saved previous model choices remain selected; availability depends on the provider. Unknown model IDs retain plain chat and cannot advertise tools.

Native continuation receipts stay in memory and bind to the exact provider, requested model, system, tools and preceding serialized conversation. Stale previous-turn reasoning is removed from an outgoing projection. OpenAI assistant phase and reviewed calls remain available when the provider is unchanged. If the current tool turn's prefix changes or budget truncation removes it, the client refuses continuation before HTTP. Receipt content never enters `.thf` files or flattened persisted chat history.

## Opt-in paid provider smoke

Live verification was not performed during the local implementation. Issue [355](https://github.com/exit-zero-labs/threat-forge/issues/355) requires fresh credentials, explicit owner authorization and a spend ceiling. Never use the key exposed in the screenshot or put real credentials in Playwright. The separate Node smoke command uses production request builders, transport and decoders; it replaces only key storage with an environment lookup.

The owner must authorize one model, at most three sequential POSTs and a per-request output cap between 128 and 512 tokens. Input is a small synthetic greeting and pure function probe. Pricing and input-token charges must fit the separately approved spend ceiling; the output cap is not a dollar cap. Select each additional model in a separate authorized run.

Provide `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` through the approved environment without printing or saving it. Then set `THREATFORGE_LIVE_SMOKE=authorized`, `THREATFORGE_LIVE_MODEL` to one current catalog ID, and `THREATFORGE_LIVE_MAX_OUTPUT_TOKENS` to the approved cap before running `npm run test:provider:live`. Without all opt-in controls the command fails before any request. It reads no browser vault and writes no credential file. There are no retries or model substitutions. After an ambiguous POST or timeout, reconcile usage before authorizing another run.

The result prints only the selected and observed model IDs, provider, request count, output ceiling, usage and pass status. Failures report authored error codes. An access, permission or quota failure remains a provider gap; local fixture success cannot replace it. Owner validation in the desktop app and production deployment require their own authority and observable evidence.

# Issue 358 — Persist chat provider and move model selection into chat

## Objective

Keep the chosen provider and model across reloads, and offer one chat model dropdown grouped under OpenAI and Anthropic. AI settings manages credentials and provider information without changing chat routing.

## Issue contract

- **Issue:** [#358](https://github.com/exit-zero-labs/threat-forge/issues/358)
- **Parent initiative:** None
- **Type:** Bug
- **Effort:** Medium intended; the integration cannot write the native organization field
- **Priority:** Medium intended; the integration cannot write the native organization field
- **Status:** In progress intended; Project 2 access is forbidden to the integration, so the issue body records the exception rather than claiming a board update
- **Autonomy:** AUTO; `model/sonnet`
- **Milestone:** M3 • Release 1
- **Dependencies:** None for selection behavior; catalog work #353 and provider compatibility work #348/#350 remain separate
- **Non-goals:** Catalog refresh, new providers, automatic selection based on saved keys, protocol or transport changes, credential-storage redesign, `.thf` changes, deployment, and unrelated cleanup

The independent draft was prepared against clean revision `53ffc0b647ca8a625537cced9e977785092cbaf2`. The owner authorized local implementation before issue filing and a plan commit because tracker access and commit authority were unavailable. The later publication authorization permits commits, pushes, and PRs and requires screenshots in every PR. This canonical plan is prepared for a separate plan commit before the implementation commit; implementation and local verification already occurred under the recorded exception.

## Acceptance criteria

1. With a threat model open, chat offers one accessible Model combobox with OpenAI and Anthropic groups. Selecting an option chooses its provider and model for subsequent turns.
2. Provider selection and existing per-provider model preferences persist across reloads. Missing or invalid provider preferences retain the historical Anthropic default; arbitrary persisted values cannot select another endpoint.
3. Selection remains reachable in missing-key and unreadable-storage states. A provider without a key shows the existing configuration state without silently switching providers.
4. The picker and legacy-model replacement action are disabled during legacy streaming and native requesting, streaming, awaiting-approval, and executing phases, then become usable after settlement or cancellation.
5. AI settings contains credential controls and provider/storage information, with no model controls. Switching its credential target or managing another provider's key does not change chat selection.
6. Out-of-order key checks cannot overwrite the current provider's presence or fault with an obsolete answer. Existing storage-fault and clear-text-residue behavior remains intact.
7. Saved legacy IDs remain visible and selectable under their provider until deliberately replaced. Their warning, recommended-default action, and text-only behavior remain available in chat. Empty IDs use the existing runtime default; changing one provider's model preserves the other's preference.
8. Maintained browser tests drive selection and credential management through the UI, reload, and assert endpoint, model, and fixed fake credential routing using intercepted responses. Keyboard interaction, in-flight locking, narrow layout, long legacy IDs, and zoom receive focused coverage.

## Original behavior and evidence

At the planning revision, `src/stores/chat-store.ts` initialized provider to Anthropic without persistence, while `src/stores/settings-store.ts` already persisted `aiModelAnthropic` and `aiModelOpenai`. The provider control in `src/components/panels/ai-settings-content.tsx` called chat's `setProvider`, coupling credential management to chat routing. `checkApiKey` wrote each asynchronous answer into active status without checking whether it was obsolete.

`src/stores/chat-store.ts` and `src/stores/ai-turn-store.ts` capture provider and its corresponding saved model before asynchronous request work. `src/lib/ai-models.ts` owns the curated catalog, defaults, and provider-specific capability lookup. Preserve these boundaries. The chat header precedes missing-key/fault branches, so selection belongs there. The existing live-turn phases and legacy streaming state determine when selection is locked.

The browser transport resolves endpoint and credential from the captured request provider. Its contract and Rust counterpart need no changes for this issue. See [AI protocol](../knowledge/ai-protocol.md) and [architecture](../knowledge/architecture.md) for direct-to-provider behavior and platform storage boundaries.

## Implementation steps

### 1. Persist the existing provider authority

- **Behavior and files:** Keep `chat-store.provider` authoritative; change `src/stores/chat-store.ts` and its tests.
- **Implementation:** Use Zustand persist under `threatforge-ai-provider`, partializing only provider. Validate persisted unknown data during merge and runtime values in `setProvider`. Keep transcripts, key presence, faults, and document state out of this preference record. Existing per-provider model settings and synchronous request snapshots remain unchanged; do not mirror provider into settings.
- **Verification:** Demonstrate provider restoration through actual persistence/rehydration, invalid-value handling, preservation of unrelated state, and correct request provider/model pairs. Use `npm test -- src/stores/chat-store.test.ts src/stores/settings-store.test.ts src/stores/ai-turn-store.test.ts`.
- **Owner validation:** Select OpenAI, reload, and confirm both the picker and next request retain that choice.

### 2. Isolate current key checks

- **Behavior and files:** Prevent stale success/fault writes in `src/stores/chat-store.ts`; extend its regression tests.
- **Implementation:** Give active checks a request generation and apply answers only while generation and provider still match. Non-active credential checks must not invalidate active checks. Clear previous-provider presence/fault when deliberately switching, and preserve provider-specific residue refresh after migration. Synchronous Zustand hydration completes before component mount, so the existing mount key check reads the restored provider. `setProvider` starts explicit checks on later changes; adding a provider-dependent effect would duplicate them.
- **Verification:** Resolve checks out of order, including A→B→A, stale faults, same-provider overlap, and non-active credential checks. Assert active status and residue remain correct with `npm test -- src/stores/chat-store.test.ts`.
- **Owner validation:** Switch between keyed and unkeyed providers; chat availability follows the selected provider.

### 3. Move grouped selection into chat

- **Behavior and files:** Add `src/components/panels/chat-model-selector.tsx` and its tests, integrate it into `ai-chat-tab.tsx`, and update chat tests.
- **Implementation:** Use a labeled native select and semantic optgroups sourced from the existing catalog. Qualify option values with provider to prevent legacy-ID collisions. Write a chosen current model into its existing settings field before synchronously setting provider. Accept known catalog choices and preserved saved legacy choices, reject arbitrary IDs, and retain descriptions/default replacement. Render outside the key-state branches; disable selection and replacement using the existing busy predicate. Bound the empty conversation area so the extra selector does not move the composer when the first response arrives.
- **Verification:** Cover both groups, missing-key/fault states, legacy preservation and replacement, descriptions, provider collisions, and all live phases. Run `npm test -- src/components/panels/chat-model-selector.test.tsx src/components/panels/ai-chat-tab.test.tsx`; preserve existing browser scroll-containment assertions.
- **Owner validation:** Confirm the selected model/provider is clear without visiting settings, including legacy and missing-key cases.

### 4. Separate credential targeting

- **Behavior and files:** Update `ai-settings-content.tsx`, its tests, damaged-vault tests, and relevant settings-dialog tests.
- **Implementation:** Keep credential provider local to settings, initially matching active chat provider. Switching clears unsaved key text, visibility, and transient feedback; disable switching during save. Capture the target through asynchronous work. Remove model controls from settings. Refresh chat status only when the affected credential still matches live chat provider. Preserve sanitized errors, residue notices, checking/unknown status, recheck semantics, and platform-specific storage information.
- **Verification:** Manage Anthropic credentials while OpenAI remains selected, and verify active-provider credential changes still refresh chat. Run `npm test -- src/components/panels/ai-settings-content.test.tsx src/components/panels/ai-settings-damaged-vault.test.tsx src/components/panels/settings-dialog.test.tsx`.
- **Owner validation:** Configure both providers without inadvertently changing subsequent chat routing.

### 5. Verify routing and attach screenshots

- **Behavior and files:** Maintain `e2e/chat-model-selection.spec.ts`, the `chat-model-selection` scenario registration, its runbook entry, and focused protocol documentation.
- **Implementation:** Use existing fixtures/interactions, fixed fake keys, and provider-specific canned SSE. Intercept both provider endpoints before sending. Exercise UI selection, reload, credential independence, in-flight locking, keyboard selection, and a long legacy ID in a narrow panel at 200% CSS zoom. Assert endpoint, outgoing model, and matching fake authorization header. Reuse canonical SSE fixtures. Attach chat and credential-settings screenshots to every PR; screenshots supplement interaction assertions.
- **Verification:** Run the named browser scenarios and full gate below. Preserve failures through the existing artifact runner and stop servers started for testing.
- **Owner validation:** Review layout, focus, light/dark themes, zoom, and the complete selection/configuration workflow. Desktop restart remains a separate manual validation gap.

## Cross-cutting requirements

Persist only provider/model preferences, never key material. Preserve keychain encryption, request-provider credential binding, endpoint constraints, CSP, and Tauri permissions. No `.thf`, chat-session format, prompt, tool, or protocol version changes are intended. Preserve capability validation, approval, cancellation, transcript context, and undo. Keep semantic controls, visible keyboard focus, bounded widths, existing fault/no-key states, and reduced-motion support.

Catalog tests should derive current defaults from the authoritative catalog. Intercepted OpenAI success proves local selection and request routing, not live provider compatibility. The existing live OpenAI HTTP 400 rejection of `reasoning_effort` remains #348/#350; no live-response success is claimed.

## Verification gate and recorded evidence

```bash
npm run check:e2e-types
npm run test:e2e:agent -- chat-model-selection --headless
npm run test:e2e:agent -- ai-chat-experience --headless
npm run test:e2e:agent -- native-ai-tools --headless
npm run ci:local
```

The orchestrator's final verification record reports all 15 browser checks passed: two model-selection, nine chat-experience, and four tool-loop checks. The full local gate exited zero with 2,286 frontend tests and 172 Rust tests passed, plus one Rust test ignored; lint, type checks, Rust formatting/Clippy, web build, and worker dry run also passed. These results apply to the converged implementation based on `53ffc0b`, tracked diff SHA256 `cf8e8d40102be40e51f2336ac325d00fe83fbe218295c0d34a847ca6ebc52be5`. This planner inspected source but did not rerun those checks. Later additions supply the settings screenshot attachment and retained images; no production code changed after convergence.

Screenshots retained in [chat-model-selection evidence](../quality/evidence/chat-model-selection/) include before-chat, light/dark after-chat, credential-only settings, and legacy selection at CSS zoom. `native-ai-tools` exercises the browser tool loop, not a desktop binary. Native desktop UI/restart, live OpenAI response success, deployment, and owner intent validation remain unverified.

## Owner validation and specialist review

The owner should confirm reload/restart behavior, switching with only one configured key, independent credential management, clear grouped selection, and accessible layout. Green checks do not establish intent validation. The orchestrator reports independent correctness, slop, and security reviews converged without remaining findings on the verified implementation. Security review covers credential/provider binding and secret-free persistence/artifacts. Threat-model review is unnecessary unless implementation changes schema, domain content, or mutation safety.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-07 | Independent unpublished draft | Source inspection at clean `53ffc0b` established unpersisted provider and settings/chat coupling |
| 2026-10-07 | Local-only implementation exception | Owner authorized local implementation, tests, and reviews before ticket/plan commit; commits and publication were then unauthorized |
| 2026-10-07 | Persist only chat provider | Preserve existing readers/model preferences and avoid synchronized duplicate authority or a nested-settings migration |
| 2026-10-07 | Final review refinements | Preserve selectable provider-qualified legacy choices, descriptions, keyboard/in-flight/zoom checks, and canonical SSE fixtures; mount check plus explicit provider changes suffices |
| 2026-10-07 | Bound empty conversation layout | Existing scroll-containment regression exposed composer movement after the first turn; preserve assertions and make empty content shrinkable/scrollable |
| 2026-10-07 | File #358 and canonicalize plan | Owner later authorized commits, pushes, and PRs, requiring screenshots in every PR; issue filed as Bug in M3 with AUTO/model/sonnet; forbidden Project 2/native-field writes remain accurately recorded in the issue |
| 2026-10-07 | Compare retained reports as bytes | The pre-push scenario runner check failed; focused diagnosis found generic Buffer comparisons processing 1.1 MB of retained reports. Native byte equality preserves missing-file and exact-content assertions, reducing the focused run from 28.2 to 5.8 seconds without increasing timeouts. The full hook must still pass. |
| 2026-10-07 | Move picker into composer footer | [Owner feedback on PR #359](https://github.com/exit-zero-labs/threat-forge/pull/359#issuecomment-6046756621) requests the model picker beside Send/Stop, replacing the provider caption. The independent planner recommends a compact native select with descriptions and legacy guidance beneath it, plus a bottom selector when key/fault states omit the composer. Preserve busy locking, status feedback, keyboard use, and narrow/zoomed control reachability; refresh browser evidence and repeat review lanes. Earlier header-placement and verification/hash records above predate this revision; the current gate must run again. [VS Code's model documentation](https://code.visualstudio.com/docs/agent-customization/language-models), checked 2026-10-07, places selection in the chat input; [Copilot's documentation](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/chat-with-copilot/change-the-chat-model) also describes a chat model dropdown. This informs placement, not a copy of their other controls. |
| 2026-10-07 | Preserve focus and repair settings smoke assertion | Keep one footer mounted outside key-state branches, omitting its message field when a key cannot be used, so key checks cannot replace the focused picker. Preserve the browser's Ctrl/Cmd+L when no message field exists. The new focus regression fails on the duplicated-footer version. CI [run 37684597263](https://github.com/exit-zero-labs/threat-forge/actions/runs/37684597263) reports 134 expected, 12 skipped, zero flaky, and one unexpected test: `ai-chat.spec.ts` still expects case-sensitive `Provider` text. Replace that stale caption assertion with named credential controls and absence of a settings model selector; run the existing release smoke scenario. |

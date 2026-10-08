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

## Replan 2026-10-07 — Minimal composer and model menu

The owner requests another UI iteration on PR #359: follow the supplied Copilot reference's compact model label and chevron, omit its “Manage Models” action and multipliers, and audit motion, spacing, padding, organization, and interaction states around chat. This independent plan starts from clean `f3977345694148f17f1ed516fc47ff7fae72d54a` on `fix/chat-model-selection`. It supersedes the preceding native-select presentation proposal; provider persistence, routing, key management, turn safety, and the issue's remaining acceptance criteria continue to apply. No new protocol, catalog, credential, schema, or whole-application redesign is included.

### Source findings and chosen boundary

`chat-model-selector.tsx` currently renders a full-width native select, a persistent model description, and exceptional legacy guidance. `ai-chat-tab.tsx` adds a separate “Enter to send” or turn-state line below the footer, a rounded Send/Stop control, composer shadow, and focus-within color transition. Header and session controls use different border, radius, spacing, and transition treatments. These source observations explain the proposed surfaces; they are not a completed visual audit.

`package.json` has no Radix or comparable headless menu dependency, and `src/components/ui/` has no reusable menu primitive. `chat-session-picker.tsx` already uses a local React popup, but its searchable session-management dialog is a different responsibility. Build a focused model menu in the existing model-selector module instead of introducing a generic popup framework, coupling the two pickers, or adding a dependency solely for this slice. The right panel can scroll and clip descendants; the implementer must prove the chosen popup placement in the real browser, including CSS zoom, before treating placement as settled.

### 1. Replace the wide selector with one compact model menu

- **Files:** `src/components/panels/chat-model-selector.tsx` and its component tests.
- **Behavior:** A compact text button with one chevron shows the selected model. The opened menu has OpenAI and Anthropic headers, `menuitemradio` choices with an explicit selected indication, and model descriptions within choices. The normal closed composer contains no persistent model description. Keep the model catalog authoritative, provider-qualified choices, saved legacy choices under their own provider, empty-ID default behavior, explicit recommended replacement, and validation against arbitrary choices.
- **Interaction:** Give the trigger an accessible Model name, `aria-haspopup="menu"`, expanded state, and a relationship to the menu. Enter/Space or pointer opens without selecting; arrows open or navigate; Home/End move to bounds; typeahead moves to a matching model; Enter/Space deliberately selects. Escape dismisses and restores trigger focus. Tab dismisses while allowing normal focus traversal. Outside pointer dismissal must preserve the clicked control's focus. Changing key availability must not steal focus after selection. If a turn becomes busy, close the menu and lock both selection and legacy replacement; keep cancellation usable.
- **Presentation:** Use theme tokens, readable relative type sizes, bounded menu width/height, wrapping menu descriptions and long saved IDs, a stable selected mark slot, and restrained hover/active treatment. No scale, movement, height animation, or transition that animates text being read. Focus indicators may appear without changing layout. The inherited design floor requires 44×44 device-independent interactive targets; compact visible labels and icons can sit within those hit areas.
- **Targeted verification:** Replace native-select-specific test interactions with semantic menu interactions while preserving substantive routing/legacy assertions. Add tests for opening versus selecting, grouped selected states, keyboard/typeahead traversal, Escape/Tab/outside dismissal, asynchronous focus preservation, and menu closure when disabled. Run `npm test -- src/components/panels/chat-model-selector.test.tsx src/components/panels/ai-chat-tab.test.tsx`.

### 2. Reduce composer chrome and audit its adjacent controls

- **Files:** `src/components/panels/ai-chat-tab.tsx`, its tests, and presentation classes in `chat-session-picker.tsx` only where the browser audit identifies inconsistency.
- **Behavior:** Keep the single composer instance outside key/fault branches. Normal chat has the message field and one footer row: compact model picker on the left, Send or Stop on the right. Remove the persistent “Enter to send” line from the visual layout; preserve the keyboard shortcut through accessible help or the Send control. Preserve meaningful generating/review feedback through existing transcript/status surfaces or a compact status treatment that does not reintroduce a permanent helper row. Legacy warning and its deliberate replacement remain visible as an exceptional state, with truthful text-only/tool-use guidance. Missing-key and storage-fault controls remain actionable and must not be relabeled as successful or recoverable without evidence.
- **Audit:** Inspect header/settings, session trigger/New chat, empty transcript, composer, and opened model menu together. Standardize their immediate spacing, padding, radii, icon alignment, and focus treatment where necessary; preserve session creation/switching/search/rename/delete behavior. Reduce decorative empty-state framing only if the actual browser audit supports it. Do not change transcript rendering, approval cards, mutation handling, or unrelated panels.
- **State invariants:** Send, Stop, hover, active, focus, and disabled states do not move footer controls or change the composer border thickness. Avoid automatic focus on the textarea while the model menu owns focus. Preserve draft sizing, IME-safe Enter/Shift+Enter, Cmd/Ctrl+L only when the textarea exists, Escape cancellation, all busy phases, errors and missing-key states. Preserve the original composer containment checks when the first response appears.
- **Targeted verification:** Add discriminating tests for any reproduced focus or state defect before the fix. Confirm composer state feedback, no visually persistent routine helper, stable picker identity, keyless access, and cancellation. Do not weaken existing boundary assertions to accommodate the new UI.

### 3. Iterate in the browser and retain interaction-state screenshots

- **Files:** `e2e/chat-model-selection.spec.ts`, relevant `ai-chat-experience` assertions when semantics change, and `docs/quality/evidence/chat-model-selection/` with its evidence README.
- **Behavior:** Adapt the maintained scenario to drive the real model button/menu and confirm provider/model persistence, independent credential management, exact intercepted endpoint/model/fake-key routing, keyboard and pointer selection, in-flight lock, settlement and cancel. Use fixed obviously-fake keys and existing canned streams only. Native combobox assertions should become substantive button/menu/group/selected-state assertions, not broad text matching.
- **Browser audit:** Inspect light and dark normal/draft/disabled states; model menu open, pointer hover/active, keyboard focus; busy/Stop and awaiting-approval where available; no-key, storage fault, and saved legacy states. Check a normal-width panel, 260px panel, short viewport, 200% CSS zoom, and reduced motion. Confirm popup headers and choices are reachable without horizontal overflow, selected/focused rows remain readable, scrolling exposes all models, and the menu is not clipped by the panel or placed over its trigger. CSS zoom evidence must be identified as CSS zoom rather than native browser zoom.
- **Evidence:** Iterate after visual findings, retain final screenshots for compact closed composer and grouped open menu in both themes, representative keyboard focus/hover and busy state, and narrow/zoomed exceptional state. Inspect the images, not only their paths. Send final screenshots directly in chat as the owner requested, and include immutable images in the updated PR as its hard screenshot requirement. Record which interactions were exercised; screenshots alone do not establish behavior or an accessibility pass.
- **Targeted verification:** Run the named `chat-model-selection`, `ai-chat-experience`, and `native-ai-tools` scenarios sequentially with the existing artifact runner. Run `release-smoke` if settings/session smoke assertions are affected. Keep failure traces and reports; diagnose any red CI per the existing runbook before rerunning.

### 4. Review and publish the converged revision

Run self-review and the independent correctness, slop, and applicable security lanes against a stable recorded diff. Check popup semantics, focus ownership, busy transitions, provider-qualified legacy handling, duplicate state, unnecessary abstractions/dependencies, credential-free screenshots, truthful evidence, and accidental scope expansion. Threat-model review remains unnecessary unless schema, domain correctness, or mutation boundaries change. Run the mandatory `npm run ci:local` once after convergence, update PR #359 with final screenshots and verification limits, and monitor required remote checks. Keep issue #358 open and report inaccessible Project 2 metadata accurately. Existing autonomous commit/push/PR authority applies; no merge or deployment authority is added by this UI request.

### Owner validation and verification limits

The owner should judge whether the closed composer now matches the reference's restraint, whether the popup provides useful choices without overwhelming the panel, and whether hover/focus/disabled/busy states feel steady. Desktop UI/restart remains unverified unless actually exercised. Intercepted provider responses prove selection and routing, not live OpenAI protocol compatibility; #350 remains outside this replan. This planner inspected source and instructions only, did not execute tests or a browser, and makes no completion or visual-quality claim for the proposed revision.

### Browser iteration — 2026-10-07

The first popup screenshot showed every model description wrapping onto additional lines, producing a tall menu unlike the owner's reference. Keep one visible model label per row with the selected check mark; retain each catalog description inside its choice as accessible help and a native title. This supersedes the visible-description proposal above while preserving information and keyboard/pointer selection. The initial CSS-zoom check also exposed clipped configuration controls when centered keyless content was compressed; let the existing panel scroll oversized empty-state content instead of hiding it inside a compressed flex region. The initial Tab assertion targeted disabled Send, which browsers correctly skip; exercise Tab with a non-empty draft. These are observed iteration findings, not a final verification claim.

The final visual pass removes stacked focus outlines: only a focused textarea outlines the composer, while focused footer controls use their own thin indicator. Hover, active, focus, and Send/Stop geometry remain asserted in the browser; normal helper text remains accessible without occupying a row. The popup height now intersects the chat surface with its scroll viewport after an observed CSS-zoom clipping failure, and focus scrolling uses measured rectangles plus menu padding to avoid fractional-pixel clipping. The unavailable-vault scenario blocks only the vault's IndexedDB boundary, preserving normal workspace storage and verifying the real adapter's sanitized fault guidance.

### Minimal revision verification — 2026-10-07

The root-owned local gate passed 2,292 frontend tests and 172 Rust tests, with one Rust test ignored, plus lint, types, formatting, Clippy, web build, and worker dry run. Focused checks passed 34 composer/selector component tests and 46 CLI/catalog tests. Sequential maintained browser scenarios passed model selection (3), chat experience (9), native AI tools in the browser (4), and release smoke (10). The final 16 screenshot artifacts were visually inspected; scoped menu/fault axe checks, exact intercepted routing, keyboard selection/dismissal, steady control geometry, and narrow CSS-zoom containment passed. These checks do not establish desktop or live-provider behavior.

Independent read-only correctness, slop, and security reviewers inspected the same frozen diff and all 16 images. No must-fix findings remained; the shared should-fix was an incorrect baseline image width in the evidence README, corrected to the actual 1280 × 800. Final self-review also removed an unused optional focus-restoration parameter while preserving unconditional trigger focus. The same lanes must recheck these bounded corrections before publication; the mandatory pre-push gate and required remote checks remain pending at this record.

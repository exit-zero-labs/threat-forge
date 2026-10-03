# Issue 335 — Polish AI chat and restore reliable session switching

## Objective

Make the AI panel readable and predictable in long conversations. A user can read older
messages during streaming, return to the latest response, compose a multiline question, and
switch chats or documents without losing the correct conversation context or moving an
approval into another document. Capture actual before/after screenshots for owner review.

## Issue contract

- **Issue:** `#335`
- **Parent initiative:** N/A; owner-requested continuation of AI improvements
- **Type:** Bug
- **Effort:** Medium
- **Priority:** Medium
- **Autonomy:** AUTO
- **Dependencies:** `#332` / PR `#334`, present in this branch; related `#63` and `#333`
- **Non-goals:** durable protocol/tool-history storage (`#63`), whole-change proposal review
  (`#333`), provider/key changes, `.thf` changes, new AI capabilities, changing approval policy,
  installing a chat framework, and unlimited conversation retention

The owner authorized implementation, commits, and a screenshot-backed PR. Project 2 access
returns 403; the owner authorized continuation with an issue-comment claim. This is an access
exception, not evidence that the Project 2 status was successfully updated.

## Current behavior and evidence

Inspected at `eefe47171a4fe7c729a8d0cd258e3f65980cfc23`, with a clean working tree.

- `ai-turn-store.ts` retains native history in one module variable. Native submits never
  update `chat-store.ts` sessions, so the native transcript and useful title are absent from
  the existing session picker. `resetTurn` erases history on panel mount and session changes.
- `chat-store.ts` already holds protocol blocks in memory but intentionally persists text-only
  sessions. `MAX_MESSAGES_PER_SESSION` is 200 and `MAX_SESSIONS_PER_FILE` is 50. Preserve these
  bounds and tool-group truncation through `capMessageHistory`; do not flatten runtime context.
- Unsaved documents share `threatforge-chat-sessions:unsaved`. The panel's migration effect
  compares paths without checking document identity, allowing a document switch to migrate
  another document's sessions. `document-registry.ts` attempts to restore a session before
  the incoming document's sessions are loaded, and cancels the outgoing response synchronously.
- `useScrollPinnedToBottom` scrolls on every message/turn change regardless of reader position.
  Existing containment tests protect ancestor offsets and the fixed composer position.
- The picker renders only with more than one session, has no search/rename/confirmation, and
  only checks the legacy stream flag. Native busy phases are invisible to its controls.
- The stop button uses identical destructive foreground/background colors in light themes.
  Messages have cramped typography; untagged code and long strings lack reliable containment.
  The composer has no accessible label, grows neither with its text nor its draft, and treats
  IME Enter as submission.

Preserve the contracts in [the AI tool loop](../knowledge/ai-tool-loop.md) and
[the AI protocol](../knowledge/ai-protocol.md). Follow the E2E scenario instructions and
[product voice](../knowledge/product-voice.md). Study public, documented chat conventions
(for example assistant-ui's thread/composer/thread-list examples) and record the actual
references inspected in the evidence README. Adopt familiar behavior within the existing
React implementation; avoid a new dependency merely for presentation.

## Implementation steps

### 1. Give existing sessions a document owner and retain their runtime state

- **Behavior:** One runtime session collection per stable document identity, with its active
  chat and drafts preserved across panel mounts and document activation. Two unsaved models
  are isolated. Save As migrates only the same document's storage binding.
- **Files:** `chat-store.ts`, `chat-store.test.ts`, `document-registry.ts` and its tests,
  `ai-chat-tab.tsx`, `types/chat-session.ts` if a runtime field is necessary.
- **Implementation:** Bind chat state in the document activation path rather than relying on
  panel mount effects. Cache the existing session collection and active ID by document ID in
  memory; reuse it when returning to an open document. Load a saved path's existing legacy
  payload only on its first binding. Unsaved storage keys must include document identity; do
  not copy the old shared unsaved payload into every new model. Keep saved path compatibility.
  Restrict migration to a path change for the same document; never remove another document's
  source key. Prune runtime data on document close, deletion, and session-cap eviction.
  Persist only the existing explicit ID/title/text-message/timestamp fields, excluding drafts,
  runner references, grants, prepared calls, and other runtime metadata.
- **Targeted verification:** `npx vitest run src/stores/chat-store.test.ts
  src/stores/document-registry.test.ts src/components/panels/ai-chat-tab.test.tsx`; prove two
  unsaved models, two saved paths, and same-document Save As have distinct expected behavior.
- **Intent validation:** Switch between two models with recognizably different chats, rename
  a file, revisit both, then close/reopen. State any reload limitation honestly.

### 2. Record and restore native conversations without moving live approvals

- **Behavior:** Native turns populate the active session's protocol messages and first-message
  title; returning to that chat restores text and subsequent request context. Switching away
  cancels the outgoing live turn before changing ownership and retains its settled partial
  output. A late old-runner event cannot overwrite the new chat or document.
- **Files:** `ai-turn-store.ts`, its tests, `ai-turn-bridge.ts` as needed, `chat-store.ts`,
  `ai-chat-tab.tsx`, and existing conversation-isolation/cancellation tests.
- **Implementation:** Capture document/session ownership at submit. Read `baseMessages` from
  that session rather than a global history array; fold runner updates into its runtime state,
  cap settled history using the existing pair-safe helper, and save the text-only projection
  at settlement. Update recency on activity, not merely selection. Retain settled native
  presentation metadata in memory per session so approval/status cards can remain in their
  chronological positions. Any retained runner is terminal before detachment and all commands
  require its document/session to be active; preserve single-turn Undo only when its existing
  ledger is genuinely undoable. Never reconstruct grants from transcript blocks or persisted
  text. Guard callbacks by runner identity and owner before altering the visible turn. Use the
  existing bridge pattern if needed to keep the store module graph acyclic. Remove mount-time
  clearing; a panel-tab change must preserve the current chat. Explicit reset remains a reset,
  not the normal session-switch mechanism. Restored tool-capable messages must keep fenced
  action buttons disabled; do not accidentally re-enable the legacy mutation path on replay.
- **Targeted verification:** `npx vitest run src/stores/ai-turn-store.test.ts
  src/components/panels/ai-chat-tab.test.tsx`; assert actual follow-up request payloads include
  only the selected session's context, contain valid tool pairing, and ignore delayed old
  callbacks. Switch while streaming and awaiting approval; no unauthorized mutation occurs.
  Preserve approval, denial, cancellation, and superseded-Undo controls.
- **Intent validation:** Start a response, switch chats, return, and continue. Repeat while an
  action is pending and while changing documents; inspect the final model and transcript.

### 3. Replace the session dropdown with a usable chat picker

- **Behavior:** A searchable, recent-first picker opens even for one chat, indicates the active
  chat, supports rename, and asks for confirmation before deletion. New chat is an explicit,
  readily discoverable action. Session operations use the lifecycle in steps 1–2.
- **Files:** `ai-chat-tab.tsx` or a focused sibling chat-picker component, component tests,
  `chat-store.ts` rename/session actions and tests.
- **Implementation:** Use a labelled picker surface with a search input, bounded list, title,
  useful recency, active indicator, and separate rename/delete controls. Search case-insensitive
  titles, keep ordering stable for ties, and show an authored no-results state. Support keyboard
  open, navigation/selection, Escape/outside dismissal, focus return, and rename Enter/Escape.
  Confirm the specific chat's deletion and focus the surviving chat. Blank rename is refused.
  New/switch/delete settle live native and legacy requests before changing selection; selecting
  the current chat is a no-op. Avoid accidental extra empty sessions when New chat is repeated.
- **Targeted verification:** Component tests exercise one-chat opening, search, recent ordering,
  rename, cancelled/confirmed deletion, keyboard selection, and native pending-approval switching.
- **Intent validation:** Navigate a list with dozens of similar titles using mouse and keyboard.

### 4. Keep reading position stable and improve response layout

- **Behavior:** Follow incoming content while near the bottom. Scrolling up holds the reading
  position during streaming and reveals a jump-to-latest control. Selecting a different chat
  initializes that chat at its latest content. Prose wraps; code/tables scroll within the chat,
  without moving ancestors or expanding the panel.
- **Files:** `ai-chat-tab.tsx`, `markdown-content.tsx`, their tests,
  `e2e/chat-scroll-containment.spec.ts` and the new chat-experience scenario.
- **Implementation:** Replace unconditional smooth scrolling with a bottom-proximity flag
  updated by that container's scroll event. Preserve position for updates while unpinned;
  explicit jump re-enables follow. Use immediate container scrolling for streaming updates,
  with no `scrollIntoView`. Reset follow on a chat identity change. Keep one scroll viewport
  with `min-height: 0` and `min-width: 0` through its flex ancestors. Use readable assistant
  text with generous line height and response spacing, a compact user bubble, and bounded
  message actions/statuses. Render current tool review/status alongside its originating
  assistant message rather than appending all calls after the text. Preserve untrusted Markdown
  behavior, link protections, legacy previews, notices, errors, and authorization controls.
  Style both tagged and untagged code through `pre`; contain long URLs and table overflow.
- **Targeted verification:** Browser assertions pin the composer and ancestor offsets, scroll
  into older text, deliver further chunks, assert position remains stable, then jump and assert
  the latest content is reachable. Check long code, tables, and unbroken URLs at narrow/wide
  panel widths in light/dark themes.
- **Intent validation:** Read a long answer while another arrives. Inspect typography, spacing,
  response chronology, and jump-control placement in screenshot evidence.

### 5. Integrate an accessible, growing composer

- **Behavior:** The composer grows to a bounded height, then scrolls internally. Enter sends,
  Shift+Enter adds a line, IME confirmation never sends, and Escape stops a live turn. Drafts
  survive switching chats and panel tabs. Send/stop remain recognizable in light/dark themes.
- **Files:** `ai-chat-tab.tsx` or a focused composer sibling, component tests, chat-store draft
  action introduced in step 1, and browser scenario.
- **Implementation:** Use one rounded composer surface with a labelled textarea, integrated
  bottom action row, and explicit accessible send/stop names. Auto-size after draft changes
  using a measured textarea with a maximum height. Keep draft editing available while busy;
  sending stays blocked until settlement, without introducing a queue. Bind text to the
  current session, clear only after a valid submit, guard composition events, and retain the
  existing focus shortcut. Use primary/foreground semantics with distinct icon colors for
  stop rather than the broken destructive token pair; do not change theme-wide semantics.
  Distinguish generating from awaiting-review status in the visible copy.
- **Targeted verification:** Component tests cover empty send, whitespace, multiline, IME,
  busy editing without duplicate submit, Escape, and per-chat drafts. Browser assertions prove
  bounded textarea growth and visible controls under both themes.
- **Intent validation:** Compose a multiline follow-up while a response is generating, change
  chats, return, and send it. Check the control remains understandable at sidebar width.

### 6. Exercise long chats and capture review evidence

- **Behavior:** Deterministic browser evidence covers at least 100 actual exchanges, many
  sessions, long Markdown/code/tables, streaming, errors, cancellation, and pending approvals.
- **Files:** A focused `e2e/ai-chat-experience.spec.ts`, shared canned-provider helpers as
  needed, `scripts/run-agent-scenario.mjs`, scenario catalog tests,
  `docs/runbooks/running-agent-e2e-scenarios.md`, and `docs/quality/evidence/ai-chat-experience/`.
- **Implementation:** Add a named scenario and runbook entry together. Use fake keys and
  deterministic provider routes; capture actual pre-change screenshots before replacing the
  UI, then matching after states. Run 100 exchanges through the submit/response path and
  verify bounded history/follow-up payload pairing near the 200-message cap; do not simulate
  a long session solely by injecting a store. A separate seeded many-session fixture may
  establish picker scale. Retain selected screenshot states for empty, long response,
  scrolled-up streaming, busy stop, picker, approval, and error in light/dark themes.
- **Targeted verification:** `npm run test:e2e:agent -- ai-chat-experience --headless`, existing
  `native-ai-tools` and scroll-containment scenarios, `npm run check:e2e-types`. Record exactly
  which screenshots and scenarios were executed; do not infer live-model quality from fixtures.
- **Intent validation:** Owner compares before/after screenshots and exercises the workflows
  below; no real OpenAI key is needed for deterministic UI verification.

## Cross-cutting requirements

- **Security and privacy:** No new transport, secret storage, telemetry, HTML interpretation,
  or persisted authorization. Avoid keys/provider headers in screenshots, logs, and fixtures.
- **`.thf` compatibility:** No schema, migration, file-format, or serialization change.
- **Browser and desktop:** Shared React/store behavior; preserve direct BYOK adapters and
  shortcuts. Document any desktop behavior that could not be exercised locally.
- **AI safety:** Preserve validated explicit approvals, destructive batch exclusions, terminal
  cancellation, tool-call/result pairing, transaction validation, and one-turn Undo semantics.
- **Accessibility and UX:** Label icon buttons, retain visible focus, manage picker/confirmation
  focus, keep shortcuts scoped sensibly, and announce authored loading/review/error status.
- **Observability and evidence:** Screenshot-backed PR with source references and reproducible
  scenarios. Persistence remains text-only after reload; protocol and tool status restoration
  in this issue is in-memory only, as tracked in `#63`.

## Verification gate

First run affected store/component tests, named browser scenarios, Biome, TypeScript, E2E
types, and the web build. Preserve meaningful existing regression assertions when replacing
reset-based behavior with session restoration; assert ownership rather than merely clearing.
Then run the required final gate:

```bash
npm run ci:local
```

If the managed environment lacks Rust, report the exact blocked command and rely on remote
CI for that lane without claiming local completion. Do not bypass git hooks or status checks.

## Owner validation

- Read a long response at narrow sidebar width without fighting scrolling or horizontal layout.
- Compare the stop control, composer, message spacing, and Markdown in light/dark screenshots.
- Find and rename a chat among dozens, dismiss deletion, then deliberately delete one.
- Move between chats and saved/unsaved documents, return to the correct draft and transcript,
  and confirm a follow-up uses the expected context.
- Switch away from a pending edit and confirm no approval carries into another chat/model.
- Decide whether the resulting panel feels polished; deterministic fixtures establish behavior,
  not the underlying model's answer quality or whole-change proposal design.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor: owner-bound lifecycle, stale callbacks, replay, and mutation controls
- [ ] Threat-model expert: not applicable unless implementation expands into domain/schema work

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-10-03 | Initial plan | Settled issue #335, owner authorization, and inspected chat/session/runner code |

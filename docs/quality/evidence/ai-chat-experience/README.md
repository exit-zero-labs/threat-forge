# AI chat experience — issue #335

Screenshots come from browser-mode Playwright runs with the repository's encrypted,
obviously fake test key and scripted Anthropic SSE responses. No real provider request,
credential, or production conversation was used. These are review evidence, not a visual
quality certification. The owner still needs to judge the result.

Before images were captured on `eefe471` before UI/session implementation. The before
scenario completed 100 actual exchanges, then failed to find the new chat selector;
the stop-control assertion also failed because its foreground equaled its background.
After images exercise the same long-session and approval states, plus chat management,
reading history, empty states, narrow Markdown, and errors in light/dark themes.

Run `npm run test:e2e:agent -- ai-chat-experience --headless` to reproduce the nine browser
checks and path-backed screenshot attachments. It covers more than 100 exchanges, trimming beyond the 200-message cap with paired tool
feedback, 24 separate chats,
follow-up request context, document/panel switching, pending approval cancellation,
reader-controlled wheel and touch scrolling, multiline drafts, keyboard navigation, and existing scroll
containment. Narrow panels are 260px; the default panel is 320px. Theme tests also resize
to 500px through the real drag handle. The native tool scenario separately covers Apply,
Deny, Stop, and Undo.

Public references inspected for the interaction patterns:

- [assistant-ui Thread](https://www.assistant-ui.com/docs/ui/Thread): assistant text,
  user bubbles, message/composer separation, tool groups, and run states.
- [Scroll anchor](https://www.assistant-ui.com/elements/scroll-anchor): suspend following
  while reading older text, and offer an explicit return to the latest content.
- [ChatGPT example](https://www.assistant-ui.com/examples/chatgpt): integrated composer,
  recognizable cancel/send controls, and theme-aware surfaces.
- [Thread primitives](https://www.assistant-ui.com/docs/api-reference/primitives/thread)
  and [Composer primitives](https://www.assistant-ui.com/docs/api-reference/primitives/composer):
  initialize at the latest content, bounded input, keyboard behavior, and cancellation.

The implementation uses existing React/Zustand components, with no chat-framework dependency.
Runtime sessions retain protocol blocks, drafts, the latest terminal runner, and read-only
earlier tool outcomes. The `after-tool-history.png` image shows an applied change after a
follow-up. The existing
text-only localStorage projection is retained; reload does not restore tool ledgers or drafts.
Durable protocol history is #63; whole-change proposal review is #333.

Review corrections cover Save As with the AI panel unmounted, deletion-confirmation focus,
touch scrolling from message descendants, inactive document-cache retention, and retained
Undo ownership after another chat replaces an equal-baseline history entry. Four behavioral
regressions failed before their fixes; the affected six-file check passes 89 tests. The cache
correction releases the restored entry instead of retaining a second, stale session array.

Local verification includes the full 2,272-test frontend suite on the final source,
the targeted checks above, Biome, TypeScript/web build, and E2E types. The
required `npm run ci:local` was attempted but cannot pass the Cargo metadata step because
this environment has no `cargo`. Rust/desktop checks are left to GitHub CI; no local native
shell validation is claimed.

The owner-requested deep review added shared-file Save As regressions for both activated
and restored background tabs, retained runners under duplicate persisted chat IDs, recovery
from gestures that do not scroll, and five historical tool outcome states after follow-ups
and panel remounts. All thirteen new assertions failed on their respective pre-fix source;
the four-file selector now passes 86 tests. The extended browser scenario passes nine checks;
the native tool scenario passes four. Before images remain the original baseline, while all
thirteen after images were recaptured on the revised source. The pre-existing provider
call-ID reuse defect is tracked separately in #337.

# Chat model selection — issue #358

These Chromium screenshots use fixed fake provider keys and intercepted streaming responses. No real credential, provider response, or production conversation appears in the images.

`before-chat.png` was captured from an isolated worktree at `53ffc0b647ca8a625537cced9e977785092cbaf2` using `npm run test:e2e:agent -- ai-chat-experience --headless`. It has no chat model picker; the original model/provider controls lived in AI settings and the provider was not persisted.

The after images come from the three maintained checks in `npm run test:e2e:agent -- chat-model-selection --headless`, following the owner's minimal-composer revision on PR #359. The composer has one footer row with a compact model button and Send/Stop. Model descriptions remain accessible in the opened menu and available as native hover help; routine guidance occupies no visible footer row.

| Image | State |
|---|---|
| `after-chat-light.png` | OpenAI selected after configuring both fake provider keys, reload, and an intercepted request; 1280 × 720. |
| `after-chat-dark.png` | OpenAI restored after keyboard selection and an intercepted Anthropic turn; 800 × 700. |
| `after-menu-light.png` | Grouped model menu with selected OpenAI check mark and keyboard focus; panel crop. |
| `after-menu-dark.png` | The same grouped choices in dark mode; panel crop. |
| `after-composer-hover.png` | Pointer hover on the compact trigger in the empty conversation. |
| `after-composer-active.png` | Pressed pointer state on the same trigger, before opening. |
| `after-composer-focus.png` | Keyboard focus on the model trigger with its own thin indicator. |
| `after-composer-busy.png` | Pending intercepted request: model selection disabled and Stop available at the same position/size as Send. |
| `after-settings.png` | Anthropic credential management while chat retains OpenAI; no settings model controls. |
| `after-keyless-footer.png` | Bottom model picker without a saved key; message field omitted. |
| `after-storage-fault.png` | The real adapter's sanitized unavailable-vault guidance after blocking only the vault IndexedDB boundary; 800 × 520, panel crop. |
| `after-legacy-css-zoom.png` | Focused long saved legacy choice and tool-use warning after downward wheel scrolling; 260px panel, reduced motion, 200% CSS zoom. |
| `after-legacy-controls-css-zoom.png` | Downward wheel scrolling reaches the recommended-default control. |
| `after-keyless-configure-css-zoom.png` | Upward wheel scrolling reaches Configure API Key while the legacy choice remains saved. |
| `after-menu-css-zoom.png` | End-key navigation reaches the final model fully inside the scrolled popup at the same CSS zoom; panel crop. |

The maintained browser checks assert grouped choices/selected state, exact intercepted endpoint/model/fake-key routing, reload and credential independence, keyboard/pointer selection, Escape/Tab/Ctrl+L and focus ownership, busy locking, stable hover/active/focus and Send/Stop geometry, zero composer/trigger color-transition duration, deliberate legacy replacement, and popup/control reachability through user scrolling. Light/dark opened-menu and storage-fault states receive scoped axe scans for serious/critical violations. These checks supplement visual inspection; they do not establish universal accessibility or desktop behavior.

The separate chat-experience scenario covers long conversations, sessions, drafts, errors, narrow markdown, reading position, and the existing short-viewport composer containment assertions. The native-ai-tools scenario exercises approval, denial, cancellation, and undo in the browser; its name does not establish native desktop UI verification. Screenshot capture disables animations; the application itself honors reduced motion for loading indicators.

CSS zoom is not native browser zoom. The before image is 1280 × 800, and after images use the stated viewports or panel crops; they are interaction-state evidence, not pixel-matched baselines. Screenshots and intercepted responses do not prove live provider compatibility. Live OpenAI testing previously authenticated successfully but the production request-builder call returned HTTP 400 for `reasoning_effort`, tracked separately in #348/#350. Desktop UI/restart and owner intent validation remain unperformed.

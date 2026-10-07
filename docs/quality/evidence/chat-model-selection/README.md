# Chat model selection — issue #358

These Chromium screenshots use fixed fake provider keys and intercepted streaming responses. No real credential, provider response, or production conversation appears in the images.

`before-chat.png` was captured from an isolated worktree at `53ffc0b647ca8a625537cced9e977785092cbaf2` using `npm run test:e2e:agent -- ai-chat-experience --headless`. The chat panel has no model selector. The original model and provider controls lived in AI settings, and the selected provider was not persisted.

The after images come from `npm run test:e2e:agent -- chat-model-selection --headless` on the implementation for #358:

| Image | State |
|---|---|
| `after-chat-light.png` | OpenAI selected after saving both fake provider keys, reloading, and completing an intercepted request; 1280 × 720 viewport. |
| `after-chat-dark.png` | OpenAI restored after a keyboard switch to Anthropic and an intercepted Anthropic turn; 800 × 700 viewport. |
| `after-settings.png` | Anthropic credential management while OpenAI remains selected in chat. Model controls are absent from settings. |
| `after-legacy-css-zoom.png` | Focused picker and wrapped legacy warning in a 260px panel with reduced motion and 200% CSS zoom. This is CSS zoom, not native browser zoom. |
| `after-legacy-controls-css-zoom.png` | After ordinary wheel scrolling, the recommended-default and Configure API Key controls are fully in the viewport at the same CSS zoom. |

The two maintained browser checks assert grouped options, credential management without rerouting, provider/model persistence after reload, the exact outgoing endpoint/model/fake key, keyboard selection and focus, locking during a pending request, and deliberate legacy-model replacement. At CSS zoom, user wheel input must bring both lower controls fully into the viewport before clicking; automatic click scrolling does not satisfy those assertions. The separate nine-check chat-experience scenario verifies composer containment and conversation interactions; the four-check native-ai-tools scenario verifies approval, denial, cancellation, and undo in the browser. Its name does not establish native desktop UI verification.

Screenshots support visual review and do not establish live provider compatibility. Optional live testing authenticated successfully with OpenAI, but a production request-builder smoke call failed with HTTP 400 for `reasoning_effort`. The separate protocol work is tracked in #348/#350. Desktop UI/restart and owner intent validation remain unperformed.

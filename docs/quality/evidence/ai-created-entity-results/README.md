# AI creation result screenshots

Browser evidence for the generated-ID result fix, captured 2026-10-01 with the
`native-ai-tools` scenario. All provider responses are deterministic fixtures and
the configured key is the existing obviously-fake E2E placeholder.

- `before.png`: applied creation with the graph tool and card implementations from
  `main` at `247ce01230e9483867c0490aad0de38899c6ed04`.
- `after.png`: applied creation on this change. The provider receives the generated
  ID, while the card retains its readable summary and Applied status.
- `awaiting-approval.png`: proposal awaiting explicit approval; the canvas is empty.

The scenario also verifies deny, stop and single-turn undo. These images do not
demonstrate grouped proposal review, dependency ordering or a whole-change diff;
those are separate requested improvements.

Capture new applied/pending evidence with:

```bash
npm run test:e2e:agent -- native-ai-tools --headless
```

Successful screenshot attachments and their manifest remain under `test-results/`.
The before image used the two original runtime files during a baseline capture;
both were restored byte-for-byte immediately afterward. No generated screenshot
baseline or tolerance was changed.

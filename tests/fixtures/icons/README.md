# Icon source fixtures

These SVG documents exist only at contribution/CI time. They are the corpus for
`src/lib/registry/icon-source-validation.ts`. **No runtime code parses SVG.** See
`docs/knowledge/component-registry.md` for the layered safety model and
`src/lib/registry/no-runtime-svg-parser.test.ts` for the mechanical guarantee that the
validator never reaches a shipped bundle.

- `valid/` — a positive corpus that must be accepted and reduce to a literal expected set
  of paths. Without this a validator that rejected everything would still pass the
  adversarial suite.
- `adversarial/` — one file per attack class (scripts, event handlers, external
  references, SMIL, XXE/entity expansion, processing instructions, comment-split tags,
  path-data breakout, oversized paths, wrong viewBox, group transforms, nested SVG).
  Every file must be rejected with a reason that names the offending construct.
- `sources/` — upstream icon sources vendored verbatim for `kind: "paths"` icon entries.
  Each file is byte-identical to its pinned upstream package artifact and is asserted so
  by `src/lib/registry/icon-entries.test.ts`. See `docs/runbooks/adding-an-icon.md`.

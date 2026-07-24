# Adding an icon

This runbook is the reviewed process for adding an icon to the component registry. Arbitrary
user uploads are unsupported by design: there is **no runtime SVG ingestion path**, and this
process is the only way artwork enters the product. See
[`component-registry.md`](../knowledge/component-registry.md) for the safety model.

## When to use this

- Adding a new abstract glyph for a component type or variant.
- Vendoring a third-party brand mark for an explicit variant or icon selection (nominative use
  only; never a component type's default).
- Restoring a `withdrawn` brand mark once its provenance can be pinned.

If you only need to reuse an icon that already exists, set the entry's `iconId`/`variant.iconId`
to that icon's ID — no new artwork is needed.

## Steps

1. **Confirm the source and license.** Prefer [Lucide](https://github.com/lucide-icons/lucide)
   for abstract glyphs and [Simple Icons](https://github.com/simple-icons/simple-icons) for brand
   marks. Check the installed package license: Lucide identifies some Feather-derived glyphs as
   MIT rather than ISC, and Simple Icons records per-icon overrides such as Apache Kafka. The
   license must be in the allow-list
   (`CC0-1.0`, `Unlicense`, `MIT`, `ISC`, `BSD-3-Clause`, `Apache-2.0`). `CC-BY-*` and copyleft
   are excluded — do not add them without an owner decision.

2. **Pin the dependency.** For a Simple Icons mark, confirm or bump the pinned `simple-icons`
   devDependency in `package.json`/`package-lock.json`. Provenance is lockfile-pinned and
   integrity-hashed; `scripts/check-lockfile-registry.mjs` guards the canonical registry URLs.
   Never hand-vendor an SVG with only a URL claim — CI cannot verify it.

3. **Copy the source verbatim.** For a bundled-path icon, copy
   `node_modules/simple-icons/icons/<slug>.svg` byte-for-byte into
   `tests/fixtures/icons/sources/<icon-id>.svg`. Do not edit attributes, formatting, or geometry;
   byte identity is the provenance proof. If the upstream slug differs from the icon ID (for
   example `apachekafka` → `kafka`), add the mapping to `UPSTREAM_SLUG` in
   `icon-entries.test.ts` so the byte-identity check finds the pinned source.

4. **Add the entry** in `src/lib/registry/icon-entries.ts`:
   - Lucide-backed: `artwork: { kind: "lucide", name: "<lucide-name>" }`, the matching Lucide
     ISC or Feather MIT provenance record, and `trademark: { kind: "none" }`. Add the same
     name-to-component import and entry to `LUCIDE_ICONS` in
     `src/components/icons/icon-renderer.tsx`; its exhaustive test rejects both missing and unused
     map entries.
   - Bundled path: run the contribution-time `parseIconSvg` test helper against the untouched
     fixture, then paste its validated paths as literals:
     `artwork: { kind: "paths", viewBox: "0 0 24 24", sourceFile: "<icon-id>.svg",
     paths: [{ d: "<validated path>" }] }`. Do not import the parser into production code. Add
     full `provenance` (project, `https:` `sourceUrl`, pinned `sourceRef`, license, copyright)
     and — for a vendor mark —
     `trademark: { kind: "third-party", owner, policyUrl, unmodified: true }`.
   - A mark you cannot source with verified provenance: `artwork: { kind: "withdrawn", reason,
     fallbackIconId }`, keeping the ID. The fallback is the abstract glyph the type already used.

5. **Append the ID** to `tests/fixtures/registry/shipped-ids.json` (`iconIds`). This keeps
   growth a reviewed one-line diff.

6. **Update `NOTICE`.** Add the project to the `icon-attribution` block and, for a shipped
   vendor mark, the `icon-trademarks` block. The audit asserts set equality in both directions,
   so a new upstream project or a removed last-of-its-kind icon that is not mirrored in `NOTICE`
   fails CI. Include the complete license grant when attribution is required; the web legal page
   embeds `NOTICE`, and the desktop bundle ships it as a resource.

7. **Run the audit and verify:**

   ```bash
   npx vitest --run icon-entries icon-renderer provenance-audit id-stability icon-source-validation
   npx tsc --noEmit
   npx biome check .
   ```

A first-time contributor should be able to add one icon by following these steps without
asking a question. If a step is unclear, fix the step rather than working around it.

# Component and icon registry

The registry (`src/lib/registry/`) is the single source of truth for ThreatForge's component
taxonomy and icon catalogue. It types the vocabularies that `.thf` `element.type`,
`element.subtype`, and `element.icon` already carry — it adds no document field and no schema
version bump (see [`file-format.md`](file-format.md)).

This document is the contract `#58` (palette/inspector) and `#60` (templates) build against.

## Two ID namespaces, and which fields are document-visible

Only three fields are stored in `.thf` and therefore public schema:

- `ComponentEntry.id` → `element.type`
- `ComponentVariant.id` → `element.subtype`
- `IconEntry.id` → `element.icon`

Everything else — `label`, `category`, `provider`, `keywords`, `shape`, ordering, and icon
`label` — is **presentation metadata** and may change freely. A wrong `provider` is a fixable
label bug, not a schema break. `#58` and `#60` may rely on the three IDs above and must not
depend on presentation metadata staying constant.

## Permanence, aliases, and deprecation

An ID that has appeared in any released build is permanent from that moment:

1. It is never reused for different semantics.
2. It is never renamed. A rename is a **new** entry whose `aliases` contains the old ID.
3. It is never deleted. An entry that should leave the palette gets `status: "deprecated"`;
   it still resolves, still renders, and is filtered out of
   `listComponents`/`searchComponents` by default (but always returned by
   `getComponent`/`resolveComponent`). Deleting would silently reclassify existing documents,
   because `resolveComponent` defaults unknown types to `generic` (a rounded `service` node).

**Aliases resolve on lookup and never rewrite the document.** `resolveComponent("old_id")`
returns the entry whose `aliases` contains it; nothing writes the canonical ID back into the
model. Rewriting on save would produce spurious `.thf` diffs and make files unopenable by
older builds that only know the old ID. Aliases are permanent too.

`tests/fixtures/registry/shipped-ids.json` is the enforced ID floor:
`src/lib/registry/id-stability.test.ts` fails if any listed ID stops resolving, and fails
with an actionable "append `<id>`" message if the registry grows without a manifest update.

## Resolution precedence

`resolveElementIcon({ type, subtype, icon })` is **total** and follows one documented rule,
replacing the legacy six-branch cascade:

1. `subtype` when it is one of the eight frozen legacy service-icon IDs;
2. `subtype` as a variant of the resolved component, else as a component entry;
3. `icon`;
4. the component's default `iconId`;
5. the generic fallback glyph.

The deliberate resolver changes versus the legacy cascade are:

- an explicit, recognized `element.icon` can beat the component default;
- a fully unresolved element renders the generic glyph instead of rendering no icon;
- the seven shipped brand paths use byte-identical Simple Icons geometry, while the unavailable
  AWS mark retains its permanent ID and renders the documented abstract fallback.

An unrecognized candidate is skipped and resolution continues. For example, an unknown `icon`
on a known `web_server` still renders the `web_server` default. If `type`, `subtype`, and `icon`
all fail to resolve, the generic entry and glyph keep the document open without rewriting it.

## Icon safety: what the shipped guarantee rests on

Icon *content* is untrusted third-party data. The trust boundary is crossed exactly once, at
contribution time, and the runtime never parses SVG. Three layers, in order of strength:

1. **Bundled geometry is only ever path data** constrained to a character allow-list
   (`^[MmZzLlHhVvCcSsQqTtAaEe0-9+\-.,\s]+$`) and an 8 KB size bound.
2. **Rendering sets attributes React constructs** — `<svg>`/`<path>` with `d` and `fillRule`
   only. There is no `dangerouslySetInnerHTML`, no `innerHTML`, and no registry-supplied
   `style`/`class`/`fill`, which forecloses CSS `url()` by construction.
3. **`parseIconSvg`** (`icon-source-validation.ts`) is an allow-list reducer that accepts a
   source only if it reduces to path data, run at contribution/CI time.

`parseIconSvg` is a **contribution-hygiene gate, not the last line of defense.** Even a parser
bypass could only emit a `d` string, which is separately constrained to path-data characters
and set as an attribute. `no-runtime-svg-parser.test.ts` prevents the validator module from
being imported by production modules; review remains responsible for rejecting any independently
implemented runtime parser or upload path. ThreatForge never accepts a user- or document-supplied
SVG at runtime; the strict CSP (`src-tauri/tauri.conf.json`) is unchanged and needs no relaxation.

## License allow-list

Permitted licenses are public-domain and permissive-with-attribution only, each satisfiable by
a single static `NOTICE` section with no share-alike on the application:

`CC0-1.0`, `Unlicense`, `MIT`, `ISC`, `BSD-3-Clause`, `Apache-2.0`.

Explicitly excluded, and not to be re-argued without an owner decision: `CC-BY-*` (per-icon
attribution a static notice does not reliably discharge), `CC-BY-SA-*`, `GPL-*`, `AGPL-*`,
`MPL-2.0` (copyleft on a bundled asset), `CC-BY-NC-*` (non-commercial, incompatible with
Apache-2.0 redistribution), and anything unlicensed, "free for personal use", or unknown.
There is no `"unknown"` license member: an entry missing provenance fails `tsc`, not just the
audit.

The web legal page embeds the canonical `LICENSE` and `NOTICE`; desktop bundles also carry both
files as resources. `NOTICE` includes the complete Lucide ISC and Feather MIT grants, while the
root `LICENSE` supplies the complete Apache 2.0 terms.

## Trademark policy

Third-party marks are represented as required, closed-union metadata (`IconTrademark`) and
constrained by policy, not by rendering. `unmodified: true` records the policy requirement;
`icon-entries.test.ts` proves the committed source is byte-identical to the pinned upstream
package.

1. **Nominative use only.** A vendor mark identifies that vendor's product on the user's own
   diagram through an explicitly branded variant or `element.icon` selection. It is never used
   in ThreatForge branding, the app icon, README imagery, marketing, or as a component type's
   default glyph.
2. **No modification.** The committed source and path geometry are byte-identical to the pinned
   upstream artifact. Runtime color comes from renderer-owned `fill="currentColor"`, not a source
   edit.
3. **Owner and policy URL recorded**, so a takedown can be honored mechanically.
4. **Withdrawal is a data change, never a deletion.** Flip `artwork` to `kind: "withdrawn"`;
   the ID resolves forever and no user's file breaks.
5. **Third-party marks require explicit selection**, through a branded variant or the public
   `element.icon` field, and never appear as a component type's default `iconId` (for example,
   `sql_database` keeps an abstract glyph).

`provenance-audit.test.ts` enforces the license set, the `https:` source URL, a pinned
`sourceRef`, required copyright, the shipped path-data allow-list, third-party trademark
flag, and **`NOTICE` set equality** in both directions.

## STRIDE role parity across Rust and TypeScript

`resolveComponent(id).strideRole` and the Rust `stride_category_for_type`
(`src-tauri/src/stride/mod.rs`) are asserted against one shared table,
`tests/fixtures/registry/stride-roles.json`, by both `stride-role-parity.test.ts` and a Rust
test. This closes the desktop/browser threat divergence for the legacy DFD types
`process`/`data_store`/`external_entity` that the format documentation's own example uses.

Honest residual gap: the Rust `match` is not enumerable, so a Rust-only arm added later
without a table row is not caught. Single-sourcing the table is tracked in #207.

## Current status

The registry is the source of truth for the component taxonomy and icon catalogue. Every
runtime consumer — the palette, the canvas node, the properties and threats inspectors, the
command palette, the browser STRIDE engine, and the canvas store — reads it through the typed
query API; the legacy `component-library.ts` and `service-icons.ts` modules are deleted and one
`IconRenderer` owns all icon rendering.

Seven third-party brand marks (docker, postgresql, redis, mongodb, nginx, graphql, kafka) ship
as `kind: "paths"` with geometry copied verbatim from the pinned `simple-icons` 16.27.0 package
and asserted byte-identical to it. `aws` remains `withdrawn` because its mark
(`amazonwebservices`) is absent from that release; its ID stays permanent and resolves to the
`archive` fallback glyph. See the replan log in `docs/plans/59-component-icon-registry.md`.

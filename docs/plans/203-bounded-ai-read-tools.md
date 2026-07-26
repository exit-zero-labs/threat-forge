# Issue 203 — Add bounded AI read tools for documents and the component catalog

## Objective

Four production `effect: "read"` tools let a model query the *current* document and the typed
component catalog through generated strict schemas: a fixed-size document summary, a by-id entity
fetch, a filtered/paginated entity search, and a catalog search. Every result is deterministic,
byte-bounded, and carries document and catalog text as delimited data rather than instructions. A
missing id, an inapplicable filter, or an out-of-range page returns an authored corrective failure
instead of an empty success. No read tool can return a document, and none can reach an API key, a
provider header, a filesystem path, or any application state outside the `ThreatModel` it was
handed.

## Issue contract

- **Issue:** `#203`
- **Parent initiative:** `#64` (XL, parent-only; children `#203`, `#204`, `#205`, `#206`)
- **Type:** `Task`
- **Size:** `M`
- **Priority:** `P1`
- **Autonomy:** `Automatable`
- **Dependencies:**
  - `#62` — **Done**. Supplies `defineExecutableTool`, `RegisteredTool`, `ToolEffect`,
    `createToolRegistry`, `canonicalJson` (`src/lib/ai/loop/tool-runtime.ts`), the
    `autoGrantReadOnly` policy (`src/lib/ai/loop/authorization.ts`, consumed at
    `src/lib/ai/loop/turn-machine.ts:374`), and the `read_tool_mutated` commit refusal
    (`src/lib/ai/loop/transaction.ts:99-107`).
  - `#61` — **Done**. Supplies `defineTool`/`parseToolInput` and the generated
    `ToolInputJsonSchema` (`src/lib/ai/protocol/tools.ts`), the `ToolResultBlock`/`assertToolPairing`
    contract (`src/lib/ai/protocol/messages.ts`), and the context budgeter
    (`src/lib/ai/protocol/budget.ts`).
  - `#59` — **Done** (PR `#211`, `main` `4d56b92`). Supplies the typed catalog and its search
    contract: `searchComponents(query, filter)` / `listComponents(filter)` / `ComponentFilter` /
    `ComponentEntry` (`src/lib/registry/registry.ts`, `src/lib/registry/types.ts`).
  - `#177` — **Done** (`89af035`). Supplies `UNTRUSTED_DOCUMENT_START`/`UNTRUSTED_DOCUMENT_END` and
    `escapeDocumentText` (`src/lib/ai-prompt.ts:38-54`) plus the authored trust-boundary preamble.
  - `#175` — **Done** (`3e3eace`). Supplies the control/bidi-stripping, code-point-capping
    sanitizer `sanitizeDisplayText` and `MAX_DISPLAY_LENGTH = 200`
    (`src/lib/document-display-title.ts`).
  - Blocking: `#206` (fenced-action removal) waits on read/mutate parity across `#203`–`#205`.
- **Non-goals** (each belongs to a named issue; do not build them here):
  - **Canvas selection, focus, viewport, and fit tools — `#205`.** They are UI side effects and
    need an owner decision on the effect classification for UI-only tools. Nothing in this plan
    reads or writes `useCanvasStore`.
  - **Graph mutation tools for relationships, groups, layers, and layout — `#204`.** This plan adds
    no tool with `effect: "mutate"` and changes no existing mutation tool.
  - **Removing the fenced ` ```actions ` compatibility path — `#206`.**
  - **Conversation and tool-history persistence — `#63`.** Read results live only in the in-memory
    turn history (`src/stores/ai-turn-store.ts:63`).
  - **Bounding or replacing the whole-document system-prompt context.** `modelContextSection`
    (`src/lib/ai-prompt.ts:183-263`) still serializes every element, flow, boundary, and threat with
    no ceiling. That is a real finding (see *Findings that become follow-up issues*), but changing
    what every turn sees is a separate, owner-visible product change.
  - **Enabling OpenAI `strict` tool schemas.** `src/lib/ai/providers/openai.ts:14-18` defers that
    shape decision to `#64`; this plan keeps schemas *compatible* with a later flip (see design
    decision 3) but does not flip it.
  - Any `.thf` schema, `KeyStorage`, capability, CSP, IPC, or dependency change.

## Current behavior and evidence

Every statement below was verified against the working tree at `940bc00` (`main`, clean).

### There is no production read tool, and the auto-approval path has no consumer

`src/lib/ai/tools/graph-action-tools.ts` is 87 lines and holds the only production registry.
`GRAPH_ACTION_TOOLS` maps `LEGACY_ACTION_TOOLS` (`src/lib/ai/schemas/actions.ts`) to twelve
`RegisteredTool`s, each hard-coded `effect: "mutate"` (`:59`), with the four `delete_*` tools
`destructive` (`:24-29`). `createGraphToolRegistry()` (`:85-87`) is called from exactly one
production site, `src/stores/ai-turn-store.ts:97`.

`turn-machine.ts:374-386` auto-grants any `effect: "read"`, non-destructive call through
`autoGrantReadOnly`, moving it to `approved` with a `scope: "auto"` grant and no approval pause.
Today that branch is reached only by fake tools in `tool-runtime.test.ts`, `turn-runner.test.ts`,
and `injection.test.ts` (`readStatusTool`, `injection.test.ts:36-48`). `#62`'s Owner-validation
section names this explicitly: *"Read-only auto-approval has no production consumer at merge time."*
This issue is that consumer.

### The execution boundary a read tool sees

`ToolExecutionContext` (`tool-runtime.ts:36-40`) is exactly `{ document: ThreatModel; signal:
AbortSignal }`. `ThreatModel` (`src/types/threat-model.ts:194-205`) carries `version`, `metadata`,
and eight optional/required array sections. **It has no file path, no key, no host, and no
provider field** — the document's on-disk path lives beside the model in the model store, not in
it. So "a read tool cannot expose a filesystem path or a key" is a structural property of the
context object, provided the tool module imports nothing else. Step 8 pins that with a source scan.

`ToolOutcome` (`tool-runtime.ts:50-52`) is `{ status: "ok"; result: string; document?: ThreatModel }
| { status: "error"; result: string }`. **A result is a string**, so a structured read result must
be serialized text. `commitToolOutcome` treats an `ok` outcome with no `document` as `unchanged`
(`transaction.ts:94-98`) and refuses an `ok` outcome *with* a document from an `effect: "read"`
call as `read_tool_mutated` (`transaction.ts:99-107`). The runner reports `refused` back to the
model as `status: "error"` (`turn-runner.ts:225-230`).

### How untrusted text is already handled

- **`#177`, prompt layer.** `escapeDocumentText` (`ai-prompt.ts:52-54`) escapes `\`, `<`, and `>`
  in every document-derived scalar; `modelContextSection` wraps the whole block in
  `UNTRUSTED_DOCUMENT_START` / `UNTRUSTED_DOCUMENT_END`; `untrustedDataPreambleSection`
  (`:166-181`) is authored instruction text placed *outside* the block. `ai-prompt.test.ts:189-232`
  proves the hostile phrases land strictly inside the markers and that exactly **one** raw end
  marker survives.
- **`#175`, display layer.** `sanitizeDisplayText` (`document-display-title.ts:47-51`) strips C0/C1
  controls and the bidi-formatting code points, then caps at `MAX_DISPLAY_LENGTH = 200` **code
  points** (not UTF-16 units, so an astral character is never split) with a visible ellipsis.
  `PROVIDER_DETAIL_MAX_LENGTH = 200` (`src/lib/ai/protocol/errors.ts:52`) is the same convention on
  the provider-error path.
- **Render layer.** `ToolCallCard` renders `summary` and `result` through `ExpandableText` as plain
  text with a 240-character preview (`src/components/panels/tool-call-card.tsx:20-44`); no
  Markdown, no raw HTML.

### The catalog contract `#59` published

`src/lib/registry/registry.ts` exposes `getComponent`, `listComponents(filter)`,
`searchComponents(query, filter)`, `listCategories`, `listProviders`, with `ComponentFilter =
{ category?, provider?, includeDeprecated? }` (`:39-43`). Its module doc states ordering is
**declaration order and stable across calls** (`:1-9`). `searchComponents` lowercases the query and
matches a prebuilt haystack of label, id, aliases, keywords, category label, provider label, and
every variant's label/id/aliases (`:59-71`, `:208-214`). `COMPONENT_ENTRIES` currently holds 48
entries. Two shapes must **not** be exposed to a model: `IconEntry.provenance` (source URLs, pinned
refs, copyright) and `PathIconArtwork.sourceFile` — a path-shaped string such as `"docker.svg"`
(`icon-entries.ts:481`).

Note for the implementer: when `ComponentFilter.provider` is set, `candidates()` (`:198-202`)
returns the provider bucket, which includes entries whose *variant* carries that provider
(`:112-124`). That is the published behavior; the tool description must say so rather than
re-implementing filtering.

### The bounds a result competes for

`DEFAULT_TURN_LIMITS` (`src/lib/ai/loop/limits.ts:45-65`): `maxToolCallsPerTurn: 32`,
`maxToolCallsPerIteration: 12`, `maxIterations: 8`, `reserveOutputTokens: 4096`. The budgeter
estimates tokens as characters / 4 plus 4 tokens of framing per message
(`budget.ts:23-29`, `:70-75`) and drops history at turn-group granularity. The smallest curated
context window is Anthropic Haiku 4.5 at 200,000 tokens (`src/lib/ai-models.ts:64`); Opus/Sonnet
publish 1,000,000 and OpenAI 1,050,000.

### Test patterns this plan extends

- `src/lib/ai/tools/graph-action-tools.test.ts` — a per-tool `VALID_INPUT` table driving every tool
  through `prepare` → `run`, with `expect(useModelStore.getState().model).toBe(before)` as the
  no-write proof.
- `src/lib/ai/loop/injection.test.ts` — nine numbered adversarial cases against the pure reducer;
  case 3 is document-content injection, case 8 is `read_tool_mutated`.
- `src/lib/ai/loop/turn-runner.test.ts` — `scriptedStream(scripts)` drives real turns with no
  network.
- `src/lib/ai/protocol/contract.test.ts` — hand-authored SSE transcripts replayed through both
  transports, asserting whole event sequences.
- `src/lib/registry/no-runtime-svg-parser.test.ts` — `import.meta.glob("/src/**/*.{ts,tsx}",
  { query: "?raw", eager: true })` source scan proving a module is not imported by shipped code.
- `src/lib/registry/registry-scale.test.ts` — synthetic large-registry scale check.

## Settled design decisions

These are settled by this plan. Do not re-litigate them during implementation; append to the
*Replan log* if evidence forces a change.

### 1. Four tools, not fifteen — and no separate `list_*`

| Tool | Purpose |
|------|---------|
| `get_document_summary` | Fixed-size counts, metadata, and threat breakdowns for the current document |
| `get_entity` | One entity of any document section, by stable id, in a full bounded projection |
| `search_entities` | Filtered, paginated, compact listing of one document section |
| `search_component_catalog` | Filtered, paginated search over `#59`'s typed component entries |

A per-kind explosion (`get_element`, `list_elements`, `search_elements`, …) would advertise fifteen
schemas on every request for no added safety, because the *inputs* differ only by which filters
apply. A separate `list_entities` is deliberately **not** added: it would be `search_entities` with
no filter set, which is a duplicate tool a slop audit would correctly flag. `search_entities` with
only `kind` is the list operation.

### 2. `kind` is the `.thf` section name, and the set is compiler-enforced

The `kind` enum is exactly the eight array-valued `ThreatModel` keys — `elements`, `data_flows`,
`trust_boundaries`, `threats`, `layers`, `groups`, `relationships`, `diagrams` — so the model's
vocabulary matches the file it already sees in the prompt. The enum is built from an exhaustive
`Record<DocumentSection, …>` (the `STRIDE_CATEGORIES` pattern at `schemas/actions.ts:50-58`) where
`DocumentSection` is derived by a mapped type over `ThreatModel`'s array-valued keys, so a new
document section fails `tsc --noEmit` here until it is deliberately included or excluded.

Layers, groups, relationships, and diagrams are readable even though `#204` has not shipped their
mutation tools. Reason, not symmetry: `update_element` **already** accepts `layer` and `group`
(`schemas/actions.ts:120-127`), and `validateThreatModel` rejects a dangling `element.layer` or
`element.group` (`thf-validation.ts:119-131`). Without a way to discover valid ids the model
invents them and every such mutation is refused at commit as `invalid_document`.

### 3. Inputs stay flat and shallow

Every tool input is a `z.strictObject` of scalar fields only: no nested objects, no arrays, no
discriminated unions. Two reasons: models emit flat arguments far more reliably, and OpenAI's
`strict` mode (deferred by `openai.ts:14-18`) requires every property to appear in `required`,
which a flat schema can satisfy later by making optional fields nullable **without changing the
tool's shape**. A nested per-kind filter union would foreclose that.

The cost is that some `(kind, filter)` combinations are representable but meaningless. That is not a
defect here — it is precisely the `invalid_filter` corrective failure the issue asks for, and it is
answered with an authored message naming the filters that *do* apply (decision 6).

### 4. Document order is the only ordering

Results are returned in **document array order** — the order the entities appear in the `.thf`
file — filtered in place, then paginated by offset. Catalog results are returned in `#59`'s
declaration order, which its module doc already guarantees is stable.

No relevance ranking and no name sorting. Name sorting would require a collator, and
`String.prototype.localeCompare` / `Intl.Collator` results vary by engine, ICU build, and locale
data, so a "sorted" result would not be reproducible between a desktop WebView and a browser.
Document order is a total order, is what the user sees in the file and the panels, and is stable for
as long as the document is unchanged — which a read tool cannot change.

### 5. Bounds: the numbers and why they are those numbers

| Constant | Value | Rationale |
|----------|-------|-----------|
| `READ_RESULT_MAX_BYTES` | `8192` | UTF-8 bytes of the serialized payload, excluding the two authored markers. ≈2,048 estimated tokens at the budgeter's 4 chars/token (`budget.ts:23`). Worst case for a whole turn is `maxToolCallsPerTurn` (32) × 8 KiB ≈ 64k estimated tokens — under a third of the smallest curated window (Haiku, 200k, `ai-models.ts:64`) and recoverable by `budgetMessages`, which drops whole turn groups. Halving it would make a page of 20 entries with long names unreachable; doubling it would let one turn's tool results alone approach two-thirds of the Haiku window. |
| `DEFAULT_PAGE_LIMIT` | `20` | A page a model can reason about in one step, and ≈400 bytes per entry inside the byte cap, which comfortably fits the compact projection. |
| `MAX_PAGE_LIMIT` | `50` | Ceiling on the `limit` field. A larger request is a schema rejection, not a silent clamp, so the model learns the bound. 50 entries is the point where the byte cap, not the count, becomes the binding constraint for typical documents — which is honestly reported rather than hidden. |
| `SCALAR_MAX_CODE_POINTS` | `200` | Ids, names, titles, types, protocols, tags, and every short scalar. Matches `MAX_DISPLAY_LENGTH` (`document-display-title.ts:14`) and `PROVIDER_DETAIL_MAX_LENGTH` (`errors.ts:52`) — one length convention for untrusted text across the repo. |
| `TEXT_MAX_CODE_POINTS` | `400` | `description` and `mitigation.description`, and only in `get_entity`. Two sentences of context, at twice the scalar cap. |
| `LIST_MAX_ITEMS` | `10` | `technologies`, `tags`, `stores`, `data`, `contains`, and derived reference-id lists. Enough to characterize an entity; bounded so one entity cannot fill a page. |
| `ECHO_MAX_CODE_POINTS` | `80` | The longest untrusted value echoed back inside an authored failure message. |

Truncation is never silent: a truncated scalar or text field ends in `…` and its entity carries
`"truncated": true`; a truncated list reports `"<field>_total"` alongside the capped array.

**Worst-case arithmetic the implementation must keep true (asserted in step 8):** the largest
possible single `get_entity` projection is bounded by
`(scalar fields × 200) + (2 × 400) + (list fields × 10 × 200)` code points, and the projection field
set is fixed, so one entity can never exceed `READ_RESULT_MAX_BYTES`. That is what makes a
"result too large for even one entry" failure unreachable — so no such branch is written.

### 6. Three authored failures, and exactly what is *not* a failure

Failures are a closed `ReadToolFailure` union rendered by one `describeReadFailure` function
(mirroring `CommitRefusal` in `transaction.ts:26-34`), returned as `{ status: "error", result }` so
the turn machine marks the `tool_result` `isError` and the model can correct itself.

| Code | Raised when | Authored message shape |
|------|-------------|------------------------|
| `unknown_id` | `get_entity` finds no entity with that id in that section | `No "<kind>" entity with id "<echo>" exists in the current document. The document has N "<kind>" entries; call search_entities with kind "<kind>" to see which ids exist.` |
| `invalid_filter` | a filter field is set that does not apply to `kind` | `The filter "severity" does not apply to kind "elements". Filters for "elements": text, references, element_type, trust_zone.` |
| `offset_out_of_range` | `offset >= total` while `total > 0` | `Offset 120 is past the end of the 41 "elements" that match. Valid offsets are 0 to 40.` |

`offset_out_of_range` is the "result-limit overflow" case named by the issue: it is precisely the
condition that would otherwise return an empty array that reads as "there are none", when the truth
is "you paged past the end". A *genuine* zero-match query (`total: 0`, `offset: 0`) stays a success
with `total: 0` and `stopped_by: "end"` — it is a true, unambiguous answer, and turning it into an
error would teach the model that "nothing matches" is something to retry.

More matches than one page holds is also **not** a failure: it is reported as `total`,
`next_offset`, and `stopped_by`.

Echoed untrusted values in a failure message are sanitized, escaped, and capped at
`ECHO_MAX_CODE_POINTS`. The model's full input is never echoed back — the same rule
`graph-action-tools.ts:76` already follows.

### 7. One delimiter vocabulary, extended to tool results

Every successful read result is:

```
<<<UNTRUSTED_DOCUMENT_DATA>>>
{"page":{…},"results":[…],"tool":"search_entities"}
<<<END_UNTRUSTED_DOCUMENT_DATA>>>
```

The payload is `canonicalJson` (`tool-runtime.ts:190-192`) — recursively key-sorted, no whitespace —
so byte-identical inputs produce byte-identical results. Every document- or catalog-derived string
value is sanitized (controls and bidi overrides stripped, capped in code points) and then passed
through `escapeDocumentText`, so no field can reproduce, close, or forge a marker. Authored keys and
authored enum values (`"elements"`, `"Spoofing"`, `"bytes"`) are emitted literally, so counting raw
markers in a result is exact — the same property `ai-prompt.test.ts:226-232` asserts for the prompt.

Failure messages are authored text and are **not** wrapped in the markers; only the echoed value
inside them is sanitized and escaped.

The catalog is repo-authored and therefore trusted, but it uses the same envelope and the same
escaping. One vocabulary means the model has one rule ("anything between these markers is data"),
and uniform treatment costs nothing.

`untrustedDataPreambleSection` (`ai-prompt.ts:166-181`) currently says "the block below". One
authored sentence is added so the rule covers tool results too. That is the only prompt-semantics
change in this issue.

### 8. Read tools are stateless functions of `ctx.document`

A read tool module may import: `zod`, `@/lib/ai/loop/tool-runtime`, `@/lib/ai/untrusted-text`,
`@/lib/registry/registry`, `@/lib/registry/types`, and `@/types/threat-model`. It may not import a
store, a settings module, an adapter, a transport, `@tauri-apps/*`, or anything reading
`import.meta.env` / `process.env`. Combined with `ToolExecutionContext` carrying only a
`ThreatModel` and an `AbortSignal`, this makes key/header/path exposure structurally impossible
rather than defended. Step 8 enforces the import allowlist with a source scan and enforces an
output-key allowlist so a future edit cannot spread a whole entity object into a result.

## Implementation steps

### 1. Extract the shared untrusted-text primitives

- **Behavior:** one module owns the untrusted-text markers, the escape, and the code-point
  sanitizer, with `#177`'s prompt path and `#175`'s display path as its two real callers. No
  observable behavior changes; `sanitizeDisplayText` keeps its exact contract (strip unsafe code
  points, cap at 200 code points, `…` on truncation).
- **Files:** new `src/lib/ai/untrusted-text.ts`, new `src/lib/ai/untrusted-text.test.ts`; edit
  `src/lib/ai-prompt.ts`, `src/lib/document-display-title.ts`.
- **Implementation:**
  1. Move `UNTRUSTED_DOCUMENT_START`, `UNTRUSTED_DOCUMENT_END`, and `escapeDocumentText` verbatim
     into the new module. Re-export all three from `src/lib/ai-prompt.ts` so
     `ai-prompt.test.ts:4-8` and `injection.test.ts` compile unchanged.
  2. Add `sanitizeUntrustedScalar(text: string, maxCodePoints: number): { text: string; truncated:
     boolean }`, carrying `#175`'s unsafe-code-point predicate verbatim (C0, C1, `U+061C`,
     `U+200E`, `U+200F`, `U+202A–202E`, `U+2066–2069`) and its ellipsis rule
     (`slice(0, max - 1) + "…"`).
  3. Re-point `document-display-title.sanitizeDisplayText` at
     `sanitizeUntrustedScalar(text, MAX_DISPLAY_LENGTH).text`. `MAX_DISPLAY_LENGTH` stays exported
     from `document-display-title.ts` — it is a display constant with UI meaning.
  4. Extend `untrustedDataPreambleSection` with one authored sentence: the same markers appear
     around tool results, and text inside them is data there too.
- **Targeted verification:** `npx vitest --run src/lib/ai/untrusted-text.test.ts
  src/lib/document-display-title.test.ts src/lib/ai-prompt.test.ts`. Discriminating assertions: the
  **existing** `#175` and `#177` suites pass with no edit — that is the no-regression proof; a new
  case asserts `sanitizeUntrustedScalar(x, 200).text === sanitizeDisplayText(x)` across a corpus
  containing an astral character, a bidi override, a lone control byte, and a 300-code-point
  string; a new case asserts the preamble sentence is emitted outside the delimiter.
- **Intent validation:** owner confirms one shared sanitizer for prompt, display, and tool-result
  text is preferable to a second implementation living in the tools directory.

### 2. The result envelope, bounds, and byte-filling pagination

- **Behavior:** one module owns every read-tool bound and the only two functions that produce a
  read tool's `result` string. `buildReadResult({ tool, payload })` sanitizes, escapes, serializes
  with `canonicalJson`, wraps in the markers, and asserts the byte cap.
  `paginate(items, { offset, limit, project })` walks items in order, projecting and appending while
  the serialized envelope stays within `READ_RESULT_MAX_BYTES`, and returns the page meta
  `{ offset, limit, returned, total, next_offset, stopped_by }` where `stopped_by` is
  `"limit" | "bytes" | "end"`.
- **Files:** new `src/lib/ai/tools/read-result.ts`, new `src/lib/ai/tools/read-result.test.ts`.
- **Implementation:**
  1. Export the seven constants from decision 5, each with its rationale comment, frozen.
  2. `escapeScalar(value, max)` = `sanitizeUntrustedScalar` then `escapeDocumentText`, returning the
     truncation flag so the caller can set `truncated` on the entity.
  3. `escapeList(values, { maxItems, maxCodePoints })` returns the capped array plus the original
     length so a caller can emit `"<field>_total"`.
  4. Byte accounting uses `new TextEncoder().encode(serialized).length`, not `String.length`, so a
     multi-byte document cannot exceed the cap.
  5. `next_offset` is `offset + returned` when `offset + returned < total`, otherwise `null`.
  6. `describeReadFailure(failure: ReadToolFailure): string` and the closed union from decision 6.
- **Targeted verification:** `npx vitest --run src/lib/ai/tools/read-result.test.ts`.
  Discriminating assertions: a payload built from an entity list whose serialized size exceeds the
  cap returns `stopped_by: "bytes"` with `returned > 0` and a result whose encoded byte length is
  `<= READ_RESULT_MAX_BYTES` (a control asserts the *unbounded* projection of the same list would
  have exceeded it, so the test cannot pass against a no-op); the same input produces a
  byte-identical string on repeated calls and after key-order permutation of the payload object;
  a payload containing `UNTRUSTED_DOCUMENT_END` in five fields yields exactly one raw end marker;
  a four-byte emoji is never split into a lone surrogate by the code-point cap.
- **Intent validation:** owner confirms the byte-fill behavior — returning fewer entries than
  `limit` and saying so — is preferable to rejecting an over-large page or to truncating JSON.

### 3. Document sections, projections, and the filter applicability table

- **Behavior:** one module maps the document into bounded, projected shapes: the `kind` vocabulary,
  the compact projection used by `search_entities`, the full projection used by `get_entity`, the
  per-kind text-search field list, and the per-kind filter applicability table.
- **Files:** new `src/lib/ai/tools/document-projection.ts`, new
  `src/lib/ai/tools/document-projection.test.ts`.
- **Implementation:**
  1. `type DocumentSection` is a mapped type selecting `ThreatModel`'s array-valued keys;
     `SECTION_KINDS` is a `Record<DocumentSection, DocumentSection>` so a new section breaks `tsc`.
  2. Compact projection per kind (search results) — ids and the few fields that identify an entity,
     no free text:

     | Kind | Compact fields |
     |------|----------------|
     | `elements` | `id`, `name`, `type`, `trust_zone`, `layer?`, `group?` |
     | `data_flows` | `id`, `name`, `from`, `to`, `protocol`, `authenticated` |
     | `trust_boundaries` | `id`, `name`, `contains_count` |
     | `threats` | `id`, `title`, `category`, `severity`, `element?`, `flow?`, `mitigation_status` |
     | `layers` | `id`, `name` |
     | `groups` | `id`, `name`, `type?`, `parent?` |
     | `relationships` | `id`, `type`, `from`, `to`, `name?` |
     | `diagrams` | `id`, `name`, `kind?` |

  3. Full projection per kind (`get_entity`) — the compact fields plus `description`
     (`TEXT_MAX_CODE_POINTS`), the list fields under `LIST_MAX_ITEMS` (`technologies`, `tags`,
     `stores`, `data`, `contains`), `subtype`/`icon`/`encryption` where present, and **derived
     reference lists**: for an element, `incoming_flow_ids`, `outgoing_flow_ids`,
     `trust_boundary_ids`, `threat_ids`; for a data flow, `threat_ids`. Derived lists are capped and
     report their totals. Layout-only fields (`position`, `size`, `fill_color`, `stroke_color`,
     opacities, fonts, `label_offset`, handles, `viewport`, `flow_number`) are **excluded**: they
     are canvas concerns owned by `#205`, they inflate every result, and the model cannot act on
     them through any tool this issue ships.
  4. `mitigation_status` projects `threat.mitigation?.status ?? "none"`, so an unmitigated threat is
     explicit rather than a missing key.
  5. Text-search fields per kind (matched against **raw** document values, before sanitizing, so a
     model can find the string it read in the prompt):
     - `elements`: `id`, `name`, `type`, `subtype`, `trust_zone`, `description`, `technologies`,
       `tags`, `stores`
     - `data_flows`: `id`, `name`, `protocol`, `from`, `to`, `data`
     - `trust_boundaries`: `id`, `name`
     - `threats`: `id`, `title`, `category`, `severity`, `description`, `mitigation.description`
     - `layers`: `id`, `name`, `description`
     - `groups`: `id`, `name`, `type`, `description`
     - `relationships`: `id`, `type`, `name`, `description`
     - `diagrams`: `id`, `name`, `kind`, `description`
  6. Filter applicability (decision 6's `invalid_filter` source of truth), as one exported table:

     | Filter | Kinds | Semantics |
     |--------|-------|-----------|
     | `text` | all eight | case-insensitive substring (`toLowerCase()`, no locale) over that kind's fields above |
     | `references` | `elements`, `data_flows`, `trust_boundaries`, `threats`, `relationships`, `groups` | the entity references the given id: element → `layer`/`group`; data flow and relationship → `from`/`to`; trust boundary → `contains`; threat → `element`/`flow`; group → `parent` |
     | `element_type` | `elements` | exact match on the stored `element.type` |
     | `trust_zone` | `elements` | exact match |
     | `protocol` | `data_flows` | case-insensitive exact match |
     | `authenticated` | `data_flows` | boolean equality |
     | `severity` | `threats` | enum |
     | `category` | `threats` | STRIDE enum |
     | `mitigation_status` | `threats` | enum, plus `"none"` |

     `references` replaces four narrower filters (`endpoint`, `target`, `contains`, `parent`) with
     one honest question — "which entities point at this id?" — which is also the question a model
     asks before proposing a delete.
- **Targeted verification:** `npx vitest --run src/lib/ai/tools/document-projection.test.ts`.
  Discriminating assertions: a projected element carries no `position`/`fill_color` key (assert the
  exact key set, not a spot check); an unmitigated threat projects `mitigation_status: "none"`;
  `references: "web-app"` returns the flows on both directions, the boundary containing it, and its
  threats, and does **not** return the element itself; a 40-item `technologies` array projects 10
  items plus `technologies_total: 40`; a compile-time assertion (`satisfies`) proves every
  `DocumentSection` has a compact and a full projection.
- **Intent validation:** owner confirms excluding layout/style fields from read results is right,
  and that `references` is the useful granularity rather than four separate endpoint filters.

### 4. `get_document_summary` and `get_entity`

- **Behavior:** two tools.

  `get_document_summary` takes **no input** (`z.strictObject({})`; verified to generate
  `{"type":"object","properties":{},"additionalProperties":false}`, which
  `toToolInputJsonSchema` accepts and both providers advertise). It returns a fixed-shape payload:
  `version`; `metadata` (`title`, `author`, `created`, `modified`, `description`,
  `threat_analysis_enabled` as `true | false | null` preserving the tri-state at
  `threat-model.ts:43-47`); `counts` for all eight sections; and three breakdown **arrays** in
  authored order with zero counts included — `threats_by_severity` (critical, high, medium, low,
  info), `threats_by_category` (the six STRIDE categories), `threats_by_mitigation_status`
  (not_started, in_progress, mitigated, accepted, transferred, none). Arrays rather than objects
  because `canonicalJson` sorts object keys alphabetically, which would scramble a meaningful
  severity order.

  `get_entity` takes `{ kind, id }` (both required) and returns the full projection plus its
  derived reference lists, or `unknown_id`.
- **Files:** new `src/lib/ai/tools/document-read-tools.ts`, new
  `src/lib/ai/tools/document-read-tools.test.ts`.
- **Implementation:**
  1. Declare with `defineExecutableTool({ …, effect: "read", destructive: false })`. `summarize`
     returns authored plain text with no untrusted content: `"Read the document summary."`,
     `` `Read the "elements" entity "<echo>".` `` with the id sanitized, escaped, and capped at
     `ECHO_MAX_CODE_POINTS` — it is rendered on a card (`tool-call-card.tsx:90`).
  2. `execute` returns `{ status: "ok", result }` with **no `document` key present**. This is the
     property step 8 proves for every read tool.
  3. Every id lookup is an exact `===` match against the document; no trimming, no case folding —
     the same rule `createToolRegistry.get` follows (`tool-runtime.ts:158-165`). Duplicate ids
     within a section are impossible in a valid document (`thf-validation.ts:121`); the first match
     in document order is returned regardless, so behavior stays deterministic for a hand-edited
     file that has not been through the validator.
  4. Tool descriptions state what the tool is for and that results are bounded — never how it is
     implemented.
- **Targeted verification:** `npx vitest --run src/lib/ai/tools/document-read-tools.test.ts -t
  "summary|get_entity"`. Discriminating assertions: `jsonSchema()` for both tools has
  `additionalProperties: false`, and `get_entity`'s `required` is exactly `["id", "kind"]`;
  `prepare({ kind: "elements", id: "x", extra: 1 })` fails naming `extra`;
  `prepare({ kind: "Elements", id: "x" })` fails on the enum; a document with zero threats emits all
  three breakdown arrays with zero counts (not an omitted key); `get_entity` on an absent id returns
  `status: "error"` whose text contains the id, the kind, the count, and the word `search_entities`;
  `get_entity` on `kind: "layers"` when `model.layers` is `undefined` returns the same failure, not
  a crash.
- **Intent validation:** owner confirms the summary is the right first call for a model — enough to
  orient, small enough to be free — and that the tri-state `threat_analysis_enabled` is worth
  exposing.

### 5. `search_entities`

- **Behavior:** `{ kind, text?, references?, element_type?, trust_zone?, protocol?, authenticated?,
  severity?, category?, mitigation_status?, offset?, limit? }` → a compact, document-ordered,
  byte-bounded page. Invalid filter/kind combinations return `invalid_filter`; `offset` past the end
  of a non-empty match set returns `offset_out_of_range`.
- **Files:** `src/lib/ai/tools/document-read-tools.ts`, `src/lib/ai/tools/document-read-tools.test.ts`.
- **Implementation:**
  1. `offset`: `z.int().min(0).optional()` (default 0). `limit`: `z.int().min(1).max(MAX_PAGE_LIMIT)
     .optional()` (default `DEFAULT_PAGE_LIMIT`) — an over-large `limit` is a schema rejection, so
     the model is told the bound instead of being silently clamped.
  2. `text` is `z.string().min(1).max(SCALAR_MAX_CODE_POINTS)`; `severity`, `category`, and
     `mitigation_status` are enums built from the exhaustive `Record` pattern already used at
     `schemas/actions.ts:50-72`, so a new `Severity` or `StrideCategory` member fails `tsc` here.
  3. Applicability is checked **before** filtering, against the step 3 table; the first
     inapplicable filter in a fixed field order is reported, so the message is deterministic when a
     model sets two wrong filters at once.
  4. Filters combine with AND. Predicates run against raw values; only the projection sanitizes.
  5. `total` counts every match; the page is filled by `paginate`.
- **Targeted verification:** `npx vitest --run src/lib/ai/tools/document-read-tools.test.ts -t
  "search_entities"`. Discriminating assertions: two identical calls on a 300-element document
  return byte-identical results, and pages 0/20/40 concatenate to exactly the filtered document
  order with no gap or repeat; `{ kind: "elements", severity: "high" }` returns `invalid_filter`
  naming `severity`, `elements`, and the four applicable filters; `{ kind: "elements", offset: 999 }`
  on a 41-element document returns `offset_out_of_range` quoting 41 and the valid range;
  `{ kind: "threats", severity: "critical" }` on a document with no critical threats returns
  `status: "ok"` with `total: 0` — asserted explicitly, because "zero matches must stay a success"
  is the counterpart to the failure cases; a synthetic 5,000-element document (the
  `registry-scale.test.ts` pattern) still returns within `READ_RESULT_MAX_BYTES` and reports the
  true `total`.
- **Intent validation:** owner confirms the nine filters are useful without turning into a query
  language, and that `search_entities` plus `get_entity` is enough granularity that a model does not
  need to page the whole document.

### 6. `search_component_catalog`

- **Behavior:** `{ query?, category?, provider?, include_deprecated?, offset?, limit? }` → a
  paginated page of catalog entries in registry declaration order, projected to what a model can
  act on: `id`, `label`, `category`, `provider`, `icon_id`, `shape`, `stride_role`, `status`,
  `aliases` (capped), `keywords` (capped), and `variants` as `{ id, label, provider, icon_id }`
  (capped, with a total).
- **Files:** `src/lib/ai/tools/catalog-read-tool.ts`, `src/lib/ai/tools/catalog-read-tool.test.ts`.
- **Implementation:**
  1. Delegate matching to `searchComponents(query ?? "", { category, provider, includeDeprecated })`
     from `@/lib/registry/registry`. Re-implementing the haystack would fork `#59`'s contract.
  2. `category` and `provider` enums are built from `COMPONENT_CATEGORY_LABELS` and
     `PROVIDER_LABELS` (`registry/types.ts:176-198`), which are exhaustive `Record`s over the closed
     unions — so a new category or provider fails `tsc` here until the tool is updated.
  3. **Never project** `IconEntry`, `provenance`, `artwork`, `sourceFile`, `license`, `copyright`,
     or `trademark`. `icon_id` — a stable `.thf` `element.icon` value — is the only icon-related
     field emitted, and it is what `#204`'s `add_element` will need.
  4. The tool description states that a `provider` filter also matches components whose *variants*
     carry that provider, which is `#59`'s published bucket behavior (`registry.ts:112-124`).
- **Targeted verification:** `npx vitest --run src/lib/ai/tools/catalog-read-tool.test.ts`.
  Discriminating assertions: the union of every key emitted across a full unfiltered sweep of all 48
  entries equals the authored allowlist — so `sourceFile`, `provenance`, and `license` cannot appear;
  `{ category: "not_a_category" }` fails at `prepare` with the enum members listed; results for the
  same query are byte-identical across calls and follow `COMPONENT_ENTRIES` declaration order;
  a deprecated entry is absent by default and present with `include_deprecated: true`.
- **Intent validation:** owner confirms the catalog projection is useful for choosing an
  `element.type`/`icon`, and that withholding license/provenance from the model is right (it is
  attribution metadata for humans, surfaced by `NOTICE`).

### 7. Compose one production registry and wire the store

- **Behavior:** exactly one production factory builds the turn's tool set, offering the four read
  tools and the twelve mutation tools. `#204` and `#205` extend the same list.
- **Files:** new `src/lib/ai/tools/tool-registry.ts`, new `src/lib/ai/tools/tool-registry.test.ts`;
  edit `src/stores/ai-turn-store.ts` (line 97 and its import), `src/lib/ai/tools/graph-action-tools.ts`
  (remove `createGraphToolRegistry`), and the two tests that call it
  (`graph-action-tools.test.ts:5`, `:90`, `:121`, `:132`, `:142`).
- **Implementation:**
  1. `createAiToolRegistry(): ToolRegistry` = `createToolRegistry([...DOCUMENT_READ_TOOLS,
     ...GRAPH_ACTION_TOOLS])`. Read tools first, so the advertised list leads with the
     non-mutating capability and the order stays deterministic.
  2. Delete `createGraphToolRegistry`. Two factories where one is unused is exactly the "speculative
     scaffolding" the anti-slop guardrails name; `GRAPH_ACTION_TOOLS` stays exported for tests and
     for composition.
  3. `ai-turn-store.ts:97` becomes `toolCapable ? createAiToolRegistry() : createToolRegistry([])`.
     The tool-incapable fallback is unchanged: an unknown or non-tool model still runs the fenced
     text-only turn.
- **Targeted verification:** `npx vitest --run src/lib/ai/tools src/stores/ai-turn-store.test.ts`.
  Discriminating assertions: `createAiToolRegistry().list()` has 16 tools with unique names; every
  tool named in `DOCUMENT_READ_TOOLS` has `effect: "read"` and `destructive: false`; all twelve
  legacy tools keep `effect: "mutate"`; `autoGrantReadOnly(tool, target, 0)` returns a
  `scope: "auto"` grant for each of the four and still throws for a mutating tool; a turn submitted
  through the store advertises all 16 tools in the request.
- **Intent validation:** owner confirms read tools should be offered to every tool-capable model
  unconditionally rather than behind a setting.

### 8. Prove zero mutation and zero exposure

- **Behavior:** the invariants of this issue, as tests that fail loudly if a future edit breaks
  them: no production read tool changes the document by byte or by structure, none returns a
  document, none reaches state outside its context, and none emits an unlisted key.
- **Files:** new `src/lib/ai/tools/read-tool-invariants.test.ts`.
- **Implementation:**
  1. A `READ_TOOL_INPUTS` table gives at least one valid input per read tool — including
     `search_entities` for all eight kinds — mirroring `graph-action-tools.test.ts:56-72`. A guard
     asserts the table covers **every** tool in `DOCUMENT_READ_TOOLS`, so a new read tool cannot be
     added without a mutation proof.
  2. For each input, against a rich fixture document: capture
     `serializeThreatModelYaml(document)` (`src/lib/thf-yaml.ts:116`) and `canonicalJson(document)`
     before and after `prepare(...).call.run(ctx)`; assert byte equality of the YAML, equality of
     the canonical JSON, and `useModelStore.getState().model === before` (reference identity).
  3. Assert `"document" in outcome === false` for every outcome — stronger than
     `outcome.document === undefined`, which an explicit `document: undefined` would satisfy.
  4. Feed each outcome to `commitToolOutcome(outcome, { expected, effect: "read", ledger })` and
     assert `status: "unchanged"` — never `committed`, never `refused`. A control passes a
     deliberately mutating fake read outcome and asserts `refused` with
     `refusal: "read_tool_mutated"`, so the assertion cannot pass vacuously.
  5. Assert no history snapshot was pushed: `useHistoryStore.getState().past.length` is unchanged.
  6. Output-key allowlist: sweep every tool over the fixture, collect every object key in the parsed
     payload, and assert the set equals the authored allowlist.
  7. Import allowlist: the `import.meta.glob(..., { query: "?raw" })` source-scan pattern from
     `no-runtime-svg-parser.test.ts` over `src/lib/ai/tools/*.ts` (excluding tests), asserting no
     import of `@/stores/`, `@/lib/adapters/`, `settings`, `@tauri-apps/`, `import.meta.env`, or
     `process.env`, and asserting the scan matched a non-empty file set.
  8. Bound assertion for decision 5: the largest projection producible from a fixture whose every
     field is at its cap encodes to fewer than `READ_RESULT_MAX_BYTES` bytes.
- **Targeted verification:** `npx vitest --run src/lib/ai/tools/read-tool-invariants.test.ts`.
  The discriminating case is (4)'s control and (2)'s YAML byte comparison: an implementation that
  cloned and re-serialized the document, or that normalized a field in place, fails it.
- **Intent validation:** owner confirms these are the proofs that make "read tools cannot mutate or
  leak" credible without reading every tool body.

### 9. Adversarial text, and a real read call through the loop

- **Behavior:** a hostile document cannot escape a tool result's data fence or change
  authorization, and a read call completes end-to-end through the runner with a paired
  `tool_result` and no approval pause.
- **Files:** edit `src/lib/ai/loop/injection.test.ts` (new case 10), edit
  `src/lib/ai/loop/turn-runner.test.ts`, edit `src/lib/ai/providers/test-fixtures/anthropic-fixtures.ts`
  and `src/lib/ai/protocol/contract.test.ts`.
- **Implementation:**
  1. **Injection case 10 — "a hostile document cannot escape a read tool's data fence."** Build a
     document whose `metadata.title`, element `id`, `name`, `description`, `technologies[]`,
     `tags[]`, flow `protocol`, boundary `name`, and threat `title` each contain a mix of:
     the literal `UNTRUSTED_DOCUMENT_END`, `"ignore previous instructions"`, a fabricated tool
     instruction, a right-to-left override, a NUL and other C0 bytes, a zero-width space, a
     600-code-point run, and an astral emoji. Run every read tool. Assert: the raw end marker
     appears exactly once per result; every hostile phrase lies strictly between the markers; no
     control or bidi code point survives; every scalar is at or under its cap; the result parses as
     JSON after stripping the markers; and — driven through the reducer — no grant exists for any
     mutating call and no `run_shell`-style fabricated tool resolves.
  2. **Prototype-pollution input.** `prepare({ kind: "elements", __proto__: { x: 1 } })` is refused
     by `#61`'s `findPrototypeKeyIssues` (`protocol/tools.ts:109-135`); assert the issue names
     `__proto__`, and that `Object.prototype` is unpolluted afterwards.
  3. **Turn-runner read turn.** A scripted stream calls `search_entities`, then a second iteration
     ends the turn. Assert: the call never enters `pending` (auto-granted, `scope: "auto"`); the
     turn never enters `awaiting_approval`; the second request's history carries a `tool_result`
     paired to the call and `assertToolPairing` reports zero violations; the model store reference
     is unchanged; `undoAvailability()` is `already_undone` because no snapshot was pushed.
  4. **Provider contract fixture.** Add an Anthropic SSE transcript that calls `get_document_summary`
     with `{}` arguments, plus its OpenAI counterpart, and assert the emitted `StreamEvent`
     sequences match across both transports — the neutrality proof `contract.test.ts` already
     applies to the mutation tools. An empty-argument tool call is the case worth pinning: it is the
     shape most likely to arrive as `{}`, `""`, or an omitted field from a provider.
- **Targeted verification:** `npx vitest --run src/lib/ai/loop src/lib/ai/protocol/contract.test.ts`.
- **Intent validation:** owner reads case 10's fixture and confirms it resembles a document a
  hostile collaborator could actually share.

### 10. Document the read contract

- **Behavior:** `docs/knowledge/ai-tool-loop.md` describes the read tools, their bounds, their
  ordering rule, their failure vocabulary, and the untrusted-data envelope, so `#204`/`#205` extend
  the same contract instead of inventing a second one.
- **Files:** `docs/knowledge/ai-tool-loop.md`; one cross-reference line in
  `docs/knowledge/component-registry.md`'s consumer list.
- **Implementation:** replace the "`#64` boundary" section's forward-looking language with a "Read
  tools" section: the four tools and their inputs, the seven bounds with their values, document
  order, the three failure codes, the result envelope with its markers, and the invariant list from
  step 8. Describe behavior; do not restate code. Update the sentence in `ai-tool-loop.md` that says
  all shipped tools are `mutate`.
- **Targeted verification:** every referenced path, symbol, tool name, and issue number resolves.
  Markdown under `docs/` is outside Biome's `files.includes` (`biome.json:10-19`), so this is a
  manual link/symbol pass rather than a lint step.
- **Intent validation:** owner confirms a `#204` implementer can extend the registry from this
  document without rediscovery.

## Acceptance criteria checklist

Mapped to the issue's *Observable Success* bullets.

| # | Observable Success bullet | Verifiable criterion | Where proven |
|---|---------------------------|----------------------|--------------|
| 1 | Read tools registered with `effect: "read"` and usable by `#62`'s safe path | `createAiToolRegistry()` lists 16 tools; the four read tools have `effect: "read"`, `destructive: false`; `autoGrantReadOnly` issues a `scope: "auto"` grant for each; a runner turn calling one never enters `awaiting_approval` | Steps 7, 9 |
| 2 | A model can retrieve a bounded summary, query by stable id/filter, and search catalog entries without mutating state | `get_document_summary`, `get_entity`, `search_entities` (8 kinds, 9 filters), `search_component_catalog` all return `status: "ok"` payloads within `READ_RESULT_MAX_BYTES` against the fixture | Steps 4, 5, 6 |
| 3 | Missing ids, invalid filters, and result-limit overflow return structured authored failures, never empty success-shaped results | `unknown_id`, `invalid_filter`, `offset_out_of_range` each return `status: "error"` with the authored text asserted per code; a genuine zero-match query is asserted to stay `ok` with `total: 0` | Steps 4, 5 |
| 4 | Results are deterministic, bounded, and preserve untrusted strings as data | Byte-identical repeat calls; page concatenation equals document order; `stopped_by: "bytes"` with a passing byte-length assertion and a failing control; exactly one raw end marker under adversarial text; no control/bidi code point survives | Steps 2, 5, 9 |
| 5 | `read_tool_mutated`-style tests prove every production read tool leaves the document byte/structure-equivalent | Per tool: YAML byte equality, `canonicalJson` equality, store reference identity, `"document" in outcome === false`, `commitToolOutcome` → `unchanged`, history depth unchanged — with a mutating control proving `refused`/`read_tool_mutated` is reachable | Step 8 |
| 6 | No read tool exposes keys, provider headers, filesystem paths, or hidden application state | Output-key allowlist across a full sweep; import allowlist source scan; catalog projection excludes `sourceFile`/`provenance`/`license`/`trademark`; `ToolExecutionContext` carries only `ThreatModel` + `AbortSignal` | Steps 6, 8 |

## Cross-cutting requirements

- **Security and privacy:** this issue adds the first production consumer of an automatic
  authorization path, so the security lane is required, not conditional. The privilege is narrow by
  construction: `autoGrantReadOnly` keys only on the static, local `effect`/`destructive` fields
  (`authorization.ts:128-146`) and a read tool that returns a document is refused at commit. No new
  IPC command, network destination, capability, CSP entry, or dependency. Keys are never in scope —
  the tools' import allowlist excludes every module that could reach one, and on desktop the key
  never leaves Rust. Untrusted document and catalog text is sanitized, escaped, delimited, and
  rendered as text on the card. Model output stays `unknown` until `prepare` accepts it.
- **`.thf` compatibility:** none. No schema field, version, serializer, reader, or migration
  changes. The relationship is one-directional: step 8 uses `serializeThreatModelYaml` as the
  byte-equality oracle, which also means a serializer regression would surface here.
- **Browser and desktop:** pure TypeScript with no platform branch and no adapter import. Step 9's
  provider fixture asserts the same `StreamEvent` sequence on both transports, which is the parity
  proof.
- **AI safety:** inputs are validated by generated strict schemas with `additionalProperties: false`
  and `__proto__` rejection; outputs are bounded, deterministic, and fenced as data; read calls are
  auto-approved but still visible as cards, cancellable with the turn, and — because they return no
  document — cannot leave partial state. Nothing here weakens the approval requirement for any
  mutating tool.
- **Accessibility and UX:** no new component. Read calls render through the existing `ToolCallCard`
  with its plain-text `ExpandableText` preview and existing status affordances. Result text is long
  JSON, so the 240-character preview and expander matter — the owner should look at a real read card
  (see *Owner validation*).
- **Observability and evidence:** no logging of document content, tool inputs, or results. The PR
  carries the adversarial case-10 output, the byte-cap control assertions, the scale-test timing,
  and a screenshot of a real read-tool card in both themes.

## Verification gate

Targeted, while iterating:

```bash
npx vitest --run src/lib/ai/tools
npx vitest --run src/lib/ai/loop src/lib/ai/protocol
npx vitest --run src/lib/ai-prompt.test.ts src/lib/document-display-title.test.ts
npx vitest --run src/stores/ai-turn-store.test.ts
npx tsc --noEmit
npx biome check src/
```

Before handoff:

```bash
npm run ci:local
npx playwright test e2e/ai-tool-loop.spec.ts e2e/ai-chat.spec.ts
```

`npm run ci:docker` is not required: this change touches no Rust, no build configuration, and no
platform adapter.

## Owner validation

Green CI cannot decide any of the following.

1. **Granularity, not a dump surface.** Four tools with nine filters is the central product
   judgement of this issue. Run a real BYOK conversation on a 40-element model and judge whether
   the model reaches the entity it needs in one or two calls, or whether it pages
   `search_entities` repeatedly — which would mean the compact projection is too thin.
2. **The bounds.** 8 KiB per result, 20 per page, 50 maximum. A worst-case turn spends ~64k
   estimated tokens on tool results. Confirm that matches your BYOK cost tolerance, and that a
   model that pages a large document is stopped by `maxToolCallsPerTurn` early enough.
3. **Read cards in the approval feed.** Auto-approved read calls still render as cards
   (`ai-chat-tab.tsx:371-373`). On a multi-read turn the feed may read as noise around the
   mutations that actually need review. Decide whether that transparency is right or whether read
   cards should collapse — a UI follow-up, not a change to this plan.
4. **Layout and style fields are withheld.** A model cannot see positions or colors through any read
   tool, yet `add_element` asks it to choose positions and the prompt's `CANVAS POSITIONING` section
   tells it to place elements relative to existing ones (`ai-prompt.ts:130-146`). The prompt's
   document block still carries positions, so nothing regresses today — but confirm that `#205`,
   not `#203`, should own position-aware reads.
5. **The prompt still carries the whole document.** With read tools registered, every turn pays for
   the full document *and* can query it. Confirm the follow-up direction (below) rather than
   accepting the duplication permanently.
6. **Catalog metadata withheld.** Licenses, provenance, and trademark data are not exposed to the
   model. Confirm that is right for a tool whose results may be quoted back to a user.
7. **Live BYOK.** CI proves the tools against scripted streams. Run a real multi-tool conversation
   on both providers, desktop and browser, and confirm the model actually calls
   `get_document_summary` first rather than ignoring the read tools.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor — likely findings and their answers: (a) `read-result.ts`'s byte-fill loop looks
      like speculative complexity — it is the mechanism the byte cap is stated in, with a control
      test that fails without it; (b) the `unknown_id` / `invalid_filter` / `offset_out_of_range`
      union may look like over-specified error handling — each is a named acceptance criterion with
      a distinct authored message and test; (c) `untrusted-text.ts` is an extraction with two real
      callers on day one, not an abstraction ahead of need; (d) confirm no read path is
      success-shaped on failure.
- [ ] **Security auditor — REQUIRED.** Lanes: the first production use of `autoGrantReadOnly`; the
      import and output-key allowlists as exposure proofs; delimiter forging and marker counting
      under the case-10 corpus; whether `escapeDocumentText` + code-point sanitizing is sufficient
      for text that reaches both a provider and the DOM; and whether echoing an untrusted id inside
      an authored failure is safe at the 80-code-point cap.
- [ ] Threat-model expert — whether the threat projection (`category`, `severity`,
      `mitigation_status`, target ids) and `get_document_summary`'s breakdowns give a model enough
      to reason about STRIDE coverage without inviting false positives, and whether withholding
      `description` from search results (it is in `get_entity`) is the right split.

## Findings that become follow-up issues

Do not build these here; file them as linked issues.

1. **The system-prompt document context is unbounded.** `modelContextSection`
   (`ai-prompt.ts:183-263`) serializes every element, flow, boundary, and threat with no ceiling, so
   a large model can push the prompt past the context window on the first request. The issue body's
   claim that this is "already done in bounded form" does not match the code. Now that read tools
   exist, the natural fix is a bounded prompt summary plus read tools for detail — which is a
   product change the owner must see.
2. **A read tool's fresh state versus the prompt's stale snapshot.** The prompt is built once at
   submit (`ai-turn-store.ts:98`), so after an approved mutation the in-prompt document is stale
   while `ctx.document` is current. Step 1 adds one sentence telling the model to prefer read tools
   for current state, but the durable fix belongs with (1).
3. **OpenAI `strict` tool schemas.** `openai.ts:14-18` defers the decision to `#64`. It affects all
   16 tools, so it belongs to `#204` or its own issue, not here.
4. **Read cards in the approval feed.** See Owner validation 3.

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-25 | Initial plan | Issue `#203` and its two triage comments, parent `#64`, dependencies `#62`/`#61`/`#59` and their committed plans, and direct reading at `main` `940bc00` of `src/lib/ai/tools/graph-action-tools.ts`, `src/lib/ai/loop/{tool-runtime,authorization,limits,transaction,turn-machine,turn-runner}.ts`, `src/lib/ai/protocol/{tools,messages,budget,errors}.ts`, `src/lib/ai/providers/openai.ts`, `src/lib/ai/schemas/actions.ts`, `src/lib/registry/{registry,types,component-entries,icon-entries}.ts`, `src/lib/{ai-prompt,document-display-title,thf-yaml,thf-validation,ai-models}.ts`, `src/types/threat-model.ts`, `src/stores/ai-turn-store.ts`, `src/components/panels/{tool-call-card,ai-chat-tab}.tsx`, and the existing suites `graph-action-tools.test.ts`, `injection.test.ts`, `turn-runner.test.ts`, `contract.test.ts`, `ai-prompt.test.ts`, `no-runtime-svg-parser.test.ts`, `registry-scale.test.ts` |
| 2026-07-25 | Renamed to `docs/plans/203-bounded-ai-read-tools.md` | Matches the filename the issue's triage comments require |
| 2026-07-25 | **BLOCKER (implementer): Decision 5 worst-case bound is contradicted by measured evidence; Step 8.8 as written is unsatisfiable.** Deviated by pinning the *true* behaviour in `read-tool-invariants.test.ts` instead of asserting the false "one entity is provably under the cap", and did **not** add a fix (no new failure code, no bound change) because the fix is an owner design decision. | Decision 5 states an element's full projection is bounded by `(scalars × 200) + (2 × 400) + (lists × 10 × 200)` code points and concludes "one entity can never exceed `READ_RESULT_MAX_BYTES` … so no such branch is written". For an **element** that formula is `9×200 + 2×400 + 7×10×200 = 16 600` code points — already `> 8192`. Measured through the real `getFullEntity` → `buildReadResult` path on a constructible, `validateThreatModel`-valid document (element with 10 technologies/tags/stores at the 200-cp cap, 10 inbound + 10 outbound flows, 10 boundaries, 10 threats, all ids at 200 cp), the `get_entity` body is **16 502 bytes** and `buildReadResult` throws. The element projection is the only one that blows the cap (it has 7 list fields: `technologies`, `tags`, `stores`, `incoming_flow_ids`, `outgoing_flow_ids`, `trust_boundary_ids`, `threat_ids`); `threats`, `data_flows`, `trust_boundaries`, etc. all fit. Current runtime behaviour is **fail-closed and safe** — the throw is caught at `turn-runner.ts:215-219` → `{status:"error", result:"The tool failed while running."}` → `commitToolOutcome` refuses (`tool_error`), so nothing is applied, no document is leaked, and no empty-success is returned — but the message is generic, **not** the authored, structured `get_entity` failure the issue requires for the result-limit-overflow case, and `get_entity` is unusable for that (valid) large element. **Owner decision required** among: (a) add a structured `entity_too_large` read failure for `get_entity` (contradicts Decision 5's "no such branch"); (b) tighten bounds so the element worst case fits (e.g. drop `LIST_MAX_ITEMS` for derived id-lists, or cap derived-id lists at a smaller code-point width); or (c) raise `READ_RESULT_MAX_BYTES`. This should become a follow-up issue. |
| 2026-07-25 | **Resolved the blocker above by taking option (a): a structured `entity_too_large` failure.** Decision 5's premise is disproven, so the decision it justified no longer stands. `buildReadResult` keeps throwing for callers whose payload is bounded by construction (`paginate`, and the fixed-shape summary); `tryBuildReadResult` reports the size instead, and `get_entity` turns an overflow into an authored failure naming `search_entities` as the remedy. | Reproduced independently at the tool level, not the helper level: a document holding one element with its three free-text lists at the cap and its four derived id-lists filled by flows, boundaries and threats whose own ids are at the scalar cap projects to 10 960 bytes, over the 8192 cap. Option (b) **would** work and an earlier version of this entry wrongly claimed it could not: `escapeList` already caps every list at 10 items x 200 code points, so an element's full projection is bounded at roughly 16 200 code points no matter how large the document is, and tightening those caps could make one entity provably fit. It was rejected on merit rather than on possibility: the fit would be bought by shrinking every result, including the great majority that were never near the cap, so a rare entity would degrade what the model sees for every common one. Option (c) was rejected because a larger cap is a larger context dump on every call, which is the pressure the bounds exist to resist, and it moves the boundary rather than defining behaviour at it. Truncating the entity was rejected outright: a short entity and a trimmed one are indistinguishable to the model, so it would reason about a partial entity believing it complete — the failure this issue's contract exists to prevent. Three mutants confirm the tests: restoring the throw, letting the overflow through as a success, and pointing the failure message at a tool that cannot answer each fail exactly one named test. The `search_entities` remedy is itself pinned by a test, so the message cannot dead-end. |

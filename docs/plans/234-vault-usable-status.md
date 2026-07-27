# Issue 234 — Stop reporting a key the browser vault cannot read as configured

## Objective

On a browser profile whose vault wrapping key is lost or damaged while encrypted records
survive, every surface that describes the user's credential reports a fault with the authored
remedy instead of a green "API key configured" dot. A status check still performs no
decryption, and desktop behaviour is untouched.

## Issue contract

- **Issue:** `#234`
- **Parent initiative:** `N/A` (related: `#133` made the state reachable, `#233` added the
  surfaced-error path this plugs into, `#266` was the `#233` PR)
- **Type:** `Bug`
- **Effort:** `High` — by the `AGENTS.md` floor rule ("any work touching cryptography, the IPC
  boundary, the `.thf` schema, or a trust boundary is `High` regardless of how small the diff
  looks"), not by scale. See "Decomposition" below: this is **not** decomposed into sub-issues.
- **Priority:** `High` — cost of delay recorded on the issue: a false-positive in secret
  handling, the class of bug that erodes trust in everything else the tool claims.
- **Autonomy:** `AUTO`. No secret, provisioning step, or external account action gates any
  step. Two copy decisions need owner *validation* after the fact, not before (see "Owner
  validation"); neither blocks implementation.
- **Dependencies:** none open. `#133` and `#233` are merged and on `main` at `24fc808`.
- **Non-goals:**
  - Any change to the vault's encryption, marker, or migration behaviour.
  - Clear-text residue after a refused `localStorage.removeItem` — that is `#233`, merged.
  - Making a status check prove that a *specific record* decrypts. Explicitly ruled out below,
    with the reason.
  - Changing `TauriKeychainAdapter`, `get_api_key_status`, or `KeyStorage`.

## Current behavior and evidence

All line numbers are against `main` at `24fc808`.

**The vault answers two different questions and one of them is not asked.**

- `browser-key-vault.ts:641` — `hasSecret(id)` opens one readonly transaction on `secrets` and
  returns `count(id) > 0`. It never reads the wrapping key and never decrypts.
- `browser-key-vault.ts:608` — `getSecret(id)` reads the record, then `readWrapKey(db)`
  (`:617`). A wrap key that is absent throws `vaultCorrupt()` (`:618`); one that is present but
  not a usable AES-GCM encrypt/decrypt key throws `vaultCorrupt()` from inside `readWrapKey`
  (`:405-409`). An AES-GCM `OperationError` throws `corruptRecord(record)` (`:632`); any other
  decrypt rejection throws `vaultCorrupt()` (`:634`), because it is not evidence about that
  record.
- `browser-keychain-adapter.ts:196` — `hasKey` is `migrateLegacyKey` then `hasSecret`, under
  the per-provider lock.
- `browser-keychain-adapter.ts:205` — `getKey` catches `reason === "corrupt"`, calls
  `dropUnreadableSecret`, returns `null`; it rethrows `vault-corrupt` and `unavailable`.

**The divergence is already pinned by a passing test.**
`browser-keychain-adapter.test.ts:1222` ("is rejected as a vault fault rather than destroying
the stored record") stores a key, replaces the wrapping key with an encrypt-only `CryptoKey`,
asserts `getKey` rejects `vault-corrupt`, and then asserts `hasKey` returns `true`. Verified
green on this tree:

```
npx vitest run src/lib/adapters/browser-keychain-adapter.test.ts \
  -t "is rejected as a vault fault rather than destroying the stored record"
→ 1 passed
```

That assertion is the bug, written down as an expectation. Its *intent* is "the record
survives, so restoring the correct wrapping key would recover it" — which the plan preserves
with a different assertion (step 1).

**Every consumer of the boolean already handles a rejection; none of them ever sees one here.**

- `ai-settings-content.tsx:57` — `type KeyStatus = boolean | "unknown" | "unchecked"`, and
  `statusToneOf` (`:69`) maps `"unknown"` to an amber dot and `"Key storage could not be
  checked"`. `:317` records a rejected `hasKey` as `"unknown"`; `:321-324` surfaces the
  rejection's message. The removal control (`:602`) and the "Replace API Key" label (`:559`)
  render only for `keyStatus === true`. **The rendering vocabulary for this fault already
  exists and is tested** (`ai-settings-content.test.tsx:206`, `:223`). The defect is upstream:
  `hasKey` resolves `true`.
- `chat-store.ts:523` — `checkApiKey` sets `hasApiKey` from `adapter.hasKey(provider)` and its
  `catch` sets `hasApiKey: false`, which `ai-chat-tab.tsx:121` renders as the `EmptyState`
  heading "No API key configured" (`:131`). So today a rejection on that path produces exactly
  the absence claim the panel refuses to make — the two surfaces disagree.
- `browser-chat-adapter.ts:337` — the request path already re-raises a `KeyVaultError` as a
  `no_api_key` protocol error carrying the vault's authored sentence. That third surface is
  already correct and needs no change.
- `app-layout.tsx:61-94` — the launch effect probes `readLegacyResidue` first and calls
  `hasKey` **only when some provider has a clear-text slot** (`:82`), inside
  `Promise.allSettled`. The surrounding comment explains why: an unconditional `hasKey` created
  the keychain database at launch for every profile. A rejecting `hasKey` is already normal
  there — `migrateLegacyKey` → `importLegacySecret` (`browser-key-vault.ts:793`) throws
  `vaultCorrupt()` today whenever records exist and the wrap key cannot be produced — and the
  `allSettled` plus the unconditional `refreshAllResidue()` that follows already absorb it. The
  gate is on slot presence, not on the answer, so nothing about this change alters whether the
  database is created.

**A rejection cannot wedge the provider queue.** `withProviderLock`
(`browser-keychain-adapter.ts:148-162`) parks a link that never rejects, so a failed `hasKey`
does not poison later calls for that provider.

**Desktop is a different implementation of the same idea and is already honest.**
`TauriKeychainAdapter.hasKey` invokes `get_api_key_status` (`ai_commands.rs:19`), which calls
`KeyStorage::has_key` (`keychain.rs:106`) — a lookup in an in-memory `HashMap`. That map only
exists because `KeyStorage::new` (`keychain.rs:73-77`) already decrypted `keys.enc` at startup,
and a failure there aborts app setup (`lib.rs:52-57`). A desktop profile therefore cannot reach
the state this issue describes: there is no "record present, key undecryptable" reachable
through `has_key`, because an undecryptable store means the app did not start. `has_key`'s only
reachable failure is a poisoned lock, which is already mapped to the authored string "the
stored API key could not be read" and is tested for payload leakage
(`ai_commands.rs:266`).

## Decision — how "usable" is established

### The three candidates

**A. Make `hasKey` authoritative (decrypt on every status check).**
`hasSecret` reads the record, reads the wrap key, and decrypts.
*Cost:* one AES-GCM decrypt per status check, on a render path that currently does no crypto.
*Ruled out.* Not for the microseconds — for what it forces next. A decrypt on the status path
produces an `OperationError` for a damaged record, and then the status path has to choose
between two worse behaviours:
  - drop the record, as `getKey` does (`browser-keychain-adapter.ts:220`). That makes opening
    the settings dialog silently delete key material. `dropUnreadableSecret` is deliberately
    scoped to a read the user asked for, and it also settles the provider's clear-text slot
    (`browser-key-vault.ts:731-735`) — so a render-path drop can destroy a surviving
    clear-text copy the user never asked anything about. **A status check that deletes
    credentials is a worse bug than the one being fixed.**
  - or report the fault without dropping, in which case the panel shows a fault that never
    clears, while the very next `getKey` drops the record and flips the panel to "No API key
    configured". The two surfaces disagree again, in the opposite direction.

It also changes `hasKey`'s meaning for the Tauri adapter, where — per the evidence above —
there is nothing to strengthen: `has_key` is already downstream of a successful decrypt.

**B. A separate `probeKey` / vault-health call used only by the settings panel.**
*Ruled out.* It creates a second predicate whose answer the first one is allowed to contradict,
which is the shape of the bug (`hasApiKey` vs. the panel status), reintroduced as an interface.
It adds a member to `KeychainAdapter` that `TauriKeychainAdapter` would have to implement as a
no-op or an alias of `hasKey` — a capability declared for one platform and stubbed on the
other, when the platforms genuinely share the question. And it leaves `hasKey` count-only, so
`chat-store.ts` keeps the wrong answer unless it also calls the probe — at which point there
was one predicate all along.

**C. `hasSecret` establishes the vault-level preconditions when, and only when, a record
exists. Chosen.**

```ts
export async function hasSecret(id: string): Promise<boolean> {
	return withVault(async (db) => {
		const store = db.transaction(STORE_SECRETS, "readonly").objectStore(STORE_SECRETS);
		const count = await awaitRequest(store.count(id));
		if (count === 0) return false;
		requireSubtle();
		if (!(await readWrapKey(db))) throw vaultCorrupt();
		return true;
	});
}
```

The failing state named in the issue is `vault-corrupt`: the **wrapping key** is lost or
damaged while records survive. That is a property of the vault, not of a record, so it is
answerable without touching a record's bytes. Two lines, both already written elsewhere in this
module for exactly this purpose — `getSecret:617-618` and `importLegacySecret:793` make the
same check, in the same order, and throw the same error.

### The cost, stated (acceptance criterion 2)

- **Zero cryptographic operations.** `readWrapKey` is an IndexedDB `get` plus `isWrapKey`,
  which reads `algorithm.name` and `usages` off a structured-clone `CryptoKey` handle. No
  `subtle.decrypt`, no `subtle.encrypt`. Step 1 pins this with a `subtle.decrypt` spy so the
  claim is a test rather than a sentence in a plan.
- **One extra readonly IndexedDB transaction and one `get`, only for providers that have a
  record.** A provider with nothing stored costs exactly what it costs today: one `count`.
- **`requireSubtle()` is a property read** (`globalThis.crypto?.subtle`) and no transaction at
  all.
- **Call frequency:** the settings panel mount (two providers), `chat-store.checkApiKey` on AI
  tab mount and provider switch and after save/delete, a residue recheck click, and the launch
  effect *only when a clear-text slot exists*. This is not a hot path and does not become one.
- **No new database creation.** `hasSecret` already opens the vault; the second transaction is
  on the connection `withVault` already holds and closes.
- **Blast radius of the added rejection is narrower than it looks.** A profile that still has a
  clear-text slot *already* rejects on this path, from `importLegacySecret:793`, before
  `hasSecret` is reached. The new rejection is therefore observable mainly on slot-free
  profiles — the ordinary post-`#133` case.

### What C does **not** cover, and why that is the right line

- **A single damaged record while the wrap key is fine.** `count` is 1, the wrap key reads
  back, `hasSecret` returns `true`, and only `subtle.decrypt` would reveal the truncation or
  tamper. This case remains reported as "API key configured" until the user's next request,
  which fails with the authored `CORRUPT_MESSAGE` ("The stored API key could not be read and
  needs to be entered again"), drops the record, and leaves the panel showing "No API key
  configured" with the message on screen. That is imperfect but bounded, self-healing, and
  actionable — and closing it requires the render-path decrypt-and-delete ruled out under
  option A. **This boundary is made explicit by a named test (step 1) rather than left as an
  unstated gap.**
- **A crypto-layer fault at decrypt time that is not an `OperationError`** (`:634`). The wrap
  key reads back fine, so a status check cannot see it. Same reasoning: only a decrypt would
  show it, and the vault deliberately treats it as non-evidence about the record.
- **A record whose stored value does not parse as `{ iv, ciphertext }`** (`:615`,
  `corruptRecord(null)`). Detectable without crypto by reading the record instead of counting
  it — but the honest response is the same per-record drop decision as above, so it is left
  with the per-record case rather than half-covered. If a future issue wants the per-record
  class covered, the parse check and the decrypt belong in the *same* change with a decided
  answer about who deletes what, and not on a render path.

### Why `requireSubtle()` is included and is not a speculative defense

Without `SubtleCrypto` no record in the vault is decryptable, which is the same vault-level
fact as a missing wrap key. It is reachable — `crypto.subtle` is exposed only in secure
contexts, so a self-hosted `http://` deployment has none — and the vault already treats it as
reachable: `requireSubtle` exists (`:274`), `unavailable()` is authored for it, and
`browser-keychain-adapter.test.ts:387` tests the save path for it. Step 1 adds the matching
status-path test, so it is pinned rather than assumed.

### What the function is *not* renamed to

`hasSecret` keeps its name. `hasUsableSecret` would overclaim in exactly the direction this
issue is about — it does not prove the record decrypts — and a name that promises more than the
body delivers is how the original defect reads. The docblock states the contract precisely
instead.

### Tauri (acceptance criterion 6)

**No change to `tauri-keychain-adapter.ts`, `ai_commands.rs`, or `keychain.rs`.**

`KeychainAdapter.hasKey` gains **no new rejection mode**: it is already `Promise<boolean>` and
both implementations already reject — the browser through `withVault`'s authored
`KeyVaultError`, desktop through `invoke` rejecting with `key_refusal`'s authored string, which
`ai-settings-content.tsx:106` already renders via its string branch. What changes is *when* the
browser rejects, not *whether* the contract permits it. The interface docblock is updated to
say so, because "returns a boolean" is what let a caller assume the answer was total.

Desktop already has the property this issue asks for, by construction: `has_key` reads a map
that only exists because `keys.enc` decrypted at startup. Strengthening it would mean inventing
a failure the platform cannot produce.

### Panel and chat wording

The amber `"unknown"` tone is reused, not replaced. It already means "storage did not give a
usable answer", it already suppresses the destructive removal control, and the authored
`VAULT_CORRUPT_MESSAGE` — carrying the remedy — is already rendered in the message block. A
fourth tone keyed on a reason code would buy a colour, not information, and would require
exporting vault reason codes to a component that deliberately matches structurally
(`isRetainedLegacyCopy`, `:118`). Destructive red is deliberately *not* used: red is owned by
"a live clear-text credential is readable in this browser", an exposure. A damaged vault is a
loss of function, and the panel's documented precedence (`statusToneOf`) already ranks the
exposure above it.

One string does change. `"Key storage could not be checked"` was true when `hasKey` only
counted; after this change the dominant case is a check that *did* answer and answered
"damaged". `"Key storage could not be read"` is true of every case that reaches this tone —
damaged vault, unavailable storage, a rejected migration — and it is a sentence the chat
surface can share verbatim, which is what stops the two surfaces from disagreeing in wording
while agreeing in fact.

## Decomposition — this issue does not get sub-issues

`AGENTS.md` requires `High` work to be decomposed into executable sub-issues. It is `High` here
because of the floor rule, and decomposition would make the result worse, so the steps below
are the decomposition and they all land in one PR against `#234`.

Evidence and reasoning:

- **Scale.** The production diff is one function body in `browser-key-vault.ts`, three
  docblocks, one string, two small helpers moved, ~6 lines in `chat-store.ts`, and one
  presentational component in `ai-chat-tab.tsx`. There is no schema change, no new capability
  on `KeychainAdapter`, no migration, and no Rust.
- **Coherence.** The acceptance criteria are mutually dependent. Shipping the vault change
  alone (AC 1) *creates* an AC 3 violation: the panel would show the fault while
  `chat-store`'s `catch` turned the same rejection into "No API key configured". Shipping the
  chat reconciliation alone changes nothing observable, because `hasKey` never rejects in this
  state. Sub-issues here would be a sequence of states in which the product is more wrong than
  it is today, filed as separately mergeable units.
- **Precedent.** `#233` was `High` for the same floor reason, was planned as steps rather than
  sub-issues, and shipped as one PR (`fddaab3`, PR `#266`). Its plan is
  `docs/plans/233-persistent-clear-text-key-warning.md`.
- **What decomposition is for.** Sub-issues buy independent review and independent revert of
  genuinely separable work. Nothing here is separable: every step exists to keep a single
  predicate honest across three surfaces.

Two genuinely separate defects surfaced while planning. They are **not** sub-issues and are
**not** in scope — they are new issues to file. See "Follow-up issues to file".

## Implementation steps

Each step is `Low` on its own. Steps 1–6 are ordered; 2 is behaviour-preserving and can land
first if the implementer prefers a clean diff.

### 1. `hasSecret` answers for the vault as well as the record

- **Behavior:** `hasSecret(id)` resolves `false` when no record is stored for `id`; resolves
  `true` when a record is stored and this browser can produce the material to decrypt it; and
  rejects with `KeyVaultError` — `vault-corrupt` when the wrapping key is missing or unusable,
  `unavailable` when Web Crypto or IndexedDB is not usable here — when a record is stored and it
  cannot. It performs no decryption and deletes nothing, ever.
- **Files:**
  - `src/lib/adapters/browser-key-vault.ts` (`hasSecret`, `:641`)
  - `src/lib/adapters/browser-keychain-adapter.ts` (`hasKey` docblock, `:196`)
  - `src/lib/adapters/keychain-adapter.ts` (`hasKey` docblock on the interface)
  - `src/lib/adapters/test-fixtures/key-vault.ts` (fixture extraction)
  - `src/lib/adapters/browser-keychain-adapter.test.ts`
- **Implementation:**
  1. Replace the body of `hasSecret` with the form quoted under "Decision — option C". Keep the
     `withVault` wrapper: it is what guarantees no raw `DOMException` escapes.
  2. Order is load-bearing and must be commented: the `count` gates both later checks, so a
     provider with nothing stored still reads as "no key" on a damaged vault rather than
     inheriting another provider's fault.
  3. Reuse `readWrapKey(db)` as-is, in its own transaction, exactly as `getSecret:617` does.
     Do **not** refactor it to share one transaction with the count: `readWrapKey` has three
     callers, and the only thing the split loses is snapshot consistency against a concurrent
     tab minting or wiping a key — which can change a *status*, never a destructive action.
     Note that trade in the docblock.
  4. Rewrite the docblock. State what it establishes, what it does not (the per-record case),
     and that it never decrypts.
  5. Update `BrowserKeychainAdapter.hasKey`'s docblock: it now rejects for a vault that cannot
     decrypt anything, and callers must not read a rejection as absence.
  6. Update `KeychainAdapter.hasKey`'s docblock in the interface: the rejection mode is part of
     the contract on both platforms, browser and desktop each state how they reach it, and a
     caller that collapses a rejection to `false` is making a claim about storage that did not
     answer.
  7. Move `openVaultDb` and `writeWrapKeyStore` out of `browser-keychain-adapter.test.ts` into
     `src/lib/adapters/test-fixtures/key-vault.ts` (which exists for exactly this) and import
     them back. Behaviour-identical move; step 3 needs them from a second file.
- **Tests to add** in `browser-keychain-adapter.test.ts`, in a new
  `describe("a status check over a vault that cannot decrypt")`:
  - `it("reports a stored key the vault can no longer decrypt as a fault, not as configured")`
    — `setKey`, `writeWrapKeyStore([])`, expect `hasKey` to reject with `reason:
    "vault-corrupt"`, and assert `await countSecrets()` is still `1`, so the status check
    destroyed nothing.
  - `it("reports a wrapping key of the wrong shape as a fault")` — same with an encrypt-only
    `CryptoKey`, covering `readWrapKey`'s throw branch as distinct from its `null` branch.
  - `it("still answers false for a provider with no record while another's is stranded")` —
    `setKey("anthropic")`, `writeWrapKeyStore([])`, expect `hasKey("openai")` to resolve
    `false`. Pins the count gate: an unconfigured provider must not inherit the fault.
  - `it("does not decrypt to answer a status check")` — spy on `crypto.subtle.decrypt`, expect
    `hasKey` to resolve `true` and the spy not to have been called. This is the durable
    evidence for the cost claim in AC 2.
  - `it("reports a stored key as unreadable when Web Crypto is unavailable")` — seed a record,
    then remove `crypto.subtle` the way `:387` does; expect rejection with `reason:
    "unavailable"` and the record intact.
  - `it("reports a per-record decryption failure only once a read has established it")` —
    `setKey`, `corruptStoredRecord("anthropic")`, assert `hasKey` still resolves `true`, then
    `getKey` resolves `null`, then `hasKey` resolves `false`. This is the deliberate boundary
    of the fix, written down so a later reader does not assume the per-record case is covered.
- **Tests to change:**
  - `:1222` "is rejected as a vault fault rather than destroying the stored record" — replace
    `expect(await adapter.hasKey("anthropic")).toBe(true)` with a rejection assertion plus
    `expect(await countSecrets()).toBe(1)`. The assertion's stated intent ("the record
    survives, so restoring the correct wrapping key would recover it") is preserved; only the
    predicate used to observe it changes.
  - `:1806` "does not report an unreadable record dropped when its transaction aborts" —
    unchanged. The wrap key is healthy there and only the ciphertext is damaged, so `hasKey`
    still returns `true` by design. Confirm it still passes rather than editing it.
- **Targeted verification:**
  `npx vitest run src/lib/adapters/browser-keychain-adapter.test.ts src/lib/adapters/keychain-adapter.test.ts`
  — discriminating assertion: reverting the two added lines in `hasSecret` must fail
  "reports a stored key the vault can no longer decrypt as a fault, not as configured", and
  adding a decrypt to `hasSecret` must fail "does not decrypt to answer a status check".
- **Intent validation:** the owner reads the new `hasSecret` docblock and agrees the stated
  contract is exactly what the body does — in particular that "usable" is claimed about the
  vault and never about the record.

### 2. One authored-message path for both surfaces

- **Behavior:** loading the keychain adapter and rendering a keychain failure as user-safe text
  are done by one pair of functions that the settings panel and `chat-store` share. No
  behaviour changes.
- **Files:** `src/lib/adapters/get-keychain-adapter.ts`,
  `src/components/panels/ai-settings-content.tsx`.
- **Implementation:**
  1. Move `ADAPTER_LOAD_ERROR` and `loadAdapter` (`ai-settings-content.tsx:17-33`) into
     `get-keychain-adapter.ts` as `KEYCHAIN_LOAD_ERROR` and `loadKeychainAdapter()`, keeping
     the `console.warn` and the authored rethrow verbatim.
  2. Move `errorText` (`:106`) there as `keychainErrorText(error: unknown): string`, keeping
     the `Error`-vs-string branch and its docblock — the Tauri adapter rejects with a string
     from `invoke`, which is why the branch exists.
  3. Point the panel at both. Delete the local copies.
  4. Note in the docblock that these are the only two ways a keychain failure becomes text a
     user reads, and that duplicating them is how the surfaces drift apart.
- **Targeted verification:** `npx vitest run src/components/panels/ai-settings-content.test.tsx`
  — the existing suite is the regression proof; every assertion about `ADAPTER_LOAD_ERROR` text
  and rendered failure messages (`:281`, `:303`) must pass unchanged.
- **Intent validation:** none beyond CI. This step changes no observable behaviour; if any
  panel test needed editing, something moved that should not have.

### 3. The settings panel says "could not be read", proven over a real damaged vault

- **Behavior:** the amber status reads "Key storage could not be read". On a real vault whose
  wrapping key is gone, the panel reports neither "API key configured" nor "No API key
  configured", renders the authored `VAULT_CORRUPT_MESSAGE`, and offers no removal control.
- **Files:** `src/components/panels/ai-settings-content.tsx`,
  `src/components/panels/ai-settings-content.test.tsx`, new
  `src/components/panels/ai-settings-damaged-vault.test.tsx`.
- **Implementation:**
  1. Change `STATUS_TEXT.unknown` (`:80`) to `"Key storage could not be read"` and update the
     `KeyStatus`/`statusToneOf` docblocks (`:47-75`) to say what `"unknown"` now means: a check
     that failed *or* answered that this browser cannot read storage.
  2. Update the two references in `ai-settings-content.test.tsx` (`:219` assertion, `:246`
     comment).
  3. Add the end-to-end test file. It is separate from the panel suite deliberately: it needs
     `import "fake-indexeddb/auto"` and a real `BrowserKeychainAdapter`, and installing a
     global IndexedDB into the 800-line mocked suite would change the environment for tests
     that must not have one. `src/lib/persistence/no-key-leakage.test.ts` is the precedent for
     a property-named test file that composes real storage with rendered components.
  4. The test mocks `@/lib/adapters/get-keychain-adapter` to return a real
     `new BrowserKeychainAdapter()`, seeds a key through it, damages the vault with the
     extracted `writeWrapKeyStore([])`, renders `<AiSettingsContent />` inside `act`, and
     asserts:
     - `screen.queryByText("API key configured")` is null
     - `screen.queryByText("No API key configured")` is null
     - `screen.getByText("Key storage could not be read")` is present
     - the message block contains the authored sentence
       (`/Encrypted key storage in this browser is damaged/`)
     - `screen.queryByRole("button", { name: "Remove API key" })` is null
     - the rendered document contains no `DOMException`/internal detail — assert the message
       block's text equals the authored sentence exactly, which is the AC 5 check that cannot
       pass on a leaked raw error.
  5. Add a second case in the same file: a healthy vault with a stored key still renders "API
     key configured", so the file proves the fault path did not simply break the happy path.
- **Targeted verification:**
  `npx vitest run src/components/panels/ai-settings-content.test.tsx src/components/panels/ai-settings-damaged-vault.test.tsx`
  — discriminating assertion: reverting step 1 makes the damaged-vault case render "API key
  configured" and fail on the first assertion.
- **Intent validation:** the owner opens AI settings in a browser profile whose wrap key has
  been removed via devtools and confirms the panel reads as a fault with the remedy, that
  "Remove API key" is absent, that the input is labelled "API Key" rather than "Replace API
  Key", and that saving a fresh key recovers the vault in place (which it does —
  `installWrapKey`'s `"always"` policy, pinned by `browser-keychain-adapter.test.ts:631`).

### 4. `chat-store` stops turning a fault into an absence

- **Behavior:** when the keychain check rejects, `checkApiKey` sets `hasApiKey: false` — no
  request can be signed, which is true — **and** records the authored message in a new
  `keyFault: string | null`. When it resolves, `keyFault` is cleared. An adapter that fails to
  load produces the authored `KEYCHAIN_LOAD_ERROR`, never a bundler message.
- **Files:** `src/stores/chat-store.ts`, `src/stores/chat-store.test.ts`.
- **Implementation:**
  1. Add `keyFault: string | null` to `ChatState` with a docblock stating why it is separate
     from `error` (that one is "the last request failed"; this one is "storage cannot be read",
     and it exists before any request) and separate from `hasApiKey` (that one gates sending).
  2. In `checkApiKey`, load the adapter with `loadKeychainAdapter()` and render any rejection
     with `keychainErrorText()` from step 2, so nothing unauthored can reach this field.
  3. On success: `set({ hasApiKey, keyFault: null })`. On rejection:
     `set({ hasApiKey: false, keyFault: <authored text> })`.
  4. Leave the trailing `refreshResidue(provider)` call and its comment exactly as they are —
     `#233` depends on that ordering and on it running after both outcomes.
- **Tests to add** in `chat-store.test.ts` (extend the existing module-scoped keychain mock
  with a rejection knob rather than adding a second mock):
  - `it("does not report a vault it cannot read as no key configured")` — `hasKey` rejects with
    the authored damaged-vault sentence; assert `hasApiKey === false` **and** `keyFault` is
    that exact sentence.
  - `it("clears the storage fault once the check answers again")` — reject, then resolve
    `true`; assert `keyFault` is `null` and `hasApiKey` is `true`.
  - `it("re-reads the clear-text slot even when the key check failed")` — assert the residue
    refresh still runs after a rejection, so `#233`'s guarantee is not conditional on success.
- **Targeted verification:** `npx vitest run src/stores/chat-store.test.ts` — discriminating
  assertion: reverting the `catch` to `set({ hasApiKey: false })` leaves `keyFault` null and
  fails the first test.
- **Intent validation:** the owner confirms `hasApiKey` still means exactly "a request can be
  signed" and that nothing now gates sending on `keyFault`.

### 5. The AI chat tab reports the fault instead of claiming there is no key

- **Behavior:** when `keyFault` is set, the chat tab renders a fault state — the shared heading
  "Key storage could not be read", the authored message beneath it, and a button into AI
  settings — instead of the "No API key configured" empty state. With no fault, the empty state
  is byte-for-byte what it is today.
- **Files:** `src/components/panels/ai-chat-tab.tsx`,
  `src/components/panels/ai-chat-tab.test.tsx`.
- **Implementation:**
  1. Read `keyFault` from `useChatStore` beside `hasApiKey` (`:56`).
  2. Change the branch at `:121` to: `keyFault ? <KeyStorageFault … /> : !hasApiKey ?
     <EmptyState … /> : <ChatView />`. The fault outranks the absence because it is the
     stronger and truer claim, mirroring `statusToneOf`'s documented precedence in the panel.
  3. Add `KeyStorageFault({ message, onConfigure })` next to `EmptyState`: `role="alert"`,
     `data-testid="key-storage-fault"`, an amber `AlertTriangle`, the heading `Key storage
     could not be read`, `{message}` rendered verbatim as the body, and a button labelled
     `Open AI settings` wired to `openAiSettings`.
  4. Copy check against `docs/knowledge/product-voice.md`: the fact comes first, nothing in an
     error is allowed to be funny, and the button promises only what it does — it opens
     settings; it does not promise a fix, because for an `unavailable` fault entering a key
     does not help. The remedy itself is the vault's authored sentence, not new copy.
  5. Amber, not destructive red, for the same hierarchy reason recorded in the decision
     section.
- **Tests to add** in `ai-chat-tab.test.tsx` (the existing mock at `:35` already returns a
  keychain stub; give it a rejection knob):
  - `it("shows the storage fault instead of claiming no key is configured")` — `hasKey`
    rejects; assert the authored sentence is on screen and `screen.queryByText("No API key
    configured")` is null.
  - `it("still shows the empty state when storage answers that there is no key")` — `hasKey`
    resolves `false`; assert the existing empty state is unchanged. Without this, the fault
    branch could swallow the ordinary path and no test would notice.
- **Targeted verification:**
  `npx vitest run src/components/panels/ai-chat-tab.test.tsx` then
  `npx playwright test e2e/ai-chat.spec.ts e2e/empty-states.spec.ts` — both specs assert the
  right panel contains "No API key configured" (`e2e/ai-chat.spec.ts:10`,
  `e2e/empty-states.spec.ts:31`), so they are the guard that the no-key path did not move. Stop
  the Playwright web server when the run ends.
- **Intent validation:** the owner opens the AI tab on a damaged-vault profile and confirms the
  chat surface and the settings panel state the same thing in the same words, and that the
  button lands on the AI settings tab.

### 6. Sweep for surfaces that still read a rejection as absence

- **Behavior:** no remaining caller of `hasKey` collapses a rejection into "no key".
- **Files:** read-only sweep; edits only if the sweep finds something.
- **Implementation:** `rg "hasKey\(" src e2e` and confirm each caller:
  `ai-settings-content.tsx:295` and `:435` (already `"unknown"`), `chat-store.ts:523` (step 4),
  `app-layout.tsx:83` (`allSettled`, migration-only, deliberately does not commit the answer —
  leave it, and confirm the launch path still creates no keychain database for a slot-free
  profile). Record the result in the PR body; do not add a defensive branch anywhere the sweep
  finds nothing.
- **Targeted verification:** `npx vitest run src/components/layout` and `npx tsc --noEmit`.
- **Intent validation:** the owner reads the sweep result in the handoff and agrees no surface
  was missed.

## Cross-cutting requirements

- **Security and privacy:** the trust boundary is the browser key vault. Every rejection that
  leaves it is authored inside `browser-key-vault.ts` and remapped by `withVault:495-505`, so
  no raw `DOMException` and no ciphertext can reach a surface; step 3 asserts the rendered
  sentence exactly, which is what makes AC 5 a test rather than an assurance. No path added by
  this plan writes, deletes, or decrypts anything: the status check is strictly read-only, and
  the deliberate refusal to delete on a render path is the core of the decision. `keyFault`
  holds an authored sentence, never key material, and lives in memory only — it is never
  persisted, exactly as `key-residue-store.ts` documents for residue.
- **`.thf` compatibility:** untouched. No schema, no serialization, no migration.
- **Browser and desktop:** the difference is intentional and documented in the interface
  docblock. The browser vault establishes decryptability at status time because it can lose a
  wrapping key while keeping records; desktop cannot reach that state, because `KeyStorage::new`
  decrypts at startup and setup fails otherwise. No Rust, no capability, no IPC change.
- **AI safety:** unchanged. This plan touches credential *status*, not model output, tool
  execution, approval, or undo.
- **Accessibility and UX:** the fault state uses `role="alert"`, matching
  `ClearTextKeyNotice`. Colour is never the sole carrier — the heading text states the
  condition, and the amber pairs `text-amber-600 dark:text-amber-400` for both themes as the
  panel already does. The new button is a real `<button>` in tab order.
- **Observability and evidence:** the PR records the sweep from step 6, the passing
  `does not decrypt to answer a status check` test as the evidence for the stated cost, and a
  before/after screenshot of both surfaces on a damaged-vault profile.

## Verification gate

Targeted, in order:

```bash
npx vitest run src/lib/adapters/browser-keychain-adapter.test.ts src/lib/adapters/keychain-adapter.test.ts
npx vitest run src/components/panels/ai-settings-content.test.tsx src/components/panels/ai-settings-damaged-vault.test.tsx
npx vitest run src/stores/chat-store.test.ts src/components/panels/ai-chat-tab.test.tsx
npx tsc --noEmit
npx biome check .
```

Then the full gate:

```bash
npm run ci:local
```

E2E is opt-in in `scripts/ci-local.sh` (`--e2e`). The chat empty state is on two specs, so run
them before handoff — either `npm run ci:local -- --e2e` or the two specs directly:

```bash
npx playwright test e2e/ai-chat.spec.ts e2e/empty-states.spec.ts
```

Only one lane runs a full-suite command at a time, and any Playwright web server started for
these specs is stopped when the run ends (`AGENTS.md`, "Local machine resources").

## Owner validation

Green CI cannot decide any of these.

1. **Is the trade the right one?** The fix leaves the single-damaged-record case reporting
   "API key configured" until the next request. The plan argues that is better than a status
   check that deletes key material. The owner is the one who accepts that residual.
2. **Copy.** Two user-visible strings are proposed here and neither is dictated by the issue:
   the panel's `"Key storage could not be read"` (replacing `"could not be checked"`) and the
   chat tab's fault heading plus the `Open AI settings` button label. Read them aloud on both
   surfaces at once; they are meant to be the same sentence in two places.
3. **Recovery still exists and is discoverable.** On a damaged vault the panel now hides
   "Remove API key" (status is no longer `true`). The way out is saving a fresh key, which
   works — `installWrapKey`'s `"always"` policy clears the stranded records and mints a new
   wrapping key. Walk it: damage the vault, open settings, read the message, save a key, send a
   request. If that path does not feel obvious from what is on screen, the remedy sentence is
   the thing to change, not the status logic.
4. **A false alarm costs a status, not a credential.** Two tabs racing — one wiping or minting
   a wrapping key between this check's `count` and its wrap-key read — can produce a fault
   report for a vault that is fine. Nothing destructive follows from it and a re-check clears
   it. Confirm that is acceptable rather than worth a single-transaction read.
5. **Launch behaviour is unchanged.** A profile with no clear-text slot must still create no
   keychain database at launch. Confirm on a fresh browser profile with devtools open.

## Follow-up issues to file (not sub-issues, not in scope)

Both are new issues linked to `#234`, filed at handoff, not folded in.

1. **`migrateLegacyKey` erases the clear-text slot on a declined import without proving the
   stored record is readable.** This is the hazard recorded in the second comment on `#234`.
   `importLegacySecret` declines whenever a record already exists for the provider —
   decryptable or not (`browser-key-vault.ts:795`) — and `migrateLegacyKey` then calls
   `removeLegacyKey` regardless (`browser-keychain-adapter.ts:133`), so a user with a damaged
   record plus a surviving clear-text slot loses their last readable copy. `#233` made this
   reachable at launch. It is a **separate defect on the erase path**, not the status path:
   none of `#234`'s acceptance criteria mention it, its fix necessarily costs a decrypt (the
   only way to "prove the stored record is readable"), and it needs its own tests. Note what
   this plan does to it: the `vault-corrupt` half is already refused before the erase
   (`browser-key-vault.ts:793`) and step 1 does not change that path at all, so the remaining
   exposure is exactly the per-record case. The comment's conclusion stands and should be
   quoted in the new issue: the fix belongs in `migrateLegacyKey`, not in any caller's gate.
2. **`VAULT_CORRUPT_MESSAGE` prescribes a remedy the app no longer needs.** It says "Clear this
   site's browser data, then add your API key again", but saving a key recovers the vault in
   place — `installWrapKey` under `"always"` clears the stranded records and mints a new key,
   pinned by `browser-keychain-adapter.test.ts:631` ("lets the user store a new key after the
   wrapping key is lost"). The message therefore sends a user to destroy their saved threat
   models (`CLEARING_SITE_DATA_COST`) for something re-entry fixes. This plan deliberately does
   not touch it: AC 1 names that exact string as what must render, and changing safety copy
   under a bug fix hides the change. File it as its own copy issue with the test as evidence.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [ ] Security auditor — required. Cryptography, key storage, and a trust boundary
      (`.github/instructions/security.instructions.md` applies to `src/lib/adapters/**`).
- [ ] Threat-model expert — not applicable. No `.thf` schema, STRIDE, or threat-quality
      surface is touched.

## Replan log

Append changes; do not rewrite prior decisions.

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-27 | Initial plan | Issue `#234` and its two comments; `main` at `24fc808`; source read at `browser-key-vault.ts:608-647`, `browser-keychain-adapter.ts:123-228`, `keychain-adapter.ts`, `tauri-keychain-adapter.ts`, `ai_commands.rs:19-56`, `keychain.rs:31-123`, `lib.rs:52-57`, `ai-settings-content.tsx:47-121,283-334,556-616`, `chat-store.ts:512-534`, `ai-chat-tab.tsx:56-145`, `app-layout.tsx:61-94`, `browser-chat-adapter.ts:327-346`; existing coverage read at `browser-keychain-adapter.test.ts:456-800,1221-1259,1770-1810` and `ai-settings-content.test.tsx:50-330`; `browser-keychain-adapter.test.ts:1222` executed green as proof that `hasKey` returns `true` on a vault `getKey` refuses |

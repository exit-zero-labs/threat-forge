# Issue 233 — Surface a surviving clear-text API key persistently in AI settings

## Objective

When a browser refuses to erase the pre-#133 clear-text `localStorage` slot, ThreatForge tells
the user — for as long as the slot is readable, on every mount, in a surface they will actually
encounter — that a usable API key is still sitting in clear text in this browser, distinguishes
"definitely still there" from "the check was blocked", and keeps a retry reachable. It never
again claims "No API key configured" while a readable clear-text copy exists.

## Issue contract

- **Issue:** `#233`
- **Parent initiative:** `N/A` (related: `#133`, `#231`, `#234`)
- **Type:** `Bug`
- **Effort:** `High` (trust boundary and key handling; tier is a floor per `AGENTS.md`)
- **Priority:** `Urgent` (shipped code misreports secret deletion)
- **Autonomy:** labelled `AUTO`; **see "Human blockers"** — one owner decision gates step 5, and
  steps 1–4 are `AUTO` once it is made
- **Dependencies:** `#133` (merged; introduced the encrypted vault, the erasure read-back, and
  the `legacy-retained` reason this issue makes persistent)
- **Non-goals:**
  - Changing `deleteKey`'s rejection, the migration guards, the retirement markers, or any
    `browser-key-vault.ts` behavior. #133's fail-closed posture is preserved exactly.
  - Relaxing the `unverified` answer into "probably absent". Failing closed is the recorded
    stance (issue comment, round-12 security review).
  - Overwriting or neutering the clear-text slot in place. See "Follow-up issues".
  - The adjacent `hasKey === true` / undecryptable-record case, which is `#234`.
  - Any Rust, IPC, `.thf`, or AI-protocol change.

## Human blockers

1. **The UI surface is an owner decision.** The issue says so ("The right surface is a design
   decision, not a mechanical one"). Four options are specified below with a recommendation.
   Steps 1–4 are identical under all four; step 5 exists only for options B, C, and D.
   **Resolved 2026-07-27:** the owner delegated the choice to the implementer, who took the
   recommended Option B, so step 5 is in scope and no longer conditional. See the replan log.
2. **Autonomy label.** `AUTO` is accurate only after (1) is answered. If the owner prefers to
   answer it inside the PR rather than before, the issue should carry `HITL`. Recording it
   rather than changing metadata, per the planner contract.

## Current behavior and evidence

Verified against `main` at plan time. Line references are to the files as they stand.

**The vault (`src/lib/adapters/browser-key-vault.ts`).** A browser key is AES-GCM ciphertext in
the `threatforge-keychain` IndexedDB database under a non-extractable wrapping key.
`KeyVaultError` carries a closed `KeyVaultErrorReason` union that includes
`typeof LEGACY_RETAINED`.

**The legacy slot (`src/lib/adapters/browser-keychain-adapter.ts`).** The pre-#133 clear-text
`localStorage` slot is `tf-api-key-<provider>` (`LEGACY_KEY_PREFIX`, line 18). Three internal
pieces matter here and already exist:

```ts
type LegacySlot =
	| { readonly state: "present"; readonly value: string }
	| { readonly state: "absent" }
	| { readonly state: "unreadable" };

function readLegacySlot(provider: AiProvider): LegacySlot

type LegacyErasure = "erased" | "retained" | "unverified";
function removeLegacyKey(provider: AiProvider): LegacyErasure
```

`readLegacySlot` returns `unreadable` when `localStorage.getItem` throws — the file's own comment
says collapsing `absent` and `unreadable` "lets the adapter report a live clear-text credential
as erased". `removeLegacyKey` decides on the read-back, not on the `removeItem` call.

`deleteKey` erases the slot **first**, then commits `retireAndDeleteSecret(provider)`, then
throws when `erasure !== "erased"` with one of two authored messages ("would not delete an older
clear-text copy" for `retained`, "blocked the check for an older clear-text copy" for
`unverified`). `setKey` calls `removeLegacyKey` and deliberately ignores the result. `hasKey` and
`getKey` run `migrateLegacyKey`, which — because a `REVOKED` marker makes `importLegacySecret`
return early and `removeLegacyKey` then runs unconditionally — **already retries the erase on
every read**. That is why a browser that starts allowing removal heals itself on the next panel
mount, and why a residue read must be ordered after the `hasKey` calls, not before.

The class docblock records the deferral verbatim: *"Surfacing it persistently in settings is
#233."*

**The interface (`src/lib/adapters/keychain-adapter.ts`).** Exactly three members, plus a shared
reason constant:

```ts
export interface KeychainAdapter {
	/** Store an API key for a provider. */
	setKey(provider: AiProvider, key: string): Promise<void>;
	/** Check if an API key exists for a provider. */
	hasKey(provider: AiProvider): Promise<boolean>;
	/** Delete an API key for a provider. */
	deleteKey(provider: AiProvider): Promise<void>;
}

export const LEGACY_RETAINED = "legacy-retained";
```

`getKey` is deliberately **absent** so that asking a desktop adapter for a key is a build
failure; `keychain-adapter.test.ts` pins that with `@ts-expect-error` plus a runtime `TypeError`
assertion, and `browser-chat-adapter.ts:330` reaches the browser-only capability by constructing
`new BrowserKeychainAdapter()` directly from a browser-only module. That precedent is the
starting point for the contract below — and, as argued there, it does not transfer unchanged.

**The panel (`src/components/panels/ai-settings-content.tsx`).** `keyStatus` is component state,
`Record<AiProvider, boolean>`. The mount effect settles both providers with
`Promise.allSettled` and surfaces a rejection through `setMessage` (the swallow the issue body
cites at lines 61-63 was fixed in #133 preflight round 9; the first issue comment records this).
`handleDelete` treats a `LEGACY_RETAINED` rejection as a successful removal plus a message. The
status row renders `keyStatus[provider] ? "API key configured" : "No API key configured"`, and
the Remove button is gated on `keyStatus[provider]`. `message` is one-shot: `handleSave` and
`handleDelete` both call `setMessage(null)` on entry, and the panel unmounts when the settings
dialog closes (`settings-dialog.tsx` renders `AiSettingsContent` under `settingsDialogOpen`).

So the reported state is lost on the next action or the next dialog close, and what remains
contradicts it. That is the whole bug.

**Escalation surfaces that already exist.** `StatusBar` (`src/components/layout/status-bar.tsx`)
carries a persistence indicator with an `attention` flag, a `title` detail, and an always-mounted
`role="status"` `sr-only` live region that announces only attention states. `UpdateBar`
(`src/components/layout/update-bar.tsx`) is a dismissible full-width bar rendered by `AppLayout`
directly under `TopMenuBar`. `useSettingsStore` exposes
`openSettingsDialogAtTab: (tab: SettingsTab) => void` with `"ai"` among its tabs — that is the
routing action any escalated surface uses.

**Test ground truth.** `src/lib/adapters/test-fixtures/key-vault.ts` exports
`resetKeyVault(): void`, which replaces `globalThis.indexedDB` with a fresh `IDBFactory`; its
docblock states that `localStorage.clear()` does not touch IndexedDB, so a suite relying on it
alone carries a key between cases. `browser-keychain-adapter.test.ts` already has
`refuseLegacyRemoval()` (a `Storage.prototype.removeItem` no-op spy, ~line 804) and a
`getItem`-throws spy (~line 927) — the two fakes this issue needs. `ai-settings-content.test.tsx`
mocks `@/lib/adapters/get-keychain-adapter` and never touches IndexedDB; that stays true.

## The capability contract

### Decision

Add **one optional method and one exported type** to `src/lib/adapters/keychain-adapter.ts`.
`TauriKeychainAdapter` does not implement it and does not mention it.

```ts
/**
 * What a pre-#133 clear-text API key slot currently holds for one provider.
 *
 * `null` is an answer, not an absence of one: the slot was checked and nothing is there.
 * A caller that cannot get an answer at all sees `undefined` from the optional call instead —
 * see {@link KeychainAdapter.readLegacyResidue}.
 */
export type LegacyResidue = "retained" | "unverified" | null;

export interface KeychainAdapter {
	/** Store an API key for a provider. */
	setKey(provider: AiProvider, key: string): Promise<void>;
	/** Check if an API key exists for a provider. */
	hasKey(provider: AiProvider): Promise<boolean>;
	/** Delete an API key for a provider. */
	deleteKey(provider: AiProvider): Promise<void>;
	/**
	 * Browser only. Report whether a pre-#133 clear-text copy of this provider's key is still
	 * readable from `localStorage`, without attempting to erase it and without returning any
	 * part of the key.
	 *
	 * Optional because a platform that never had a clear-text slot has nothing to answer.
	 * `undefined` from the optional call is "there is no such storage location here"; `null` is
	 * "there is one, it was checked, and it is empty". Collapsing those two is the same mistake
	 * `readLegacySlot` refuses to make one level down, and it is what would let a desktop build
	 * assert an erasure it never performed.
	 */
	readLegacyResidue?(provider: AiProvider): Promise<LegacyResidue>;
}
```

`browser-keychain-adapter.ts` implements it as a pure read under the existing per-provider lock:

```ts
async readLegacyResidue(provider: AiProvider): Promise<LegacyResidue> {
	return withProviderLock(provider, async () => {
		const slot = readLegacySlot(provider);
		if (slot.state === "absent") return null;
		return slot.state === "present" ? "retained" : "unverified";
	});
}
```

### Why this shape

**Why not "required on every adapter, Tauri returns `null`".** `null` is load-bearing: it is the
exact value every consumer uses to hide the warning. A Tauri implementation returning it would be
asserting *"I checked this provider's clear-text slot and it is empty"* about a storage location
that does not exist on desktop, where the key lives in an encrypted file behind `KeyStorage` and
never enters the webview. That is a false claim with the same structure as the bug this issue
fixes — a security surface reporting a check it did not perform. It would also be dead
scaffolding (`AGENTS.md` anti-slop: "impossible defensive branches and dead scaffolding"): a
method whose body is `return null` forever, that no Rust command backs, that no test can
meaningfully exercise, and that a future desktop maintainer would reasonably read as an
obligation to implement. And it hands every future adapter an obligation it cannot fulfil
honestly.

**Why not "browser-only method off the interface entirely", the `getKey` precedent.** `getKey`
stays off `KeychainAdapter` because *reaching it must be impossible* — the invariant is that the
desktop key never enters the webview, so making the request a build failure is the point, and its
one caller (`browser-chat-adapter.ts`) is itself a browser-only module that can import
`BrowserKeychainAdapter` directly. Neither condition holds here. The residue read is not
dangerous — it returns a three-value token, never key material — so there is nothing to forbid.
And its caller is `ai-settings-content.tsx`, a **shared** component that renders on both
platforms and holds a `KeychainAdapter` from `getKeychainAdapter()`. Reaching a browser-only
method from there would mean either a static import of `BrowserKeychainAdapter` — which the
panel's own comment already rules out, "which would pull IndexedDB code into the desktop bundle"
— or a runtime `"readLegacyResidue" in adapter` narrowing, which under `strict` narrows the
member to `unknown` and forces a cast to call it. A cast is exactly the type escape the slop
guardrails name, and it would erase the platform difference from the type system at the one
callsite that has to reason about it.

**What the optional method buys.** `adapter.readLegacyResidue?.(provider)` types as
`Promise<LegacyResidue> | undefined` with no cast, no `any`, and no `in` check. The `?.` is not
ceremony: it is the callsite acknowledging, visibly and at compile time, that this platform may
not have a legacy slot at all. The union stays closed, so a typo in a residue value is a build
error the same way `LEGACY_RETAINED`'s inferred literal type keeps `KeyVaultErrorReason` closed
(pinned by an existing test in `keychain-adapter.test.ts`). And the desktop adapter genuinely
does not carry the method, so `"readLegacyResidue" in new TauriKeychainAdapter()` is `false` —
the same runtime assertion the file already makes about `getKey`.

**Method shorthand, not a property signature.** `readLegacyResidue?(p): Promise<LegacyResidue>`
matches the three existing members' style. Method shorthand is bivariant under
`strictFunctionTypes` while a property signature would be contravariant; with a single-parameter,
single-implementation capability there is no variance hazard to trade for the inconsistency.

**Why `Promise`, when `localStorage` is synchronous.** Because it takes `withProviderLock`.
`migrateLegacyKey` erases the slot *after* `importLegacySecret` commits, so a synchronous read
interleaved into that gap reports `retained` for a slot that is about to be erased — a false
alarm on the ordinary upgrade path, on first mount, for every pre-#133 user. Taking the lock
makes the answer reflect a settled adapter state. It also matches the interface's uniform async
shape, so consumers do not branch on call style.

**The one hazard this creates:** `readLegacyResidue` must never be called from inside a
`withProviderLock` callback — the lock is a promise chain, not reentrant, so a nested call would
deadlock that provider's queue forever. No planned callsite does this (all callers are the store
and the panel, outside the adapter). Recorded here and as a code comment.

**What it must never do:** return, log, or store `slot.value`. The residue state is a token. The
adapter reads the value only to distinguish `present` from `absent`, and discards it in the same
expression.

**Why not derive it from the thrown `KeyVaultError`.** Acceptance criterion 1 rules it out, and
for a reason worth restating: an error is produced only by an action. A user who missed the
banner, or who has residue from a `setKey` that silently failed to erase, never triggers one. A
capability answers on demand; an exception answers once.

## State flow

**Home: a new Zustand store, `src/stores/key-residue-store.ts`.** Not component state, not
`chat-store`.

```ts
interface KeyResidueState {
	/** Per-provider clear-text residue. `null` also covers "not checked yet" and desktop. */
	residue: Record<AiProvider, LegacyResidue>;
	/** Re-read one provider's slot through the keychain adapter. Never throws. */
	refreshResidue: (provider: AiProvider) => Promise<void>;
	/** Re-read every provider. */
	refreshAllResidue: () => Promise<void>;
}

export const useKeyResidueStore = create<KeyResidueState>()(/* ... */);
```

- **Not component state**, because the panel unmounts with the settings dialog and every option
  except A needs a second surface to read the same fact. Under option A alone the store is still
  the better home — three writers (mount, save, delete) and one reader is already the shape a
  store exists for — but if the owner picks A, an implementer may collapse it to `useState` in
  the panel without violating this plan. Every other option requires the store.
- **Not `chat-store`**, whose `hasApiKey` answers "can I send a request". Residue is the
  opposite: a key that is *not* usable by the transport and is a storage-hygiene problem.
  Folding it in would make a conversation store carry a security surface and would tempt a future
  reader to gate requests on it. This is about where the state *lives*, not who may refresh it:
  `chat-store.checkApiKey` does call `refreshResidue` after its `hasKey`, because that `hasKey`
  runs the migration and would otherwise erase a slot with nothing left to notice. It reads
  through the residue store's action and holds no residue state of its own.
- **No `persist` middleware, deliberately.** Residue is derived from storage and must be
  re-derived every session; a persisted copy is a stale claim about a secret. Worse, the
  persistence target would be `localStorage` — the storage that is, by hypothesis, refusing
  writes. #133 records the same reasoning for putting the retirement marker in the vault: *"a
  browser that refuses to erase the clear-text slot cannot be trusted to hold a note saying it
  was dismissed."* The same applies to any dismissal state an option below introduces: dismissal
  is in-memory and session-scoped, never persisted.
- **`refreshResidue` never rejects.** It loads the adapter via `getKeychainAdapter()`, calls
  `adapter.readLegacyResidue?.(provider)`, and writes the result; when the method is absent it
  writes `null`. If it cannot get an answer at all — the adapter *module* fails to load, or the
  read itself throws — it leaves the previous value untouched and returns. It does not write
  `null`, because neither "the bundle did not load" nor "the read was refused" is evidence the
  slot is empty. A module-load failure already reaches the user through the panel's
  `ADAPTER_LOAD_ERROR` path and the launch effect's own `console.warn`, so nothing is swallowed
  that is not reported elsewhere.

**When it is read.**

| Trigger | Where | Why |
|---|---|---|
| Panel mount, **after** both `hasKey` calls settle | `ai-settings-content.tsx` mount effect | `hasKey` runs `migrateLegacyKey`, which retries the erase; reading first would report a slot that the same tick removed |
| After `handleSave`, success or failure | `handleSave` `finally` | `setKey` attempts `removeLegacyKey` and ignores the outcome, so a save can both clear residue and (on a refusing browser) leave it |
| After `handleDelete`, success **and** the `LEGACY_RETAINED` branch **and** any other error | `handleDelete` `finally` | This is the state transition the issue is about; the `finally` also covers a vault error thrown after the slot was already erased |
| After `handleRecheck`, success or failure | `handleRecheck` `finally` | The notice's only control. Its `hasKey` runs the migration, so this is the read that clears the warning when a browser finally allows the erase — and the value it writes is what the retry report is derived from |
| After `checkApiKey`'s `hasKey` settles | `chat-store.ts` | `ai-chat-tab.tsx` calls it on mount, which runs the migration outside both the launch effect and the settings panel. Without this read, opening the chat tab can erase the slot while the status bar keeps a standing warning for the rest of the session |
| Once at app start, browser only, **and only if a slot is actually there** | `AppLayout` effect | The user may never open AI settings — the whole point of escalating. Gated on a `localStorage` probe so a profile with no clear-text slot never opens the keychain database |

Two of those triggers live outside the settings panel, which is why `RESIDUE_PROVIDERS` is
exported rather than re-typed per caller.

**How it clears.** Nothing clears it manually. Every refresh recomputes from storage, so the
warning disappears the moment the slot reads `absent`: after a successful retry, after a mount
whose `hasKey` migration finally erased it, or after the user clears site data and reloads. There
is no dismissal that survives a session and none that survives a reload.

**Guard for the mount effect.** The existing `mutated` ref exists so a slow `hasKey` cannot
overwrite a save or delete the user just performed. Residue does not need it: `refreshResidue`
reads storage directly and its answer is always the newest one at the moment it resolves, and the
per-provider lock orders it behind any in-flight adapter operation. Do not extend `mutated` to
cover it — that would suppress a fresh true answer.

**AC4 in the status row.** `keyStatus` is not a boolean. It carries `"unknown"` for a `hasKey`
that rejected and `"unchecked"` until the mount check answers, because both used to collapse to
`false` and be reported as a fact about storage that had not been established (replan log rows
*"`keyStatus` gained a third state"* and *"`keyStatus` gained a not-yet-checked state"*):

| `keyStatus` | `residue` | Dot | Text |
|---|---|---|---|
| `true` | any | green | `API key configured` |
| not `true` | `"retained"` | destructive | `Clear-text API key still in this browser` |
| `"unknown"` | `"unverified"` or `null` | amber | `Key storage could not be checked` |
| `"unchecked"` | `"unverified"` or `null` | muted | `Checking key storage…` |
| `false` | `"unverified"` or `null` | muted | `No API key configured` |

`unverified` keeps "No API key configured" because it *is* the honest summary — nothing is known
to be readable — and the separate notice carries the uncertainty. AC4 speaks only of a *readable*
copy.

**AC5, the retry path.** Every residue notice carries one control, bound to its own provider,
and it calls `handleRecheck` unconditionally: `hasKey`, then a residue re-read. It is labelled
`Try removing it again`, which is what `hasKey` does — it runs `migrateLegacyKey`, which retries
the erase — and it carries no destructive iconography. If the re-read still finds a reading, the
panel authors the report `deleteKey` used to make through its rejection, and both readings get
one. `retained` says the browser still would not delete the slot. `unverified` says the check is
still blocked, that nothing was removed, and that whether a copy is there is still unknown —
which is literally what happened, because `migrateLegacyKey` returns before it touches the slot
when the read is refused. `unverified` is the reading that never resolves on a blocked-storage
profile, so it is the one where a silent control does the most damage: same notice, no message,
nothing to show the click did anything.

Nothing in a notice may reach `deleteKey`, and a regression test asserts that across every
combination of `keyStatus` and residue. The `Remove API key` button keeps its existing
`keyStatus[provider] === true` gate.

This supersedes the earlier instruction to widen that gate to
`keyStatus[provider] || residue[provider] !== null` and route the retry through `handleDelete`.
That shape was unsafe twice over — see the replan log rows *"the removal control is gated on
`keyStatus === true || residue === "retained"` and split in two"* and *"the destructive residue
control is removed entirely"*. In short: it decided from a render-time snapshot that a second
tab or a pending mount check can invalidate, and `deleteKey` bought nothing there anyway, because
in that state a retirement marker already stands and `migrateLegacyKey` runs `removeLegacyKey`
unconditionally after a declined import.

**Considered and rejected as the offered action:** having the app call `localStorage.clear()`. If
`removeItem` is refused, `clear()` has no reason to succeed, and on the paths where it would it
destroys unrelated settings and onboarding state to remove one slot. The app genuinely cannot fix
this itself; the copy says so and points at the browser's own site-data control. Overwriting the
slot in place is a real alternative and is filed as a follow-up rather than smuggled in here.

## The UI surface — four options for the owner

All four share the same substrate (steps 1–4) and the same copy rules below; they differ in
placement, persistence, dismissibility, and whether they escalate outside the panel.

### Shared copy (applies to every option)

Fact first, no blame, one concession — per `docs/knowledge/product-voice.md`. Both `deleteKey`
messages and both notices carry the same concession sentence, from one shared constant
(`CLEARING_SITE_DATA_COST`): the only remedy the app can offer for a slot the browser will not
erase is clearing site data, and in this browser that also destroys the user's saved threat
models. See the replan log row *"the site-data instruction states what it costs"*.

*`retained`, provider named:*
> **A clear-text Anthropic API key is still stored in this browser.**
> It was saved before ThreatForge encrypted keys, and this browser will not delete it. Anything
> that can read this site's storage can read the key. Clear this site's browser data to remove
> it, and revoke the key with Anthropic if it may have been exposed.
> Clearing this site's browser data also removes the threat models saved in this browser, so
> export anything you need first.
> This copy is not a backup — ThreatForge erases it as soon as the browser allows.
> `[ Try removing it again ]`

The "not a backup" line is required: it is the round-13 security note folded into this issue's
scope, and it is what stops a user treating the retained slot as a recovery copy before a
`getKey` erases it.

*`unverified`, visibly calmer — amber, not destructive:*
> **ThreatForge could not check for an older clear-text Anthropic API key.**
> This browser blocked the check, so an unencrypted copy saved by an older version may or may
> not still be there. If you used ThreatForge in this browser before keys were encrypted, clear
> this site's browser data to be sure.
> Clearing this site's browser data also removes the threat models saved in this browser, so
> export anything you need first.
> `[ Try removing it again ]`

Both notices carry the same label, because both controls do the same non-destructive thing.

Neither string ever interpolates key material. Provider labels come from the existing `PROVIDERS`
list.

---

### Option A — In-panel standing notice, nothing outside the panel

The status row becomes the three-state row above, and directly beneath it a permanent bordered
block renders the copy while `residue[provider] !== null`. Not dismissible. Disappears only when
the read comes back `null`. `AppLayout`, `StatusBar`, and every non-AI surface are untouched.

- **Persistence:** for the life of the condition, but only inside the AI tab of the settings
  dialog.
- **Dismissible:** no.
- **Escalation:** none.
- **`retained` vs `unverified`:** colour (destructive vs amber), heading, and button label.
- **Action:** retry button plus the site-data instruction.
- **Cost:** one component, one store (or `useState`), zero new app chrome, smallest blast radius,
  no startup work, no new accessibility surface.
- **Weakness, and it is the issue's own words:** *"A user who revoked a possibly-compromised key
  and missed the one banner has no surface anywhere in the app telling them."* A notice inside a
  dialog they have no reason to reopen is strictly better than a one-shot banner and still leaves
  that user uninformed. This is the floor, not the answer.

### Option B — Option A plus a persistent status-bar indicator (recommended)

Everything in Option A, plus a `StatusBar` item rendered whenever **any** provider reads
`"retained"`: `Clear-text API key` in destructive text, with a `title` carrying the detail, as a
button that calls `openSettingsDialogAtTab("ai")`. It joins the existing always-mounted
`role="status"` `sr-only` region used for `attention` states, so it is announced once when it
first appears rather than on every render.

- **Persistence:** every session, every view, until the slot is gone. Survives dialog close,
  reload, and restart.
- **Dismissible:** no — and it costs the user nothing to leave standing, because the status bar
  is 24px of chrome that is already there.
- **Escalation:** yes, but quiet. `unverified` **does not** escalate: it stays in the panel only.
  That asymmetry is the design. The status-bar item means "a live credential is definitely
  readable in this browser"; the round-12 case, where a blocked-storage profile that never had a
  slot reports `unverified` forever, therefore cannot produce permanent app-wide chrome from a
  condition that may not exist.
- **Action:** clicking routes into the panel where the retry and the instructions live.
- **Cost:** the store becomes mandatory, `AppLayout` gains a browser-only startup refresh (which
  dynamically imports the keychain adapter chunk at launch instead of at first settings open —
  small, and worth measuring in step 5), and `StatusBar` gains its first interactive element, so
  focus order and hit target need checking.
- **Weakness:** a status bar is easy to not look at. It is a standing fact, not an interruption.

### Option C — Option A plus a non-dismissible global bar

Everything in Option A, plus a `KeyResidueBar` rendered in `AppLayout` beside `UpdateBar`,
following that component's structure: full-width, destructive rather than primary tinted, naming
the provider, with `[ Open AI settings ]` and `[ Recheck ]`. No dismiss control while
`"retained"`. `unverified` renders the same bar in amber **with** a session-scoped in-memory
dismiss.

- **Persistence:** every session until resolved; unmissable.
- **Dismissible:** only `unverified`, only for the session.
- **Escalation:** maximum. Proportionate to the actual severity — the user believes they deleted
  a possibly-compromised credential and it is readable on disk.
- **`retained` vs `unverified`:** colour, copy, and the presence of a dismiss control.
- **Action:** both actions inline.
- **Cost:** permanent vertical space in a canvas application, for a condition the user may be
  unable to resolve right now — clearing site data is a deliberate act with its own consequences
  (it drops the browser workspace). A user who cannot do it today gets an undismissable red bar
  every session, which is how banner blindness is manufactured, and which risks them clearing
  site data reflexively and losing work.
- **When this is right:** if the owner judges that a security tool misreporting secret deletion
  warrants interrupting every session until fixed, this is the honest expression of that. B→C is
  a one-component swap later, since both read the same store.

### Option D — Option A plus a once-per-session interruption

Everything in Option A, plus: on the first detection in a session — at app start, or immediately
after a delete leaves residue — a modal interrupts with the full explanation, `[ Recheck ]`, and
`[ Continue ]`. Dismissing it lasts for the session only; it returns next launch until resolved.
`unverified` never opens the modal.

- **Persistence:** returns every session, so it is not one-shot; between appearances the in-panel
  block is the standing record.
- **Dismissible:** yes, per session, in memory.
- **Escalation:** high signal at the moment of detection, zero permanent chrome.
- **Action:** the explanation and recheck are in the modal; the retry lives in the panel it links
  to.
- **Cost:** a startup modal is the most intrusive pattern in this app and would fire on a
  workflow that has nothing to do with AI. It also collides with the existing first-run overlays
  (`suppressFirstRunOverlays` in `e2e/fixtures.ts` exists because startup overlays are already a
  test hazard), and it needs focus-trap and restore handling. And once dismissed for the session,
  the user is back to a notice inside a dialog — so it does not actually dominate B.

### Recommendation: **Option B**

It is the only option that answers the issue's actual complaint — *the user may never reopen the
panel* — without either permanently occupying application chrome or interrupting unrelated work.
It reuses a surface that already exists and is already tested, including its accessibility
pattern, so the announced-once live region comes for free rather than being reinvented. It gives
the cleanest place to hold the `retained` / `unverified` line: the escalated surface carries only
the claim that is certain, which bounds the blast radius of the round-12 false positive to a
panel a user has to open. And if it proves too quiet in owner validation, C is reachable by
replacing one component that reads the same store, with no change to steps 1–4.

## Implementation steps

Steps 1–4 are common to all four options. Step 5 is written for Option B and notes the deltas.

### 1. Declare the capability

- **Behavior:** `KeychainAdapter` gains an optional `readLegacyResidue`; `LegacyResidue` is
  exported. No runtime behavior changes anywhere.
- **Files:** `src/lib/adapters/keychain-adapter.ts`.
- **Implementation:** add the type and the optional member exactly as quoted in "The capability
  contract", including the docblock explaining `undefined` vs `null`. Do not touch
  `tauri-keychain-adapter.ts`.
- **Targeted verification:** `npx tsc --noEmit` — `TauriKeychainAdapter` must still satisfy
  `KeychainAdapter` with no edit, which is the whole point of the optional member.
- **Intent validation:** the owner reads the docblock and agrees `undefined` and `null` are
  described as different claims rather than as a nullability convenience.

### 2. Implement it in the browser adapter

- **Behavior:** `BrowserKeychainAdapter.readLegacyResidue(provider)` resolves `"retained"` when
  the slot reads `present`, `"unverified"` when it reads `unreadable`, `null` when `absent`. It
  never erases, never writes, never returns key material, and never rejects.
- **Files:** `src/lib/adapters/browser-keychain-adapter.ts`,
  `src/lib/adapters/browser-keychain-adapter.test.ts`,
  `src/lib/adapters/keychain-adapter.test.ts`.
- **Implementation:** add the method as quoted, under `withProviderLock`. Add a comment stating
  it must not be called from inside another locked operation. Update the class docblock's #233
  deferral note to point at this method instead of at a future issue. Leave `readLegacySlot`,
  `removeLegacyKey`, `LegacyErasure`, `migrateLegacyKey`, `setKey`, `hasKey`, `getKey`, and
  `deleteKey` byte-identical.
- **Targeted verification:**
  `npx vitest run src/lib/adapters/browser-keychain-adapter.test.ts src/lib/adapters/keychain-adapter.test.ts`
  — see the test plan for the discriminating cases.
- **Intent validation:** the owner confirms no path can now erase a slot as a side effect of a
  read that did not already do so, and that the desktop adapter is untouched.

### 3. Add the residue store

- **Behavior:** `useKeyResidueStore` holds `Record<AiProvider, LegacyResidue>` and refresh
  actions that never reject, write `null` when the adapter has no such capability, and leave the
  previous value when the adapter module fails to load.
- **Files:** `src/stores/key-residue-store.ts` (new), `src/stores/key-residue-store.test.ts`
  (new).
- **Implementation:** plain `create<KeyResidueState>()`, no middleware, named export, initial
  `{ anthropic: null, openai: null }`. `refreshAllResidue` fans out over both providers with
  `Promise.all` (each already non-rejecting).
- **Targeted verification:** `npx vitest run src/stores/key-residue-store.test.ts`.
- **Intent validation:** confirm nothing persists and nothing here is reachable by the transport.

### 4. Wire the panel

- **Behavior:** the status row of the AC4 table above; a persistent warning block for **every**
  provider whose `residue` is non-`null`, each carrying one non-destructive control bound to its
  own provider; the `Remove API key` button keeps its `keyStatus[provider] === true` gate; residue
  refreshed on mount (after both `hasKey` calls settle) and in the `finally` of `handleSave`,
  `handleDelete`, and `handleRecheck`. The existing one-shot `message` stays, and gains the
  report `deleteKey` used to make when a retry changes nothing.
- **Files:** `src/components/panels/ai-settings-content.tsx`,
  `src/components/panels/ai-settings-content.test.tsx`, and — added during implementation —
  `src/stores/chat-store.ts` and `src/stores/chat-store.test.ts`, for the `checkApiKey` refresh
  recorded in the trigger table above.
- **Implementation:** render the block with `role="alert"` and the same visual grammar as the
  existing legacy-model warning (`AlertTriangle`, bordered tinted box) — destructive tint for
  `retained`, amber for `unverified`. Copy exactly as specified above. Keep the existing security
  note paragraph. `busyProviders` is a `Set<AiProvider>`, not one slot, because two notices can
  have work in flight at once. Nothing in a notice calls `deleteKey`; see the AC5 paragraph and
  the replan log rows it cites.
- **Targeted verification:** `npx vitest run src/components/panels/ai-settings-content.test.tsx`.
- **Intent validation:** the owner deletes a key in a browser with `removeItem` stubbed, closes
  and reopens settings, and reads what the panel says.

### 5. The escalated surface (Option B as written; skip entirely for Option A)

- **Behavior:** while any provider reads `"retained"`, `StatusBar` shows a `Clear-text API key`
  button that opens settings at the AI tab and is announced through the existing live region.
  `unverified` and `null` show nothing. Desktop shows nothing, ever.
- **Files:** `src/components/layout/status-bar.tsx`, `src/components/layout/status-bar.test.tsx`,
  `src/components/layout/app-layout.tsx`, `src/components/layout/app-layout.test.tsx`.
- **Implementation:** a browser-only startup effect in `AppLayout`, and a derived boolean in
  `StatusBar`. The effect is **not** a bare `void refreshAllResidue()`: it reads each provider's
  slot as an uncommitted probe, settles `hasKey` for both providers only when the probe found
  something, and commits the reading only after that. Ordering and the reason for the probe are
  in the replan log rows *"the launch effect settles both `hasKey` calls before the first residue
  read"* and *"the launch sequence reads the slot before it opens the vault"*. Measure the
  startup cost of the dynamic adapter import and, if it is not negligible, defer the call behind
  `requestIdleCallback` with a `setTimeout` fallback rather than blocking first paint.
- **Option C delta:** new `src/components/layout/key-residue-bar.tsx` + test, rendered beside
  `UpdateBar`; no `StatusBar` change. **Option D delta:** a session-scoped `seen` flag in the
  store and a modal component; no `StatusBar` change.
- **Targeted verification:** `npx vitest run src/components/layout/`.
- **Intent validation:** the owner confirms the indicator is noticeable enough to matter and
  quiet enough to live with, and that it is absent on desktop.

## Test plan

Fixture facts that govern the whole plan: `resetKeyVault()` from
`src/lib/adapters/test-fixtures/key-vault.ts` is what empties the vault, because
`localStorage.clear()` does not touch IndexedDB — any adapter-level case here must call it in
`beforeEach`/`afterEach` as the existing suites do. Panel and store tests stay
adapter-mocked and must not import `fake-indexeddb`.

| AC | Test | File | Approach |
|---|---|---|---|
| 1 — capability reports `retained` | `reports a clear-text copy the browser refused to erase` | `browser-keychain-adapter.test.ts` | `setKey`, `refuseLegacyRemoval()` (existing helper ~line 804), seed `LEGACY_SLOT`, `await deleteKey(...).catch(...)`, then `expect(await adapter.readLegacyResidue("anthropic")).toBe("retained")`. Also asserts the `deleteKey` rejection is still `LEGACY_RETAINED` — the new capability must not replace it |
| 1 — capability reports `unverified` | `reports storage that would not answer as unverified` | `browser-keychain-adapter.test.ts` | `Storage.prototype.getItem` throwing spy (pattern at ~line 927) → `"unverified"` |
| 1 — capability reports `null` | `reports no residue when the slot is genuinely absent` | `browser-keychain-adapter.test.ts` | Fresh vault, no slot → `null`; and after an unstubbed `deleteKey` of a migrated key → `null` |
| 1 — read is not a write | `does not erase the slot it reports on` | `browser-keychain-adapter.test.ts` | Seed the slot, call `readLegacyResidue` twice, assert `localStorage.getItem(LEGACY_SLOT)` is unchanged and `removeItem` was never called for that key |
| 1 — no key material escapes | `never returns any part of the stored key` | `browser-keychain-adapter.test.ts` | Seed a recognisable secret; assert the resolved value is exactly `"retained"` |
| 1 — Tauri stays honest | `does not carry a residue check on the desktop adapter` | `keychain-adapter.test.ts` | `expect("readLegacyResidue" in new TauriKeychainAdapter()).toBe(false)`; plus `const shared: KeychainAdapter = new TauriKeychainAdapter(); expect(shared.readLegacyResidue?.("anthropic")).toBeUndefined();` |
| 1 — the optionality is load-bearing | `makes an unguarded residue call a type error` | `keychain-adapter.test.ts` | `@ts-expect-error` on `shared.readLegacyResidue("anthropic")` (possibly `undefined`), mirroring the file's existing compile assertions — `tsc --noEmit` fails on an unused directive if the member is ever made required |
| 2 — persistent warning | `keeps warning about a clear-text copy after the message is cleared` | `ai-settings-content.test.tsx` | Fake adapter with `readLegacyResidue: async () => "retained"`; delete, then perform another action that calls `setMessage(null)`; the warning block is still present and names the provider and site data |
| 2 — **surviving a remount** | `still warns after the settings panel is closed and reopened` | `ai-settings-content.test.tsx` | `const { unmount } = render(...)`; assert warning; `unmount()`; re-`render`; assert the warning is present again without any user action |
| 3 — the two states differ | `distinguishes a retained copy from a check that was blocked` | `ai-settings-content.test.tsx` | Two cases, `"retained"` vs `"unverified"`; each asserts its own copy is present **and** the other's is absent |
| 4 — no false "no key" | `does not claim the provider is unconfigured while a clear-text copy is readable` | `ai-settings-content.test.tsx` | `hasKey → false`, residue `"retained"`; `expect(screen.queryByText("No API key configured")).toBeNull()`. The existing test at ~line 162 that asserts `"No API key configured"` after a retained delete **must be updated**, not deleted — it encodes the current wrong behavior and its comment should record why it changed |
| 5 — retry reachable | `keeps a retry reachable while a clear-text copy remains` | `ai-settings-content.test.tsx` | `hasKey → false`, residue `"retained"`; the control renders and clicking it calls `hasKey` again for that provider, and `deleteKey` never |
| 5 — nothing destructive | `never reaches deleteKey from a residue notice, whatever the panel knows` | `ai-settings-content.test.tsx` | Every combination of `keyStatus` (`true`, `false`, rejected) and residue (`"retained"`, `"unverified"`) for both providers; click every control in every notice; `deleteKey` call count stays zero |
| 5 — the retry reports | `says so when the retry changed nothing` and `says so when a blocked check is still blocked` | `ai-settings-content.test.tsx` | Residue still `"retained"` after the re-read; the panel authors the report `deleteKey`'s rejection used to carry. The `unverified` case is the same shape and matters more, because that reading never resolves on a blocked-storage profile — its report claims no removal and no absence |
| 6 — **warning clears** | `stops warning once the slot is actually gone` | `ai-settings-content.test.tsx` | `readLegacyResidue` returns `"retained"`, then `null` once `hasKey` — which runs the migration — is allowed to erase; click retry; the warning and the status-row text are both gone |
| 4 — not-yet-checked | `does not claim there is no key before the check has answered` | `ai-settings-content.test.tsx` | `hasKey` left pending; the row reads `Checking key storage…`, never `No API key configured`, and offers no removal |
| rider — no plaintext in the queue | `does not park the plaintext key in the provider queue` | `browser-keychain-adapter.test.ts` | Spy `Map.prototype.set` to capture what `withProviderLock` stores under the provider key after a `getKey`; assert it resolves `undefined` |
| launch — no vault without a slot | `does not open the key vault when there is no clear-text slot to migrate` | `app-layout.test.tsx` | No `hasKey` call at launch on a profile with no slot; plus `does not open the key vault to answer` in `browser-keychain-adapter.test.ts`, asserting `indexedDB.databases()` is empty after a residue read and non-empty after `hasKey` |
| launch — adapter load fails | `still reads the slot when the keychain adapter fails to load first` | `app-layout.test.tsx` | First `getKeychainAdapter()` rejects; the store's own refresh still reports `"retained"` |
| desktop parity | `shows nothing when the adapter has no residue check` | `ai-settings-content.test.tsx` | Fake adapter object with only `setKey`/`hasKey`/`deleteKey` — the shape `TauriKeychainAdapter` actually has — asserting no warning and no relabelled button |
| store | `key-residue-store` cases | `src/stores/key-residue-store.test.ts` (new) | Adapter mock via `vi.mock("@/lib/adapters/get-keychain-adapter")`: sets from the capability; writes `null` when the method is absent; **keeps the prior value when the adapter module rejects**; `refreshAllResidue` covers both providers |
| escalation (B) | `status-bar` cases | `src/components/layout/status-bar.test.tsx` | Seed the store with `useKeyResidueStore.setState(...)`: indicator present for `"retained"`, absent for `"unverified"` and `null`, click calls `openSettingsDialogAtTab("ai")` |

**Regression coverage that must stay green unmodified:** every existing case in
`browser-keychain-adapter.test.ts` (especially the "keeps the clear-text slot when the wrapping
key is unusable" family), `src/lib/persistence/no-key-leakage.test.ts` (which enumerates
`/^tf-api-key-/` and asserts the persistence layer never touches it), and
`src/lib/adapters/keychain-adapter.test.ts`'s `getKey` compile assertions.

**E2E:** not required for options A or B — the fakes above exercise the real adapter and the real
panel, and `e2e/fixtures.ts` seeds the legacy slot precisely so the migration path is already
covered live. If the owner picks C or D, add one Playwright case that seeds the slot, stubs
`Storage.prototype.removeItem` in an init script, deletes the key, and asserts the global surface
is present after a reload.

## Cross-cutting requirements

- **Security and privacy:** the residue token never carries key material, and nothing new is
  logged. No existing validation, guard, marker, or rejection is removed or relaxed — `deleteKey`
  still fails closed, `readLegacySlot` still separates `absent` from `unreadable`, and
  `unverified` is still treated as "cannot claim absence". The new capability is read-only. No
  new permission, no new dependency, no CSP change, no network access.
- **`.thf` compatibility:** untouched. No schema, no migration, no round-trip surface.
- **Browser and desktop:** the difference is expressed in the type system as an optional
  capability the desktop adapter does not implement, and asserted at runtime by a test.
  `TauriKeychainAdapter`, `src-tauri/`, and the IPC surface get zero edits. The panel's desktop
  render is unchanged; the escalated surface (step 5) is browser-only. This is a deliberate
  platform difference, not a fallback.
- **AI safety:** untouched. No model output, no tool loop, no approval path.
- **Accessibility and UX:** the warning block uses `role="alert"` like the existing legacy-model
  warning; the escalated surface reuses `StatusBar`'s always-mounted `role="status"` region so a
  newly appearing state is announced once rather than on every render; `StatusBar` gains its
  first focusable control, so tab order, focus ring, and hit target need checking. Colour is not
  the only carrier of the `retained` / `unverified` distinction — heading text and button label
  differ too.
- **Observability and evidence:** the PR carries screenshots of both states in the panel, the
  escalated surface, and the desktop render showing nothing added.

## Blast radius and risk

**What could break.**

1. **The interface change ripples to every `KeychainAdapter` consumer.** Mitigated by
   optionality: no existing implementation or caller needs an edit, and `tsc --noEmit` proves it.
2. **Panel behavior the existing suite pins.** The `mutated` ref, the `Promise.allSettled`
   independence, the `LEGACY_RETAINED`-as-removal handling, and the adapter-load message are all
   load-bearing fixes from #133 preflight. None are modified; the mount effect only gains a
   trailing refresh call, and the residue state deliberately does not participate in `mutated`.
3. **One existing test asserts the wrong behavior on purpose.** `treats a removal that left a
   clear-text copy as removed, with the warning` asserts `"No API key configured"` after a
   retained delete — exactly what AC4 forbids. It must be updated with a comment recording the
   change, not silently deleted.
4. **Deadlock hazard.** `readLegacyResidue` takes `withProviderLock`; calling it from inside
   another locked operation would wedge that provider permanently. No planned callsite does, and
   a code comment records the constraint.
5. **A permanent `unverified` notice for blocked-storage profiles** that never had a slot (the
   round-12 case). Accepted: failing closed is the recorded stance. Contained by calmer copy,
   distinct colour, and — under the recommended option — by never escalating `unverified` outside
   the panel.
6. **Startup cost under options B/C/D:** `getKeychainAdapter()` dynamically imports the browser
   keychain adapter (and therefore the vault module) at launch rather than at first settings
   open. Small, but measured in step 5 and deferred behind idle time if it is not.
7. **A `retained` warning alongside a configured key.** `setKey` also attempts and ignores the
   erase, so residue can coexist with `keyStatus === true`. The copy is written to be true in
   both cases; the status row is overridden for every `keyStatus` except `true`, which keeps
   "API key configured" because that claim is still the more important one.

**What must not regress.**

- The desktop path. No Rust, no IPC, no `TauriKeychainAdapter` edit, nothing rendered on desktop
  that is not rendered today. The capability is absent there by construction, and a test asserts
  the absence rather than trusting the omission.
- `deleteKey` still rejects with `LEGACY_RETAINED` and still erases before it commits. The
  persistent surface is added *beside* the one-shot message, not instead of it.
- The migration guards, retirement markers, and the "never write back to the legacy slot" rule.
- `no-key-leakage.test.ts` and the `tf-api-key-` namespace disjointness proof from #56.

## Decomposition

**This is one coherent change, and it should not be split.** `AGENTS.md` says High effort work is
decomposed into executable sub-issues; that instruction earns its keep when the pieces are
independently shippable, and here they are not. The capability without the store and panel is a
method with no caller — dead scaffolding by the repository's own definition. The panel without
the capability is a component reading a method that does not exist. The five steps above are each
XS/S and independently reviewable within one PR, which is the property decomposition exists to
provide. Manufacturing three sub-issues would produce two that cannot be validated on their own.

The one genuine seam is step 5, and it is a seam in the *decision*, not the work: if the owner
picks Option A now and wants escalation later, the escalated surface is a clean follow-up against
the same store. File it only if that happens.

### Follow-up issues to file (not part of this change)

1. **"Neutralize an unerasable clear-text API key slot by overwriting it"** — `M2 • Beta`,
   `Effort: High`, `area:security`. If `removeItem` is refused but `setItem` is honoured, the app
   could overwrite the slot and destroy the credential's usefulness even when it cannot delete
   the entry. Deliberately excluded here: it would break the standing invariant that nothing is
   ever written back under `LEGACY_KEY_PREFIX`; an overwritten slot still reads as `present` and
   would be migrated as a key unless the read path learns a sentinel; and it destroys the last
   copy in the vault-damaged case that #133's tests specifically protect. It needs its own
   security review, not a rider on a surfacing fix. Acceptance criteria: an overwrite is
   attempted only after a revocation; the resulting slot can never be imported as a credential;
   no path can reach the overwrite while the vault cannot produce a replacement key.
2. `#234` already covers the adjacent `hasKey === true` / undecryptable-record case. No new issue
   needed.

## Verification gate

```bash
npx tsc --noEmit
npx vitest run src/lib/adapters/browser-keychain-adapter.test.ts \
  src/lib/adapters/keychain-adapter.test.ts \
  src/stores/key-residue-store.test.ts \
  src/components/panels/ai-settings-content.test.tsx
npx vitest run src/lib/persistence/no-key-leakage.test.ts
# Option B/C/D only:
npx vitest run src/components/layout/
```

Then, once:

```bash
npm run ci:local
```

E2E only if the owner picks Option C or D (see test plan).

## Owner validation

Green CI cannot decide any of these.

1. **Is the chosen surface actually noticed?** Delete a key in a browser with `removeItem`
   stubbed, then use the app normally for a few minutes. Did the surface reach you, or did you
   have to go looking for it?
2. **Does the `retained` copy read as true and non-alarming-but-serious?** Read it aloud. It
   claims a credential is readable on disk; check that every clause of that claim is literally
   true in the state that produced it, including the "not a backup" line.
3. **Is the `unverified` copy proportionate?** Simulate a profile that never had a clear-text
   slot in a browser where `getItem` throws. The notice will be permanent for that user. Is what
   it says worth showing them forever?
4. **Does the retry feel like a retry?** On a browser that starts allowing removal, does one
   click clear everything — panel row, warning block, escalated surface — with no reload?
5. **Desktop shows nothing new.** Open AI settings in the Tauri build with and without a key.
   Nothing about clear text, nothing about legacy slots, no changed button labels.
6. **Plausible-but-wrong to check for specifically:** a warning that persists after the slot is
   gone (stale state rather than a re-read), a warning that appears during a normal pre-#133
   migration (a residue read that beat `migrateLegacyKey`), and a status row that says "API key
   configured" while the only copy is the clear-text one.

## Specialist review

- [ ] PR reviewer
- [ ] Slop auditor
- [x] Security auditor — required; this is a trust boundary and key-handling change
- [ ] Threat-model expert — not applicable, no `.thf` or STRIDE surface

## Replan log

| Date | Change | Evidence and reason |
|------|--------|---------------------|
| 2026-07-27 | Initial plan | Issue #233 body and its four comments; `browser-keychain-adapter.ts`, `browser-key-vault.ts`, `keychain-adapter.ts`, `tauri-keychain-adapter.ts`, `ai-settings-content.tsx`, `status-bar.tsx`, `update-bar.tsx`, `settings-store.ts`, and the existing adapter/panel test suites, all read on `main` |
| 2026-07-27 | **Option B shipped; step 5 is no longer conditional.** The owner delegated the UI decision rather than answering it, so the implementer took the plan's own recommendation. "An implementer must not pick one" no longer holds and is struck from the human blockers | Owner delegation during implementation; the recommendation's stated reasoning was not re-litigated |
| 2026-07-27 | **Deviation:** `StatusBar` adds a *second* always-mounted `sr-only` `role="status"` region rather than joining the existing `local-persistence-alert` one, as step 5 said it would | Coalescing them makes the two independent states fight: a save-failure transition would either silence a standing claim about a readable credential or re-announce it on every persistence change. Two regions cost one span and keep each announcement tied to its own condition |
| 2026-07-27 | **Deviation:** the residue notice renders for **every** provider holding residue, not only the selected one, and each notice carries its own action bound to its own provider (plan step 4 said `residue[provider]`) | The status bar escalates *any* provider's `retained` slot (step 5) while the panel rendered only the selected one, so clicking the indicator with residue on the unselected provider opened a panel showing "No API key configured" and no control — the exact contradiction AC2/AC5 forbid. Found by the preflight review lanes |
| 2026-07-27 | **Deviation:** the `unverified` notice copy names the provider ("could not check for an older clear-text **Anthropic** API key"), where the plan's shared copy did not | Follows from the change above: two unattributed amber blocks cannot be told apart once notices are per-provider |
| 2026-07-27 | **Deviation:** the removal control is gated on `keyStatus === true \|\| residue === "retained"` **and** split in two — a destructive retry only where the encrypted record is known to be gone, and a non-destructive "Check again" everywhere else. Plan step 4 specified one control gated on `keyStatus[provider] \|\| residue[provider] !== null` | As written, an `unverified` reading rendered a red `Trash2` control labelled "Check again" wired to `deleteKey`, which commits a permanent `REVOKED` marker. A blocked-storage user who never had a key was told an erasure failed, and a user with a recoverable clear-text key destroyed it by asking for a read. Found by the preflight review lanes |
| 2026-07-27 | **Deviation:** `keyStatus` gained a third state, `"unknown"`, for a `hasKey` that rejected, with its own status-row wording | The plan kept the boolean, which reported an unreadable vault as "No API key configured" — reassurance in the wrong direction on a key-storage surface, and after the change above it would also have fed a destructive gate |
| 2026-07-27 | **Deviation:** the launch effect settles both `hasKey` calls before the first residue read, and `chat-store.checkApiKey` refreshes residue afterwards. Plan step 5 specified a bare `refreshAllResidue()` at launch | `readLegacyResidue` takes the provider lock, but at launch it is the *first* keychain call of the session, so the lock orders it behind nothing: it answered `"retained"` and the next `hasKey` migrated the slot away, leaving every pre-#133 user a standing red status-bar item over a resolved condition. The panel mount already ordered it correctly; the launch path now mirrors it |
| 2026-07-27 | **Step 5 measurement recorded** (the plan required it and the first implementation asserted it instead). Chromium against the dev server: the whole launch sequence took a median 27ms with no legacy slot and 31ms with one to migrate; first contentful paint over 12 navigations was a median 404ms with the effect and 416ms without, inside a 396–424ms spread. No `requestIdleCallback` deferral is warranted | Temporary `performance.mark` instrumentation plus a throwaway Playwright spec, both removed after measuring |
| 2026-07-27 | **Deviation:** the destructive residue control is removed entirely. `ResidueAction`, `residueAction()`, and the `retry-removal` branch are deleted; every residue notice binds one control to `handleRecheck`, labelled `Try removing it again` with no `Trash2`. Supersedes the row above, which split the control in two and kept a destructive branch | The split still decided from a render-time snapshot that `handleDelete` never re-verified. Reproduced end-to-end against the real IndexedDB vault: the panel settles honestly at `hasKey=false, residue="retained"`, the user saves a fresh key in a second tab, and clicking a control that speaks only about the clear-text slot destroys the new encrypted key. The pre-settle default was the same hole for ~26ms after mount, unbounded behind a cross-tab `blocked` upgrade. `deleteKey` bought nothing in that state either: a retirement marker already stands, so `hasKey` cannot re-import, and `migrateLegacyKey` runs `removeLegacyKey` unconditionally after the declined import — recheck-only measured `hasKey=false residue=null slot=null` once the browser allowed removal. Found by the PR reviewer and security lanes, independently, in round two |
| 2026-07-27 | **Deviation:** the report `deleteKey`'s rejection used to carry is authored by the panel. `handleRecheck` re-reads residue and, if the provider still reads `"retained"`, surfaces it through the one-shot `message` | The retry is a re-read now, which resolves either way, so without this a browser that still refuses leaves an identical notice on screen and no evidence the click did anything. The adapter's "removed from encrypted storage" clause is deliberately dropped: a re-read removes nothing |
| 2026-07-27 | **Deviation:** `keyStatus` gained a not-yet-checked state, `"unchecked"`, which is what `useState` now seeds; the status row reads `Checking key storage…` for it | `false` was doing double duty as "not asked yet" and "the encrypted record is known to be gone", and the row rendered the second reading — a false claim about storage — for the whole of every mount before `hasKey` answered |
| 2026-07-27 | **Deviation:** the site-data instruction states what it costs. Both notices and both `deleteKey` `LEGACY_RETAINED` messages carry one shared `CLEARING_SITE_DATA_COST` sentence. The earlier note that the `deleteKey` messages are not changed is struck | The browser workspace keeps document bodies in IndexedDB with the manifest in `localStorage` (`src/lib/persistence/types.ts`, `workspace-storage.ts`), so following the instruction deletes the user's saved threat models. The plan named that cost when it rejected Option C and then shipped the instruction without it. `privacy-page.tsx` already states the same fact, in the same voice |
| 2026-07-27 | **Deviation:** `busyProvider` became `busyProviders: Set<AiProvider>`, as `mutated` already was | With a notice per provider, two controls can have work in flight at once; the single slot let the first `finally` clear the flag while the second was still running, stopping its spinner and re-enabling its button mid-operation, and disabled `Remove API key` for either provider's work |
| 2026-07-27 | **Rider recorded:** `withProviderLock` stores `pending.then(() => undefined, () => undefined)` rather than `pending.catch(() => undefined)`. Shipped unlogged in the first implementation; now carries a test | The stored queue link forwarded the operation's resolved value, which for `getKey` is the plaintext API key, leaving it in a module-scoped map until the provider's next call replaced it. Measured `map-stored resolves to "sk-ant-CANARY…"` before and `undefined` after, with identical microtask depth and FIFO ordering. Pinned by `does not park the plaintext key in the provider queue` |
| 2026-07-27 | **Deviation:** the launch sequence reads the slot before it opens the vault. `AppLayout` probes `readLegacyResidue` for both providers, runs `hasKey` only if the probe found something, and commits the reading after that. Supersedes the unconditional `hasKey` in the row above; the ordering guarantee and its regression test are unchanged | `readLegacyResidue` is a `localStorage` read that never touches IndexedDB, while `hasKey` opens `threatforge-keychain` — so the unconditional version materialised that database at launch for every browser profile, including the majority that never touch AI, where previously it appeared only on first AI use. The probe's own answer is deliberately not committed, because `migrateLegacyKey` may be about to erase the slot it reported. Pinned by `does not open the key vault when there is no clear-text slot to migrate` and, at the adapter level, `does not open the key vault to answer` |
| 2026-07-27 | **Deviation:** the retry reports for `unverified` too, not only `retained`. `retainedAfterRetryText` became `retryReportText(residue, vendor)`, and the AC5 paragraph now describes both readings | The row above authored the report for `retained` alone, which left the one state that never resolves — a blocked-storage profile reads `unverified` forever — with a control that produced no message, no state change and an identical notice. That is the exact failure that row exists to prevent. The `unverified` wording claims no removal and no absence: `migrateLegacyKey` returns before it touches the slot when the read is refused, so nothing is attempted. Found by the round-three review lanes |
| 2026-07-27 | **Deviation:** the launch effect's `catch` logs through `console.warn`, matching `loadAdapter`. The plan and the code comment said the failure "is reported where the user can act on it, in the settings panel" | That holds only for a user who opens the panel, and the launch check exists precisely because they may never do so. A permanently broken adapter chunk now leaves a trace a bug report can carry. Pinned by `still reads the slot when the keychain adapter fails to load first` |
| 2026-07-27 | **Deviation:** the retry report no longer repeats the remedy or its cost, and the notice control's label branches — `Try removing it again` for `retained`, `Check again` for `unverified` | The report is only ever set while residue is non-null, which is the same condition that renders the notice above it, so both surfaces were guaranteed co-rendered: the user read "clear this site's browser data" twice and the cost sentence twice, a few lines apart. On the primary `handleDelete` flow the adapter's `LEGACY_RETAINED` message made it three times. The report now says only what is new. The shared label had the same problem in miniature — on an `unverified` reading no removal has been attempted, so neither "removing" nor "again" was true, and the report had to walk the label back one line later with "Nothing was removed". Found by the round-three slop lane |
| 2026-07-27 | **Copy correction:** the status-bar detail says `Open AI settings to deal with it`, not `to remove it`; the notice says `ThreatForge has not been able to delete it`, not `this browser will not delete it` | The indicator renders only on `retained`, which means the erase was already attempted and refused — so the panel it routes to offers a retry that may fail again and the site-data remedy, not removal. It is the first string a user meets, ahead of every careful hedge downstream. The notice's causal clause had the narrower version of the same fault: when `hasKey` rejects, `migrateLegacyKey` never reaches `removeLegacyKey`, so the browser refused nothing |
| 2026-07-27 | **Test strengthened:** `leaves a standing warning alone when the check did not clear the slot` now seeds the residue store empty and puts `retained` only in the slot | As written it seeded the store with the value it asserted, so it passed with the `checkApiKey` refresh deleted — it pinned only a hypothetical implementation that clears residue unconditionally. Deleting the refresh now fails both chat-store cases rather than one. Found by the round-three slop lane |

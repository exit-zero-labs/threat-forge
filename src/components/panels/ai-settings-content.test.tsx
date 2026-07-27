/** AI settings model picker and persisted legacy-selection behavior. */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CLEARING_SITE_DATA_COST,
	LEGACY_RETAINED,
	type LegacyResidue,
} from "@/lib/adapters/keychain-adapter";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/ai-models";
import { useChatStore } from "@/stores/chat-store";
import { useKeyResidueStore } from "@/stores/key-residue-store";
import { useSettingsStore } from "@/stores/settings-store";
import { DEFAULT_USER_SETTINGS } from "@/types/settings";
import { AiSettingsContent } from "./ai-settings-content";

let hasKey: (provider: string) => Promise<boolean> = async () => false;
let getAdapter: () => Promise<unknown> = async () => ({
	hasKey: (provider: string) => hasKey(provider),
	setKey: async () => undefined,
	deleteKey: async () => undefined,
});

vi.mock("@/lib/adapters/get-keychain-adapter", () => ({
	getKeychainAdapter: () => getAdapter(),
}));

function modelSelect(): HTMLSelectElement {
	return screen.getByRole<HTMLSelectElement>("combobox", { name: "Model" });
}

function providerSelect(): HTMLSelectElement {
	return screen.getByRole<HTMLSelectElement>("combobox", { name: "Provider" });
}

beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	hasKey = async () => false;
	getAdapter = async () => ({
		hasKey: (provider: string) => hasKey(provider),
		setKey: async () => undefined,
		deleteKey: async () => undefined,
	});
	useChatStore.setState({ provider: "anthropic" });
	useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
	useSettingsStore.setState({ settings: { ...DEFAULT_USER_SETTINGS } });
});

describe("key storage that cannot answer", () => {
	it("reports the fault and still shows the provider that answered", async () => {
		hasKey = async (provider) => {
			if (provider === "anthropic") throw new Error("Key storage in this browser is damaged.");
			return true;
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});

		// A rejection for one provider used to take the other's status down with it and surface
		// nothing, so a damaged vault read as "no API key configured" — which invites the user to
		// enter a key, the one action that cannot help.
		expect(screen.getByText("Key storage in this browser is damaged.")).toBeInTheDocument();
		fireEvent.change(providerSelect(), { target: { value: "openai" } });
		expect(screen.getByText("API key configured")).toBeInTheDocument();
	});

	it("does not let a slow status check undo a save that landed first", async () => {
		let release: () => void = () => undefined;
		const stalled = new Promise<void>((resolve) => {
			release = resolve;
		});
		hasKey = async () => {
			await stalled;
			return false;
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});
		fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
			target: { value: "sk-ant-new" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save" }));
		});
		await act(async () => {
			release();
			await stalled;
		});

		// The check started before the save and reports the vault as it was. Applying it would
		// tell the user the key they just saved is not there, and replace the confirmation with
		// a stale reading of storage.
		expect(screen.getByText("API key configured")).toBeInTheDocument();
	});

	it("still applies the status of a provider the user did not touch", async () => {
		let release: () => void = () => undefined;
		const stalled = new Promise<void>((resolve) => {
			release = resolve;
		});
		hasKey = async (provider) => {
			await stalled;
			return provider === "openai";
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});
		fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
			target: { value: "sk-ant-new" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save" }));
		});
		await act(async () => {
			release();
			await stalled;
		});

		// Only the saved provider's answer is stale. Discarding the whole check would leave the
		// other provider reading "No API key configured" for a key that is really there, until
		// the panel is closed and reopened.
		fireEvent.change(providerSelect(), { target: { value: "openai" } });
		expect(screen.getByText("API key configured")).toBeInTheDocument();
	});

	it("applies a stalled status check after a save that failed", async () => {
		let release: () => void = () => undefined;
		const stalled = new Promise<void>((resolve) => {
			release = resolve;
		});
		hasKey = async () => {
			await stalled;
			return true;
		};
		getAdapter = async () => ({
			hasKey: (provider: string) => hasKey(provider),
			setKey: async () => {
				throw new Error("Encrypted key storage in this browser is unavailable.");
			},
			deleteKey: async () => undefined,
		});

		await act(async () => {
			render(<AiSettingsContent />);
		});
		fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
			target: { value: "sk-ant-new" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save" }));
		});
		await act(async () => {
			release();
			await stalled;
		});

		// Nothing was written, so the check is not stale — it is the only reading of storage the
		// panel has. Treating the attempt as a mutation would discard it permanently and leave a
		// user with a key already saved looking at "No API key configured" and no Remove button.
		expect(screen.getByText("API key configured")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Remove API key" })).toBeInTheDocument();
	});

	it("treats a removal that left a clear-text copy as removed, with the warning", async () => {
		class RetainedCopyError extends Error {
			readonly reason = LEGACY_RETAINED;
		}
		hasKey = async () => true;
		getAdapter = async () => ({
			hasKey: (provider: string) => hasKey(provider),
			setKey: async () => undefined,
			deleteKey: async () => {
				throw new RetainedCopyError(
					"The API key was removed from encrypted storage, but this browser would not delete an older clear-text copy.",
				);
			},
			// The real adapter that throws this rejection also still reads the slot as present —
			// that is what the rejection means — so the fake has to answer the same way.
			readLegacyResidue: async () => "retained",
		});

		await act(async () => {
			render(<AiSettingsContent />);
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Remove API key" }));
		});

		// The stored key really is gone; the rejection is about residue the adapter could not
		// erase. Leaving the status alone showed "API key configured" directly underneath a
		// message saying the key had been removed.
		expect(screen.getByText(/would not delete an older clear-text copy/)).toBeInTheDocument();
		expect(screen.queryByText("API key configured")).toBeNull();
		// Changed by #233, deliberately: this assertion used to require "No API key configured"
		// here. That is the exact claim acceptance criterion 4 forbids — the encrypted record is
		// gone, but a usable clear-text credential is still readable in this browser, and telling
		// the user there is no key is how they end up leaving it there.
		expect(screen.queryByText("No API key configured")).toBeNull();
		expect(screen.getByText("Clear-text API key still in this browser")).toBeInTheDocument();
	});

	it("does not report an unreadable vault as an empty one", async () => {
		hasKey = async () => {
			throw new Error("Key storage in this browser is damaged.");
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});

		// A rejected `hasKey` used to collapse to `false`, so a vault nobody can read was
		// reported as "No API key configured" — reassurance in exactly the wrong direction,
		// on a surface whose whole job is telling the user where their credential is.
		expect(screen.queryByText("No API key configured")).toBeNull();
		expect(screen.getByText("Key storage could not be read")).toBeInTheDocument();
		expect(screen.getByText("Key storage in this browser is damaged.")).toBeInTheDocument();
	});

	it("offers no removal control while it cannot tell whether a key is there", async () => {
		hasKey = async () => {
			throw new Error("Key storage in this browser is damaged.");
		};
		getAdapter = async () => ({
			hasKey: (provider: string) => hasKey(provider),
			setKey: async () => undefined,
			deleteKey: async () => undefined,
			readLegacyResidue: async () => "retained",
		});

		await act(async () => {
			render(<AiSettingsContent />);
		});

		// `deleteKey` commits a permanent revocation marker and can take a record the panel has
		// never successfully read. An unknown status is not a licence to offer that.
		expect(screen.queryByRole("button", { name: "Remove API key" })).toBeNull();
		const control = within(screen.getByTestId("clear-text-key-notice-anthropic")).getByRole(
			"button",
		);
		expect(control).toHaveTextContent("Try removing it again");
		// A readable clear-text copy outranks an unreadable vault in the status row. Both facts
		// are true at once here, and "Key storage could not be read" is the weaker one: it
		// describes the encrypted record while a usable credential sits in clear text.
		expect(screen.getByText("Clear-text API key still in this browser")).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(control);
		});

		// The retry hit the same fault, and that is what the user must read. The residue re-read
		// in the same `finally` must not overwrite it with the retry report, which would blame a
		// removal nobody attempted for a chunk-load or vault failure — and would end in the
		// destructive clear-site-data instruction over an error a reload might fix.
		expect(screen.getByText("Key storage in this browser is damaged.")).toBeInTheDocument();
		expect(screen.queryByText(/still would not delete the older clear-text/)).toBeNull();
	});

	it("does not claim there is no key before the check has answered", async () => {
		// The seed value used to be `false`, which the status row reads as "the encrypted record
		// is known to be gone" — a claim about storage nobody had asked yet. It was visible for
		// as long as the vault took to open, and unbounded if a cross-tab upgrade blocked it.
		hasKey = () => new Promise<boolean>(() => undefined);

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(
			screen.queryByText("No API key configured"),
			"the row must not claim storage answered before it has",
		).toBeNull();
		expect(screen.getByText("Checking key storage…")).toBeInTheDocument();
		// And nothing destructive is offered over a record the panel has not read.
		expect(screen.queryByRole("button", { name: "Remove API key" })).toBeNull();
	});

	it("says so when the storage adapter itself will not load", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		getAdapter = async () => {
			throw new Error("Failed to fetch dynamically imported module: /assets/x-9f2a1c.js");
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(screen.getByText(/Key storage could not be loaded/)).toBeInTheDocument();
		// A bundle path and content hash are not an explanation, and this is a surface that
		// otherwise only ever shows messages the app authored.
		expect(screen.queryByText(/dynamically imported module/)).not.toBeInTheDocument();
		// Kept out of the UI, not discarded: a real chunk-load regression has to stay
		// diagnosable from a console log a user can paste into a bug report.
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("Key storage adapter failed to load"),
			expect.objectContaining({ message: expect.stringContaining("dynamically imported") }),
		);
	});

	it("does not render an object as its own explanation", async () => {
		// A rejection that is neither an `Error` nor a string came from no layer that authored
		// a message. `String(error)` would put `[object Object]` on screen as the app's account
		// of what went wrong, so the shape adapter fails closed onto authored copy instead.
		getAdapter = async () => ({
			setKey: async () => undefined,
			hasKey: async () => {
				throw { code: 17, name: "InvalidStateError" };
			},
			deleteKey: async () => undefined,
		});

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(screen.getByText(/does not recognise/)).toBeInTheDocument();
		expect(screen.queryByText(/object Object/)).not.toBeInTheDocument();
		expect(screen.queryByText(/InvalidStateError/)).not.toBeInTheDocument();
	});

	it("does not put a bundler failure in front of the user when saving", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		getAdapter = async () => {
			throw new Error("Failed to fetch dynamically imported module: /assets/x-9f2a1c.js");
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});
		fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
			target: { value: "sk-ant-new" },
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save" }));
		});

		expect(screen.getByText(/Key storage could not be loaded/)).toBeInTheDocument();
		expect(screen.queryByText(/dynamically imported module/)).not.toBeInTheDocument();
	});
});

/**
 * #233: a `deleteKey` that leaves a readable clear-text copy behind reports it once, and the
 * panel then used to contradict that report on every later mount — "No API key configured",
 * with the removal control hidden. These cases pin the standing warning that replaced it.
 */
describe("a clear-text API key still readable in this browser", () => {
	let residue: Record<string, LegacyResidue> = {};
	let deleteCalls = 0;
	/**
	 * Every keychain call the panel makes, in order. One array rather than one per method,
	 * because the property that matters is how the calls interleave: `hasKey` runs the legacy
	 * migration, which retries the erase, so a slot read must not be issued before it settles.
	 */
	let calls: string[] = [];

	const RETAINED_HEADING = "A clear-text Anthropic API key is still stored in this browser.";
	// The provider is named here too, which the plan's copy did not do: the notice renders for
	// whichever provider has residue rather than only the selected one, and two unattributed
	// amber blocks would leave the user unable to tell which key the browser could not check.
	const UNVERIFIED_HEADING =
		"ThreatForge could not check for an older clear-text Anthropic API key.";
	/** The label the notice's one control carries. It only ever re-reads; see `handleRecheck`. */
	const CONTROL_LABEL = "Try removing it again";
	// The blocked reading has never had a removal attempted on it, so neither "removing" nor
	// "again" would be true there.
	const BLOCKED_CONTROL_LABEL = "Check again";

	/** The standing notice for one provider, which is not necessarily the selected one. */
	function notice(provider: string): HTMLElement {
		return screen.getByTestId(`clear-text-key-notice-${provider}`);
	}

	/** The one control a notice offers. Scoped, because a second provider may have one too. */
	function noticeControl(provider: string): HTMLElement {
		return within(notice(provider)).getByRole("button");
	}

	/** The providers one kind of call was made for, in order. */
	function callsFor(marker: string): string[] {
		return calls
			.filter((call) => call.startsWith(`${marker}:`))
			.map((call) => call.slice(marker.length + 1));
	}

	beforeEach(() => {
		residue = { anthropic: "retained", openai: null };
		deleteCalls = 0;
		calls = [];
		// The encrypted record is gone — that is what makes this the reported bug rather than a
		// key that is simply configured.
		hasKey = async () => false;
		getAdapter = async () => ({
			hasKey: async (provider: string) => {
				calls.push(`hasKey:${provider}`);
				const answer = await hasKey(provider);
				// Recorded on the way out as well: the migration erases the slot as it settles,
				// so "was it called" is a weaker fact than "had it finished".
				calls.push(`hasKey-settled:${provider}`);
				return answer;
			},
			setKey: async () => undefined,
			deleteKey: async () => {
				deleteCalls += 1;
			},
			readLegacyResidue: async (provider: string) => {
				calls.push(`residue:${provider}`);
				return residue[provider] ?? null;
			},
		});
	});

	it("does not claim the provider is unconfigured while a clear-text copy is readable", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		// The observed bug: `hasKey` is false because the encrypted record really was deleted,
		// so every mount reported "No API key configured" while `localStorage` still served the
		// credential to anything running on this page.
		expect(screen.queryByText("No API key configured")).toBeNull();
		expect(screen.getByText("Clear-text API key still in this browser")).toBeInTheDocument();
	});

	it("reads the clear-text slot only after the status check that migrates it", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		// `hasKey` runs the legacy migration, which retries the erase, so a slot read issued
		// before it settles describes storage the same mount may be in the middle of clearing —
		// a standing warning over a resolved condition, for every upgrading user. The adapter's
		// per-provider lock is the guarantee that survives a mistake here and is pinned at that
		// level; this pins the panel's own half of the ordering.
		let lastMigration = -1;
		calls.forEach((call, index) => {
			if (call.startsWith("hasKey-settled:")) lastMigration = index;
		});
		expect(lastMigration).toBeGreaterThan(-1);
		expect([...calls.slice(lastMigration + 1)].sort()).toEqual([
			"residue:anthropic",
			"residue:openai",
		]);
	});

	it("does not warn about a slot the mount's own status check removes", async () => {
		// The ordinary upgrade path for every pre-#133 user: the slot is there when the panel
		// mounts and is gone a moment later, migrated into the encrypted vault. The real
		// migration erases it only after an IndexedDB transaction commits, so the erase lands
		// after the call rather than during it — a read that did not wait would answer
		// "retained" for a slot that is already gone.
		hasKey = async (provider) => {
			await Promise.resolve();
			residue[provider] = null;
			return false;
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(screen.queryByTestId("clear-text-key-notice-anthropic")).toBeNull();
		expect(screen.getByText("No API key configured")).toBeInTheDocument();
	});

	it("keeps warning about a clear-text copy after the message is cleared", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});
		expect(screen.getByText(RETAINED_HEADING)).toBeInTheDocument();

		// Any later action clears the one-shot message. That is what made the original report
		// disappear; the standing notice must not go with it.
		await act(async () => {
			fireEvent.click(noticeControl("anthropic"));
		});

		expect(screen.getByText(RETAINED_HEADING)).toBeInTheDocument();
		expect(
			within(notice("anthropic")).getByText(/Clear this site's browser data to remove it/),
		).toBeInTheDocument();
	});

	it("still warns after the settings panel is closed and reopened", async () => {
		const first = await act(async () => render(<AiSettingsContent />));
		expect(screen.getByText(RETAINED_HEADING)).toBeInTheDocument();

		// The panel unmounts with the settings dialog, which is why component state could not
		// hold this. Reopening must not hand the user back the "No API key configured" reading.
		first.unmount();
		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(screen.getByText(RETAINED_HEADING)).toBeInTheDocument();
		expect(screen.queryByText("No API key configured")).toBeNull();
		expect(noticeControl("anthropic")).toHaveTextContent(CONTROL_LABEL);
	});

	it("names the provider, the remedy, and what the remedy costs", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(notice("anthropic")).toHaveTextContent(RETAINED_HEADING);
		expect(notice("anthropic")).toHaveTextContent(
			"revoke the key with Anthropic if it may have been exposed",
		);
		// The only remedy the app can offer is clearing site data, and in this browser that also
		// takes the user's saved threat models with it (`src/lib/persistence/types.ts`: bodies in
		// IndexedDB, manifest in `localStorage`). Giving the instruction without the cost is how
		// someone follows security advice and loses their work.
		expect(notice("anthropic")).toHaveTextContent(
			"also removes the threat models saved in this browser, so export anything you need first",
		);
		// Without this the retained slot reads as a recovery copy, right up until a read erases it.
		expect(notice("anthropic")).toHaveTextContent("This copy is not a backup");
		// The blocked-check wording would overstate nothing here — it would understate it.
		expect(notice("anthropic")).not.toHaveTextContent(UNVERIFIED_HEADING);
	});

	it("distinguishes a check that was blocked from a copy known to be there", async () => {
		residue = { anthropic: "unverified", openai: null };

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(notice("anthropic")).toHaveTextContent(UNVERIFIED_HEADING);
		expect(notice("anthropic")).toHaveTextContent("may or may not still be there");
		// The same instruction, so the same concession: this notice also tells the user to clear
		// site data.
		expect(notice("anthropic")).toHaveTextContent(
			"also removes the threat models saved in this browser, so export anything you need first",
		);
		// Nothing is known to be readable, so the honest summary of the row is unchanged and the
		// certain-sounding copy must not appear.
		expect(notice("anthropic")).not.toHaveTextContent(RETAINED_HEADING);
		expect(screen.getByText("No API key configured")).toBeInTheDocument();
		expect(screen.queryByText("Clear-text API key still in this browser")).toBeNull();
	});

	it("offers only a re-read, never an erase, when the check itself was blocked", async () => {
		// A browser that blocks site data answers `unverified` for a profile that may never have
		// had a clear-text slot at all. `deleteKey` commits a permanent revocation marker, so
		// wiring it here would tell a user who never had a key that their erasure failed, and
		// would destroy a recoverable one for a user who asked only for a read.
		residue = { anthropic: "unverified", openai: null };

		await act(async () => {
			render(<AiSettingsContent />);
		});
		const control = noticeControl("anthropic");
		expect(control).toHaveTextContent(BLOCKED_CONTROL_LABEL);
		// It must not borrow the retained label: no removal has been attempted on this reading.
		expect(control).not.toHaveTextContent(CONTROL_LABEL);
		await act(async () => {
			fireEvent.click(control);
		});

		expect(deleteCalls).toBe(0);
		expect(notice("anthropic")).toHaveTextContent(UNVERIFIED_HEADING);
	});

	it("never reaches deleteKey from a residue notice, whatever the panel knows", async () => {
		// The regression this pins: the notice's control was once chosen from a render-time
		// snapshot of `keyStatus`, and `deleteKey` was one of the choices. The snapshot goes
		// stale — a key saved in a second tab, or saved before the mount check answered — and
		// the destructive branch then destroyed a good encrypted key from a control whose copy
		// spoke only about the clear-text slot. No combination may reach it.
		const statuses: [string, () => Promise<boolean>][] = [
			["stored key present", async () => true],
			["stored key gone", async () => false],
			[
				"storage unreadable",
				async () => {
					throw new Error("Key storage in this browser is damaged.");
				},
			],
		];
		const readings: LegacyResidue[] = ["retained", "unverified"];

		for (const [label, answer] of statuses) {
			for (const reading of readings) {
				hasKey = answer;
				residue = { anthropic: reading, openai: reading };
				const view = await act(async () => render(<AiSettingsContent />));

				for (const provider of ["anthropic", "openai"]) {
					for (const control of within(notice(provider)).getAllByRole("button")) {
						await act(async () => {
							fireEvent.click(control);
						});
					}
				}

				expect(deleteCalls, `${label}, residue "${reading}"`).toBe(0);
				view.unmount();
			}
		}
	});

	it("keeps a retry reachable while a clear-text copy remains", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		// The bug hid the removal control entirely once `hasKey` went false, so a user whose
		// browser started allowing removal had no way to act from this panel. `hasKey` is what
		// runs the legacy migration and retries the erase, so the retry is a `hasKey` call.
		calls = [];
		await act(async () => {
			fireEvent.click(noticeControl("anthropic"));
		});
		await act(async () => {
			fireEvent.click(noticeControl("anthropic"));
		});

		// Two per click, both for the provider the notice names: the retry itself, then the
		// transport's own check, because this notice happens to be the selected provider's.
		expect(callsFor("hasKey")).toEqual(["anthropic", "anthropic", "anthropic", "anthropic"]);
		expect(deleteCalls).toBe(0);
	});

	it("says so when the retry changed nothing", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		await act(async () => {
			fireEvent.click(noticeControl("anthropic"));
		});

		// `deleteKey` used to author this report through its own rejection. The retry is a
		// re-read now, which resolves either way, so a browser that still refuses would leave
		// the identical notice on screen and no evidence the click did anything.
		const report = screen.getByText(
			/This browser still would not delete the older clear-text Anthropic/,
		);
		// The report says only what is new. The notice directly above it is still on screen —
		// the report is only ever set while residue is non-null, which is the same condition
		// that renders the notice — so repeating the remedy and its cost printed the same two
		// sentences twice, a few lines apart.
		expect(report).not.toHaveTextContent(CLEARING_SITE_DATA_COST);
		expect(notice("anthropic")).toHaveTextContent(CLEARING_SITE_DATA_COST);
	});

	it("says so when a blocked check is still blocked", async () => {
		// The permanent case: a blocked-storage profile reads `unverified` forever, so this is
		// the one state where the control can never change anything. Leaving it silent made the
		// only action the panel offers do visibly nothing — same notice, no message, no state
		// change — which is the failure the retained report exists to prevent.
		residue = { anthropic: "unverified", openai: null };

		await act(async () => {
			render(<AiSettingsContent />);
		});

		await act(async () => {
			fireEvent.click(noticeControl("anthropic"));
		});

		const report = screen.getByText(
			/This browser still blocked the check for an older clear-text Anthropic API key/,
		);
		// `migrateLegacyKey` returns before it touches the slot when the read is refused, so
		// nothing was attempted: the report claims no removal and no absence, only the block.
		expect(report).toHaveTextContent("Nothing was removed");
		expect(report).toHaveTextContent("whether a copy is there is still unknown");
		// Not repeated here: the notice above is still on screen and already carries it.
		expect(report).not.toHaveTextContent(CLEARING_SITE_DATA_COST);
		expect(notice("anthropic")).toHaveTextContent(CLEARING_SITE_DATA_COST);
		// Borrowing the retained wording would assert a removal was refused, which is a claim
		// about an attempt this state never makes.
		expect(report).not.toHaveTextContent("would not delete");
	});

	it("warns about a provider that is not the selected one, and can act on it there", async () => {
		// The status bar escalates *any* provider's retained slot and routes here. Rendering
		// only the selected provider's residue made that route a dead end: the panel said "No
		// API key configured" and offered nothing, which is the contradiction #233 removes.
		residue = { anthropic: null, openai: "retained" };

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(useChatStore.getState().provider).toBe("anthropic");
		expect(screen.queryByTestId("clear-text-key-notice-anthropic")).toBeNull();
		expect(notice("openai")).toHaveTextContent(
			"A clear-text OpenAI API key is still stored in this browser.",
		);

		calls = [];
		await act(async () => {
			fireEvent.click(noticeControl("openai"));
		});

		// The retry is bound to the provider whose slot it describes, not to the selected one.
		expect(callsFor("hasKey")).toEqual(["openai"]);
	});

	it("stops warning once the slot is actually gone", async () => {
		let browserAllowsRemoval = false;
		hasKey = async () => {
			// `hasKey` runs the legacy migration, which retries the erase — so on a browser that
			// has started allowing removals, the retry is what finally clears the slot.
			if (browserAllowsRemoval) residue = { anthropic: null, openai: null };
			return false;
		};

		await act(async () => {
			render(<AiSettingsContent />);
		});
		expect(notice("anthropic")).toBeInTheDocument();
		browserAllowsRemoval = true;

		await act(async () => {
			fireEvent.click(noticeControl("anthropic"));
		});

		// Nothing dismisses this warning by hand: it is re-derived from storage, so a resolved
		// condition clears both the notice and the status row without a reload.
		expect(screen.queryByTestId("clear-text-key-notice-anthropic")).toBeNull();
		expect(screen.queryByText("Clear-text API key still in this browser")).toBeNull();
		expect(screen.getByText("No API key configured")).toBeInTheDocument();
		// And the retry reports nothing, because it changed something. Deciding that from the
		// render snapshot rather than the store would tell a user whose problem had just been
		// resolved to clear their site data — and lose their saved threat models with it.
		expect(screen.queryByText(/still would not delete the older clear-text/)).toBeNull();
	});

	it("shows nothing when the adapter has no residue check", async () => {
		// The shape `TauriKeychainAdapter` actually has. Desktop keys live in an encrypted file
		// behind Rust and never enter the webview, so there is no clear-text slot to describe —
		// and this panel is shared, so it has to render the same on both platforms.
		getAdapter = async () => ({
			hasKey: async () => true,
			setKey: async () => undefined,
			deleteKey: async () => undefined,
		});

		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(screen.queryByTestId("clear-text-key-notice-anthropic")).toBeNull();
		expect(screen.queryByText(/clear-text/i)).toBeNull();
		expect(screen.getByRole("button", { name: "Remove API key" })).toBeInTheDocument();
	});
});

/**
 * #133 requires the browser's storage limit to be stated in the UI without overstating the
 * protection. This pins that sentence so it cannot silently regress or drift into a claim
 * the implementation does not make. `isTauri()` is false under jsdom, so this is the
 * browser copy.
 */
describe("the browser security notice", () => {
	it("states that the key is encrypted and that page script can still use it", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		const notice = screen.getByText(/encrypted before being stored in this browser/i);
		expect(notice).toHaveTextContent("a key the browser will not export");
		expect(notice).toHaveTextContent("Anything running on this page can still use the key");
	});
});

describe("a current catalog model", () => {
	it("renders selected, with its description, and no legacy warning", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(modelSelect().value).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(screen.getByText("Balanced speed and capability")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("a persisted legacy model id", () => {
	beforeEach(() => {
		useSettingsStore.setState((state) => ({
			settings: { ...state.settings, aiModelAnthropic: "claude-sonnet-4-20250514" },
		}));
	});

	it("shows the legacy id as the selected, visibly labeled option without rewriting settings", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		expect(modelSelect().value).toBe("claude-sonnet-4-20250514");
		expect(screen.getByText(/claude-sonnet-4-20250514.*legacy/i)).toBeInTheDocument();
		expect(screen.getByRole("alert")).toHaveTextContent(
			/"claude-sonnet-4-20250514" is no longer offered/,
		);
		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("claude-sonnet-4-20250514");
	});

	it("switches to the recommended default only when the user clicks the deliberate control", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		fireEvent.click(screen.getByRole("button", { name: /switch to .*recommended default/i }));

		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe(DEFAULT_ANTHROPIC_MODEL);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("switches deliberately by picking any current model from the dropdown", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		fireEvent.change(modelSelect(), { target: { value: "claude-haiku-4-5-20251001" } });

		expect(useSettingsStore.getState().settings.aiModelAnthropic).toBe("claude-haiku-4-5-20251001");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("provider switching", () => {
	it("shows the OpenAI catalog and default after switching providers", async () => {
		await act(async () => {
			render(<AiSettingsContent />);
		});

		fireEvent.change(providerSelect(), { target: { value: "openai" } });

		expect(useChatStore.getState().provider).toBe("openai");
		expect(modelSelect().value).toBe(DEFAULT_OPENAI_MODEL);
	});
});

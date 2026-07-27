import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { DocumentPersistenceState } from "@/lib/persistence/types";
import { useCanvasStore } from "@/stores/canvas-store";
import { useDocumentRegistry } from "@/stores/document-registry";
import { createDocumentStores, setActiveStores } from "@/stores/document-stores";
import { useKeyResidueStore } from "@/stores/key-residue-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { ThreatModel } from "@/types/threat-model";
import { StatusBar } from "./status-bar";

function createTestModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: {
			title,
			author: "Test",
			created: "2026-01-01",
			modified: "2026-01-01",
			description: "",
		},
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

beforeEach(() => {
	useDocumentRegistry.setState({
		documents: {},
		openDocumentIds: [],
		activeDocumentId: null,
	});
	setActiveStores(createDocumentStores());
});

/**
 * Plan step 9 case 10 — the React re-subscription proof. `StatusBar` reads `model`, `isDirty`,
 * `filePath`, `past.length`, and `future.length` through the store facades. Because activating a
 * document swaps the bundle those facades resolve, the mounted component must re-render and
 * re-subscribe on a switch rather than serve a stale snapshot.
 */
describe("StatusBar across a document switch (plan step 9)", () => {
	it("case 10 - reflects the active document's save, history, and file state across switches", () => {
		const registry = useDocumentRegistry.getState();

		// Document A: two elements, one flow, three history pushes, saved at /a.thf.
		const a = registry.createDocument({
			model: createTestModel("A"),
			filePath: "/a.thf",
			pendingLayout: null,
		});
		useCanvasStore.getState().addElement("web_server", { x: 0, y: 0 });
		useCanvasStore.getState().addElement("data_store", { x: 10, y: 10 });
		useCanvasStore.getState().addDataFlow("comp-1", "comp-2");

		render(<StatusBar />);
		const bar = screen.getByTestId("status-bar");
		expect(bar).toHaveTextContent("Unsaved changes");
		expect(bar).toHaveTextContent("Undo: 3 / Redo: 0");
		expect(bar).toHaveTextContent("/a.thf");

		// Switch to an empty, unsaved document B: the same mounted bar now shows B's state.
		act(() => {
			registry.createDocument({ model: createTestModel("B"), filePath: null, pendingLayout: null });
		});
		expect(bar).toHaveTextContent("Saved");
		expect(bar).not.toHaveTextContent("Undo:");
		expect(bar).not.toHaveTextContent("/a.thf");

		// Returning to A restores its rendered state and file path — a stale snapshot would not.
		act(() => {
			registry.activateDocument(a);
		});
		expect(bar).toHaveTextContent("Unsaved changes");
		expect(bar).toHaveTextContent("Undo: 3 / Redo: 0");
		expect(bar).toHaveTextContent("/a.thf");
	});

	it("strips bidi controls from the displayed file path and tooltip (#175)", () => {
		useDocumentRegistry.getState().createDocument({
			model: createTestModel("Path display"),
			filePath: "/home/jane/secret\u202Efolder/payments.thf",
			pendingLayout: null,
		});

		render(<StatusBar />);

		const displayedPath = screen.getByTitle("/home/jane/secretfolder/payments.thf");
		expect(displayedPath).toHaveTextContent("/home/jane/secretfolder/payments.thf");
		expect(displayedPath.getAttribute("title")).not.toContain("\u202E");
	});
});

/**
 * Local persistence indicator (issue #56, plan step 9). Each failure mode has to reach the user:
 * silent data loss is the exact outcome this issue exists to prevent. The indicator is also the
 * boundary against `#55` — it reports state and offers no recovery action.
 */
describe("StatusBar local persistence indicator", () => {
	function openDocument(): void {
		useDocumentRegistry.getState().createDocument({
			model: createTestModel("Indicator"),
			filePath: null,
			pendingLayout: null,
		});
	}

	/** The indicator reads whichever document the registry has active, by its generated id. */
	function setActiveDocumentPersistence(state: DocumentPersistenceState): void {
		const activeId = useDocumentRegistry.getState().activeDocumentId;
		if (!activeId) throw new Error("no active document");
		useWorkspaceStore.getState().setPersistenceState(activeId, state);
	}

	beforeEach(() => {
		useWorkspaceStore.setState({
			documents: [],
			activeDocumentId: null,
			persistence: {},
			persistenceAvailable: true,
			unavailableReason: null,
			recoverableDocumentIds: [],
		});
	});

	it("stays silent on the desktop, where persistence is unavailable with no reason to report", () => {
		openDocument();
		useWorkspaceStore.getState().setPersistenceAvailability(false);

		render(<StatusBar />);

		expect(screen.queryByTestId("local-persistence-status")).not.toBeInTheDocument();
		expect(screen.getByTestId("local-persistence-alert")).toBeEmptyDOMElement();
		// The distinct file save status is untouched by the local indicator.
		expect(screen.getByTestId("status-bar")).toHaveTextContent("Saved");
	});

	it("shows a saved-locally state without disturbing the file save status", () => {
		openDocument();
		setActiveDocumentPersistence({ status: "saved", lastPersistedAt: "2026-07-21T00:00:00.000Z" });

		render(<StatusBar />);

		const indicator = screen.getByTestId("local-persistence-status");
		expect(indicator).toHaveTextContent("Saved locally");
		// A routine save is not announced to assistive technology on every edit burst.
		expect(screen.getByTestId("local-persistence-alert")).toBeEmptyDOMElement();
		expect(screen.getByTestId("status-bar")).toHaveTextContent("Saved");
	});

	it("coalesces repeated write failures into one announced indicator", () => {
		openDocument();
		render(<StatusBar />);

		act(() => {
			for (let attempt = 0; attempt < 3; attempt++) {
				setActiveDocumentPersistence({
					status: "error",
					lastPersistedAt: null,
					errorKind: "unknown",
				});
			}
		});

		// One indicator for a run of failures, not one per failed write.
		expect(screen.getAllByTestId("local-persistence-status")).toHaveLength(1);
		const indicator = screen.getByTestId("local-persistence-status");
		expect(indicator).toHaveTextContent("Not saved locally");
		expect(indicator.title).toContain("still open here");
		// The failure also reaches a user who never looks at the footer.
		expect(screen.getByTestId("local-persistence-alert")).toHaveTextContent("still open here");
	});

	it("names a full quota so the user can act on the right problem", () => {
		openDocument();
		setActiveDocumentPersistence({
			status: "error",
			lastPersistedAt: null,
			errorKind: "quota-exceeded",
		});

		render(<StatusBar />);

		const indicator = screen.getByTestId("local-persistence-status");
		expect(indicator).toHaveTextContent("Not saved locally");
		expect(indicator.title).toContain("Local storage is full");
	});

	it("warns that a private-mode session will not be saved, even before a document is open", () => {
		useWorkspaceStore.getState().setPersistenceAvailability(false, "private-mode");

		render(<StatusBar />);

		const indicator = screen.getByTestId("local-persistence-status");
		expect(indicator).toHaveTextContent("This session won't be saved");
		expect(screen.getByTestId("local-persistence-alert")).toHaveTextContent(
			"edits stay in this tab only",
		);
		expect(screen.getByTestId("status-bar")).toHaveTextContent("No model open");
	});

	it("asks for recovery when a stored document cannot be read", () => {
		openDocument();
		setActiveDocumentPersistence({
			status: "corrupt",
			lastPersistedAt: null,
			errorKind: "corrupt",
		});

		render(<StatusBar />);

		const indicator = screen.getByTestId("local-persistence-status");
		expect(indicator).toHaveTextContent("Recovery needed");
		// Nothing has been deleted: the indicator reports state and offers no destructive action.
		expect(indicator.title).toContain("Nothing has been deleted");
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("asks for recovery when the database itself could not be opened", () => {
		useWorkspaceStore.getState().setPersistenceAvailability(false, "migration-failed");

		render(<StatusBar />);

		expect(screen.getByTestId("local-persistence-status")).toHaveTextContent("Recovery needed");
	});
});

/**
 * #233: a clear-text API key that survived deletion is readable by anything with access to this
 * site's storage, and the user may never reopen AI settings to find out. The status bar carries
 * the standing claim — but only the certain one.
 */
describe("StatusBar clear-text API key indicator", () => {
	beforeEach(() => {
		useKeyResidueStore.setState({ residue: { anthropic: null, openai: null } });
		useSettingsStore.setState({ settingsDialogOpen: false, settingsDialogInitialTab: null });
	});

	it("reports a clear-text key that is known to still be readable", () => {
		useKeyResidueStore.setState({ residue: { anthropic: "retained", openai: null } });

		render(<StatusBar />);

		expect(screen.getByTestId("clear-text-key-status")).toHaveTextContent("Clear-text API key");
		// Announced once when it first appears, through an always-mounted live region rather
		// than one that mounts with the state and may be missed.
		expect(screen.getByTestId("clear-text-key-alert")).toHaveTextContent(
			"still readable in this browser",
		);
	});

	it("stays silent when the check itself was blocked", () => {
		useKeyResidueStore.setState({ residue: { anthropic: "unverified", openai: "unverified" } });

		render(<StatusBar />);

		// `unverified` may describe a profile that never had a clear-text slot at all — a
		// blocked-storage browser answers this way forever. That claim is too uncertain to earn
		// permanent application chrome, so it stays in the AI settings panel.
		expect(screen.queryByTestId("clear-text-key-status")).toBeNull();
		expect(screen.getByTestId("clear-text-key-alert")).toBeEmptyDOMElement();
	});

	it("shows nothing when no provider has residue", () => {
		render(<StatusBar />);

		// That the desktop keychain adapter carries no residue check, and so can only ever leave
		// this store holding `null`, is asserted where it is observable: `app-layout.test.tsx`
		// proves the launch path never asks on that platform.
		expect(screen.queryByTestId("clear-text-key-status")).toBeNull();
		expect(screen.getByTestId("clear-text-key-alert")).toBeEmptyDOMElement();
	});

	it("routes to the AI settings tab, where the retry and the instructions are", () => {
		useKeyResidueStore.setState({ residue: { anthropic: null, openai: "retained" } });

		render(<StatusBar />);
		fireEvent.click(screen.getByTestId("clear-text-key-status"));

		// The indicator states the fact; acting on it needs the panel, so it is a real control
		// rather than inert text.
		expect(useSettingsStore.getState().settingsDialogOpen).toBe(true);
		expect(useSettingsStore.getState().settingsDialogInitialTab).toBe("ai");
	});
});

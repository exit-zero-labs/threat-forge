import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CloseHandler = (event: { preventDefault: () => void }) => unknown;

// Stub the Tauri window. `getCurrentWindow().onCloseRequested` captures the handler so a test can
// fire a close request; `destroy` records that the window was actually closed.
const tauriWindow = vi.hoisted(() => {
	let handler: CloseHandler | null = null;
	const destroy = vi.fn().mockResolvedValue(undefined);
	const onCloseRequested = vi.fn(async (cb: CloseHandler) => {
		handler = cb;
		return () => {
			handler = null;
		};
	});
	return {
		destroy,
		onCloseRequested,
		getHandler: () => handler,
		reset: () => {
			handler = null;
			destroy.mockClear();
			onCloseRequested.mockClear();
		},
	};
});

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		onCloseRequested: tauriWindow.onCloseRequested,
		destroy: tauriWindow.destroy,
	}),
}));

import { useDocumentRegistry } from "@/stores/document-registry";
import {
	createDocumentStores,
	type DocumentStores,
	setActiveStores,
} from "@/stores/document-stores";
import type { DocumentId } from "@/types/document";
import type { ThreatModel } from "@/types/threat-model";
import { useCloseGuard } from "./use-close-guard";

function makeModel(title: string): ThreatModel {
	return {
		version: "1.0",
		metadata: { title, author: "", created: "", modified: "", description: "" },
		elements: [],
		data_flows: [],
		trust_boundaries: [],
		threats: [],
		diagrams: [],
	};
}

function open(title: string): DocumentId {
	return useDocumentRegistry.getState().createDocument({
		model: makeModel(title),
		filePath: null,
		pendingLayout: null,
	});
}

function requireStores(id: DocumentId): DocumentStores {
	const stores = useDocumentRegistry.getState().getDocumentStores(id);
	if (!stores) throw new Error(`expected stores for ${id}`);
	return stores;
}

function Harness() {
	return <div>{useCloseGuard()}</div>;
}

function beforeUnloadCalls(spy: ReturnType<typeof vi.spyOn>): unknown[][] {
	return (spy.mock.calls as unknown[][]).filter((call) => call[0] === "beforeunload");
}

beforeEach(() => {
	useDocumentRegistry.setState({ documents: {}, openDocumentIds: [], activeDocumentId: null });
	setActiveStores(createDocumentStores());
	tauriWindow.reset();
});

describe("useCloseGuard browser guard", () => {
	it("never registers beforeunload when no document is dirty (preserves bfcache)", () => {
		open("Clean");
		const addSpy = vi.spyOn(window, "addEventListener");

		render(<Harness />);

		expect(beforeUnloadCalls(addSpy)).toHaveLength(0);
		addSpy.mockRestore();
	});

	it("registers beforeunload when a background document becomes dirty, and its handler prevents unload", () => {
		const a = open("A");
		open("B"); // B is the active document; A is a background document
		const addSpy = vi.spyOn(window, "addEventListener");
		render(<Harness />);
		expect(beforeUnloadCalls(addSpy)).toHaveLength(0);

		act(() => {
			requireStores(a).model.getState().markDirty();
		});

		const calls = beforeUnloadCalls(addSpy);
		expect(calls).toHaveLength(1);
		const handler = calls[0][1] as (event: BeforeUnloadEvent) => void;
		const event = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
		handler(event);
		expect(event.preventDefault).toHaveBeenCalled();
		addSpy.mockRestore();
	});

	it("removes the beforeunload listener once nothing is dirty again", () => {
		const a = open("A");
		render(<Harness />);
		const removeSpy = vi.spyOn(window, "removeEventListener");

		act(() => {
			requireStores(a).model.getState().markDirty();
		});
		act(() => {
			requireStores(a).model.getState().markClean();
		});

		expect(beforeUnloadCalls(removeSpy)).toHaveLength(1);
		removeSpy.mockRestore();
	});
});

describe("useCloseGuard desktop guard", () => {
	beforeEach(() => {
		(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
	});
	afterEach(() => {
		(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = undefined;
	});

	it("intercepts the close, lists every dirty document, and destroys only after confirmation", async () => {
		const a = open("Alpha");
		const b = open("Beta");
		act(() => {
			requireStores(a).model.getState().markDirty();
			requireStores(b).model.getState().markDirty();
		});

		render(<Harness />);
		await waitFor(() => expect(tauriWindow.getHandler()).toBeTruthy());

		const preventDefault = vi.fn();
		await act(async () => {
			await tauriWindow.getHandler()?.({ preventDefault });
		});

		// Prevented, both dirty documents named, and the window is not yet destroyed.
		expect(preventDefault).toHaveBeenCalled();
		const modal = screen.getByTestId("close-guard-modal");
		expect(within(modal).getByText("Alpha")).toBeInTheDocument();
		expect(within(modal).getByText("Beta")).toBeInTheDocument();
		expect(tauriWindow.destroy).not.toHaveBeenCalled();

		await act(async () => {
			fireEvent.click(within(modal).getByRole("button", { name: "Discard and close" }));
		});
		expect(tauriWindow.destroy).toHaveBeenCalledTimes(1);
	});

	it("lists a dirty document's sanitized title, not a raw bidi override, in the close summary (#175)", async () => {
		const hostile = open("Evil\u202Etitle");
		act(() => {
			requireStores(hostile).model.getState().markDirty();
		});

		render(<Harness />);
		await waitFor(() => expect(tauriWindow.getHandler()).toBeTruthy());

		await act(async () => {
			await tauriWindow.getHandler()?.({ preventDefault: vi.fn() });
		});

		const modal = screen.getByTestId("close-guard-modal");
		expect(within(modal).getByText("Eviltitle")).toBeInTheDocument();
		expect(within(modal).queryByText(/\u202E/)).not.toBeInTheDocument();
	});

	it("cancels the close without destroying the window", async () => {
		const a = open("Alpha");
		act(() => {
			requireStores(a).model.getState().markDirty();
		});
		render(<Harness />);
		await waitFor(() => expect(tauriWindow.getHandler()).toBeTruthy());

		await act(async () => {
			await tauriWindow.getHandler()?.({ preventDefault: vi.fn() });
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		});

		expect(screen.queryByTestId("close-guard-modal")).not.toBeInTheDocument();
		expect(tauriWindow.destroy).not.toHaveBeenCalled();
	});

	it("closes immediately with no summary when nothing is dirty", async () => {
		open("Clean");
		render(<Harness />);
		await waitFor(() => expect(tauriWindow.getHandler()).toBeTruthy());

		const preventDefault = vi.fn();
		await act(async () => {
			await tauriWindow.getHandler()?.({ preventDefault });
		});

		expect(preventDefault).toHaveBeenCalled();
		expect(screen.queryByTestId("close-guard-modal")).not.toBeInTheDocument();
		expect(tauriWindow.destroy).toHaveBeenCalledTimes(1);
	});

	it("falls back to window.confirm on a handler error and never destroys without asking", async () => {
		open("Alpha");
		render(<Harness />);
		await waitFor(() => expect(tauriWindow.getHandler()).toBeTruthy());

		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		// Force the body after preventDefault to throw, exercising the fail-safe fallback.
		const getStateSpy = vi.spyOn(useDocumentRegistry, "getState").mockImplementationOnce(() => {
			throw new Error("boom");
		});

		const preventDefault = vi.fn();
		await act(async () => {
			await tauriWindow.getHandler()?.({ preventDefault });
		});

		// Prevented before the throw, prompted as a fallback, and never destroyed without asking.
		expect(preventDefault).toHaveBeenCalled();
		expect(confirmSpy).toHaveBeenCalled();
		expect(tauriWindow.destroy).not.toHaveBeenCalled();

		getStateSpy.mockRestore();
		confirmSpy.mockRestore();
	});
});

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CloseHandler = (event: { preventDefault: () => void }) => unknown;
type QuitHandler = () => unknown;

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

// Stub the Tauri event bus. `listen("quit-requested", cb)` captures the callback so a test can
// simulate the Rust-emitted native-quit request.
const tauriEvent = vi.hoisted(() => {
	let quitHandler: QuitHandler | null = null;
	let nextListenError: Error | null = null;
	const listen = vi.fn(async (event: string, cb: QuitHandler) => {
		if (nextListenError) {
			const error = nextListenError;
			nextListenError = null;
			throw error;
		}
		if (event === "quit-requested") quitHandler = cb;
		return () => {
			if (event === "quit-requested") quitHandler = null;
		};
	});
	return {
		listen,
		getQuitHandler: () => quitHandler,
		failNextListen: () => {
			nextListenError = new Error("event API unavailable");
		},
		reset: () => {
			quitHandler = null;
			nextListenError = null;
			listen.mockClear();
		},
	};
});

// Stub the Tauri IPC. `confirm_quit` is the only command the guard invokes; record every call.
const tauriCore = vi.hoisted(() => {
	const invoke = vi.fn().mockResolvedValue(undefined);
	return {
		invoke,
		reset: () => invoke.mockClear(),
	};
});

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		onCloseRequested: tauriWindow.onCloseRequested,
		destroy: tauriWindow.destroy,
	}),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: tauriEvent.listen,
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: tauriCore.invoke,
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
	tauriEvent.reset();
	tauriCore.reset();
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

	it("unregisters the window close guard when quit-listener setup fails", async () => {
		tauriEvent.failNextListen();
		const { unmount } = render(<Harness />);
		await waitFor(() => expect(tauriWindow.getHandler()).toBeTruthy());
		await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalled());

		unmount();

		expect(tauriWindow.getHandler()).toBeNull();
	});
});

describe("useCloseGuard desktop quit guard", () => {
	beforeEach(() => {
		(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
	});
	afterEach(() => {
		(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = undefined;
	});

	it("prevents an immediate quit on dirty state, lists every dirty document, and confirms exactly once", async () => {
		const a = open("Alpha");
		const b = open("Beta");
		act(() => {
			requireStores(a).model.getState().markDirty();
			requireStores(b).model.getState().markDirty();
		});

		render(<Harness />);
		await waitFor(() => expect(tauriEvent.getQuitHandler()).toBeTruthy());

		await act(async () => {
			tauriEvent.getQuitHandler()?.();
		});

		// The native quit was already prevented in Rust; the guard must not exit yet. Both dirty
		// documents are listed and no confirmation IPC has fired.
		const modal = await screen.findByTestId("close-guard-modal");
		expect(within(modal).getByText("Alpha")).toBeInTheDocument();
		expect(within(modal).getByText("Beta")).toBeInTheDocument();
		expect(tauriCore.invoke).not.toHaveBeenCalled();

		await act(async () => {
			fireEvent.click(within(modal).getByRole("button", { name: "Discard and quit" }));
		});

		expect(tauriCore.invoke).toHaveBeenCalledTimes(1);
		expect(tauriCore.invoke).toHaveBeenCalledWith("confirm_quit");
	});

	it("cancels a dirty quit without confirming exit", async () => {
		const a = open("Alpha");
		act(() => {
			requireStores(a).model.getState().markDirty();
		});
		render(<Harness />);
		await waitFor(() => expect(tauriEvent.getQuitHandler()).toBeTruthy());

		await act(async () => {
			tauriEvent.getQuitHandler()?.();
		});
		const modal = await screen.findByTestId("close-guard-modal");
		await act(async () => {
			fireEvent.click(within(modal).getByRole("button", { name: "Cancel" }));
		});

		expect(screen.queryByTestId("close-guard-modal")).not.toBeInTheDocument();
		expect(tauriCore.invoke).not.toHaveBeenCalled();
	});

	it("quits immediately with no summary when nothing is dirty", async () => {
		open("Clean");
		render(<Harness />);
		await waitFor(() => expect(tauriEvent.getQuitHandler()).toBeTruthy());

		await act(async () => {
			tauriEvent.getQuitHandler()?.();
		});

		expect(screen.queryByTestId("close-guard-modal")).not.toBeInTheDocument();
		await waitFor(() => expect(tauriCore.invoke).toHaveBeenCalledWith("confirm_quit"));
		expect(tauriCore.invoke).toHaveBeenCalledTimes(1);
	});
});

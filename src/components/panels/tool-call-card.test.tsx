import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CallRecord, CallStatus } from "@/lib/ai/loop/turn-machine";
import { ToolCallBatch, ToolCallCard } from "./tool-call-card";

function mk(overrides: Partial<CallRecord> & Pick<CallRecord, "id" | "status">): CallRecord {
	return {
		toolName: "add_element",
		inputDigest: "d",
		summary: "Add element: Cache (data_store)",
		effect: "mutate",
		destructive: false,
		iteration: 1,
		prepared: null,
		result: null,
		isError: false,
		denialReason: null,
		...overrides,
	};
}

const noop = () => {};

describe("ToolCallCard untrusted text rendering", () => {
	it("renders a hostile summary as literal text with no markup", () => {
		const summary = '<img src=x onerror="alert(1)"> [click](javascript:alert(1)) **bold**';
		const { container } = render(
			<ToolCallCard
				call={mk({ id: "c1", status: "pending", summary })}
				onApprove={noop}
				onDeny={noop}
			/>,
		);
		// No element was created from the model's text.
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("a")).toBeNull();
		expect(container.querySelector("strong")).toBeNull();
		// The markup is visible as literal characters.
		expect(container.textContent).toContain("<img");
		expect(container.textContent).toContain("**bold**");
	});
});

describe("ToolCallCard statuses", () => {
	it("shows Approve and Deny for a pending call and fires the callbacks", () => {
		const onApprove = vi.fn();
		const onDeny = vi.fn();
		render(
			<ToolCallCard
				call={mk({ id: "c1", status: "pending" })}
				onApprove={onApprove}
				onDeny={onDeny}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));
		fireEvent.click(screen.getByRole("button", { name: "Deny" }));
		expect(onApprove).toHaveBeenCalledWith("c1");
		expect(onDeny).toHaveBeenCalledWith("c1");
	});

	it("renders a distinct chip for each terminal and in-flight status", () => {
		const cases: Array<[CallStatus, string]> = [
			["approved", "Queued"],
			["running", "Applying…"],
			["succeeded", "Applied"],
			["failed", "Failed"],
			["undone", "Undone"],
		];
		for (const [status, label] of cases) {
			const { unmount } = render(
				<ToolCallCard call={mk({ id: "c1", status })} onApprove={noop} onDeny={noop} />,
			);
			expect(screen.getByText(label)).toBeInTheDocument();
			unmount();
		}
	});

	it("labels a user-declined call Declined and a not-run call Not run", () => {
		const { unmount } = render(
			<ToolCallCard
				call={mk({ id: "c1", status: "denied", denialReason: "user_declined" })}
				onApprove={noop}
				onDeny={noop}
			/>,
		);
		expect(screen.getByText("Declined")).toBeInTheDocument();
		unmount();

		render(
			<ToolCallCard
				call={mk({ id: "c2", status: "denied", denialReason: "turn_cancelled" })}
				onApprove={noop}
				onDeny={noop}
			/>,
		);
		expect(screen.getByText("Not run")).toBeInTheDocument();
	});
});

describe("ToolCallBatch", () => {
	const calls: CallRecord[] = [
		mk({ id: "c1", status: "pending", summary: "Add A" }),
		mk({ id: "c2", status: "pending", summary: "Update B" }),
		mk({
			id: "c3",
			status: "pending",
			summary: "Delete C",
			destructive: true,
			toolName: "delete_element",
		}),
	];

	it("offers 'Approve all' for the non-destructive calls only and names the exclusion", () => {
		const onApproveBatch = vi.fn();
		render(
			<ToolCallBatch
				calls={calls}
				onApprove={noop}
				onDeny={noop}
				onApproveBatch={onApproveBatch}
			/>,
		);
		const approveAll = screen.getByRole("button", { name: /Approve all 2/ });
		expect(approveAll).toHaveTextContent("excludes 1 destructive");
		fireEvent.click(approveAll);
		// Only the two non-destructive ids are granted; the destructive one is left out.
		expect(onApproveBatch).toHaveBeenCalledWith(["c1", "c2"]);
	});

	it("still gives the destructive call its own Approve button", () => {
		render(<ToolCallBatch calls={calls} onApprove={noop} onDeny={noop} onApproveBatch={noop} />);
		// One Approve button per pending call (3) plus the "Approve all" button.
		expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(3);
	});

	it("announces status through a polite live region", () => {
		render(
			<ToolCallBatch
				calls={[mk({ id: "c1", status: "succeeded", result: "added" })]}
				onApprove={noop}
				onDeny={noop}
				onApproveBatch={noop}
			/>,
		);
		const live = document.querySelector('[aria-live="polite"]');
		expect(live?.textContent).toContain("1 applied");
	});
});

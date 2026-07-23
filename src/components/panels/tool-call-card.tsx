/**
 * Mid-turn approval cards for the bounded tool loop.
 *
 * Each card renders one of the seven call statuses with the affordances from the
 * turn machine's status table. Every piece of model-derived text — the summary,
 * the result, the failure message — is rendered as **text**, never through
 * `MarkdownContent`, preserving the deliberate omission of raw-HTML rendering
 * (`markdown-content.tsx`). The status-to-affordance map is exhaustive over the
 * status union, so a new status fails `tsc --noEmit` rather than rendering
 * nothing.
 */

import { AlertCircle, Ban, Check, Loader2, Play, Undo2 } from "lucide-react";
import { useState } from "react";
import type { DenialReason } from "@/lib/ai/loop/authorization";
import type { CallRecord, CallStatus } from "@/lib/ai/loop/turn-machine";
import { cn } from "@/lib/utils";

/** Longest untrusted text shown before it collapses behind an expander. */
const TEXT_PREVIEW_LIMIT = 240;

function assertNever(value: never): never {
	throw new Error(`Unhandled call status: ${String(value)}`);
}

/** Render untrusted model text as plain text, length-capped with an expander. */
function ExpandableText({ text }: { text: string }) {
	const [expanded, setExpanded] = useState(false);
	if (text.length <= TEXT_PREVIEW_LIMIT) {
		return <span className="whitespace-pre-wrap break-words">{text}</span>;
	}
	const shown = expanded ? text : `${text.slice(0, TEXT_PREVIEW_LIMIT)}…`;
	return (
		<span className="whitespace-pre-wrap break-words">
			{shown}{" "}
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="text-primary underline"
			>
				{expanded ? "Show less" : "Show more"}
			</button>
		</span>
	);
}

/** A neutral status chip with no action. */
function StatusChip({ label, tone }: { label: string; tone: "muted" | "error" | "success" }) {
	return (
		<span
			className={cn(
				"shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
				tone === "muted" && "bg-secondary/60 text-muted-foreground",
				tone === "error" && "bg-destructive/10 text-destructive",
				tone === "success" && "bg-green-500/10 text-green-600 dark:text-green-500",
			)}
		>
			{label}
		</span>
	);
}

/** The label a denied call shows, distinguishing a user refusal from a not-run call. */
function deniedLabel(reason: DenialReason | null): string {
	return reason === "user_declined" ? "Declined" : "Not run";
}

export interface ToolCallCardProps {
	call: CallRecord;
	onApprove: (id: string) => void;
	onDeny: (id: string) => void;
}

/** One tool call, rendered per its status. */
export function ToolCallCard({ call, onApprove, onDeny }: ToolCallCardProps) {
	return (
		<div
			data-testid={`tool-call-${call.id}`}
			data-status={call.status}
			className={cn(
				"flex items-start gap-1.5 rounded border p-1.5 text-[10px]",
				call.status === "failed" || (call.status === "denied" && call.isError)
					? "border-destructive/30 bg-background/50"
					: "border-border/50 bg-background/50",
			)}
		>
			<CallIcon status={call.status} />
			<div className="flex-1">
				<div className={cn(call.status === "undone" && "line-through opacity-70")}>
					<ExpandableText text={call.summary} />
				</div>
				{call.result !== null && call.status !== "pending" && call.status !== "approved" && (
					<div
						className={cn(
							"mt-0.5 text-[10px]",
							call.isError ? "text-destructive" : "text-muted-foreground",
						)}
					>
						<ExpandableText text={call.result} />
					</div>
				)}
			</div>
			<CallAffordance call={call} onApprove={onApprove} onDeny={onDeny} />
		</div>
	);
}

function CallIcon({ status }: { status: CallStatus }) {
	switch (status) {
		case "pending":
		case "approved":
			return <Play className="mt-0.5 h-3 w-3 shrink-0 text-primary" />;
		case "running":
			return <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-muted-foreground" />;
		case "succeeded":
			return <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600 dark:text-green-500" />;
		case "failed":
			return <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />;
		case "denied":
			return <Ban className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />;
		case "undone":
			return <Undo2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />;
		default:
			return assertNever(status);
	}
}

/** The buttons or chip a call shows for its status. Exhaustive over the status union. */
function CallAffordance({ call, onApprove, onDeny }: ToolCallCardProps) {
	switch (call.status) {
		case "pending":
			return (
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={() => onApprove(call.id)}
						className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/20"
						title={call.destructive ? "Approve this destructive change" : "Approve this change"}
					>
						Approve
					</button>
					<button
						type="button"
						onClick={() => onDeny(call.id)}
						className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-destructive"
						title="Decline this change"
					>
						Deny
					</button>
				</div>
			);
		case "approved":
			return <StatusChip label="Queued" tone="muted" />;
		case "running":
			return <StatusChip label="Applying…" tone="muted" />;
		case "succeeded":
			return <StatusChip label="Applied" tone="success" />;
		case "failed":
			return <StatusChip label="Failed" tone="error" />;
		case "undone":
			return <StatusChip label="Undone" tone="muted" />;
		case "denied":
			return <StatusChip label={deniedLabel(call.denialReason)} tone="muted" />;
		default:
			return assertNever(call.status);
	}
}

export interface ToolCallBatchProps {
	calls: CallRecord[];
	onApprove: (id: string) => void;
	onDeny: (id: string) => void;
	onApproveBatch: (ids: string[]) => void;
}

/**
 * The batch header plus the list of cards.
 *
 * "Approve all N" grants only the non-destructive pending calls, and names the
 * excluded destructive count so the consequence of the click is unmistakable.
 * One polite live region per turn announces status changes to assistive tech.
 */
export function ToolCallBatch({ calls, onApprove, onDeny, onApproveBatch }: ToolCallBatchProps) {
	const pending = calls.filter((c) => c.status === "pending");
	const batchable = pending.filter((c) => !c.destructive);
	const destructivePending = pending.length - batchable.length;

	return (
		<div className="flex flex-col gap-1.5 border-t border-border/30 pt-1.5">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[10px] font-medium text-muted-foreground">
					Suggested changes ({calls.length})
				</span>
				{batchable.length > 1 && (
					<button
						type="button"
						onClick={() => onApproveBatch(batchable.map((c) => c.id))}
						className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
						title={
							destructivePending > 0
								? `Approve ${batchable.length} changes; the ${destructivePending} destructive change(s) must be approved individually`
								: `Approve all ${batchable.length} changes`
						}
					>
						<Play className="h-2.5 w-2.5" />
						Approve all {batchable.length}
						{destructivePending > 0 ? ` (excludes ${destructivePending} destructive)` : ""}
					</button>
				)}
			</div>

			{/* One polite live region per turn announces status changes. */}
			<output aria-live="polite" className="sr-only">
				{summarizeStatuses(calls)}
			</output>

			{calls.map((call) => (
				<ToolCallCard key={call.id} call={call} onApprove={onApprove} onDeny={onDeny} />
			))}
		</div>
	);
}

/** A short, plain-text announcement of the batch's current state. */
function summarizeStatuses(calls: CallRecord[]): string {
	const count = (status: CallStatus) => calls.filter((c) => c.status === status).length;
	const parts: string[] = [];
	const pending = count("pending");
	const applied = count("succeeded");
	const failed = count("failed");
	const denied = count("denied");
	const undone = count("undone");
	if (pending > 0) parts.push(`${pending} awaiting review`);
	if (applied > 0) parts.push(`${applied} applied`);
	if (failed > 0) parts.push(`${failed} failed`);
	if (denied > 0) parts.push(`${denied} not run`);
	if (undone > 0) parts.push(`${undone} undone`);
	return parts.join(", ");
}

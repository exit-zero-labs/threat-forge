/**
 * The bounds, the result envelope, and the pagination for every AI read tool.
 *
 * This module owns the only two functions that produce a read tool's `result`
 * string, so a read tool cannot invent its own serialization, its own byte cap,
 * or its own untrusted-text handling. Every bound is a frozen constant with the
 * rationale from the issue plan; the byte cap is enforced with a real UTF-8
 * measurement, never an estimate.
 */

import { canonicalJson } from "@/lib/ai/loop/tool-runtime";
import {
	escapeDocumentText,
	sanitizeUntrustedScalar,
	UNTRUSTED_DOCUMENT_END,
	UNTRUSTED_DOCUMENT_START,
} from "@/lib/ai/untrusted-text";

/**
 * UTF-8 bytes of the serialized payload, excluding the two authored markers.
 * ≈2,048 estimated tokens at the budgeter's 4 chars/token. A worst-case turn of
 * 32 tool calls spends ≈64k estimated tokens — under a third of the smallest
 * curated window (Haiku, 200k) and recoverable by `budgetMessages`.
 */
export const READ_RESULT_MAX_BYTES = 8192;

/** A page a model can reason about in one step; ≈400 bytes per entry within the cap. */
export const DEFAULT_PAGE_LIMIT = 20;

/** Ceiling on `limit`. A larger request is a schema rejection, not a silent clamp. */
export const MAX_PAGE_LIMIT = 50;

/** Ids, names, titles, types, protocols, tags — every short scalar. Matches `MAX_DISPLAY_LENGTH`. */
export const SCALAR_MAX_CODE_POINTS = 200;

/** `description` and `mitigation.description`, only in `get_entity`. Twice the scalar cap. */
export const TEXT_MAX_CODE_POINTS = 400;

/** `technologies`, `tags`, `stores`, `data`, `contains`, and derived reference-id lists. */
export const LIST_MAX_ITEMS = 10;

/** The longest untrusted value echoed back inside an authored failure message. */
export const ECHO_MAX_CODE_POINTS = 80;

/** How a page stopped filling: the count limit, the byte cap, or the end of the matches. */
export type PageStop = "limit" | "bytes" | "end";

/**
 * The pagination metadata every search result carries.
 *
 * `next_offset` is `null` when the page reached the end of the matches, and the
 * offset to resume from otherwise — including when the byte cap, not the count,
 * ended the page, so a model can always page the rest.
 */
export interface PageMeta {
	readonly offset: number;
	readonly limit: number;
	readonly returned: number;
	readonly total: number;
	readonly next_offset: number | null;
	readonly stopped_by: PageStop;
}

/**
 * Sanitize an untrusted scalar (strip control/bidi, cap at `max` code points),
 * then escape it so it can never forge a marker. Returns the truncation flag so
 * the caller can set `"truncated": true` on the entity.
 */
export function escapeScalar(value: string, max: number): { text: string; truncated: boolean } {
	const { text, truncated } = sanitizeUntrustedScalar(value, max);
	return { text: escapeDocumentText(text), truncated };
}

/**
 * Cap an untrusted list to `maxItems` sanitized/escaped scalars and report the
 * original length, so a caller can emit `"<field>_total"` alongside a capped
 * array rather than silently dropping the overflow.
 */
export function escapeList(
	values: readonly string[],
	options: { maxItems: number; maxCodePoints: number },
): { items: string[]; total: number } {
	const items = values
		.slice(0, options.maxItems)
		.map((value) => escapeScalar(value, options.maxCodePoints).text);
	return { items, total: values.length };
}

/** UTF-8 byte length, so a multi-byte document cannot slip past the cap a `String.length` would miss. */
function byteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}

/** The JSON body of a read result: the payload with the authored tool name merged in. */
function serializeBody(tool: string, payload: Record<string, unknown>): string {
	return canonicalJson({ ...payload, tool });
}

/**
 * Serialize a read-tool payload into the fenced, byte-bounded result envelope,
 * or report its size when it does not fit.
 *
 * The body is `canonicalJson` (key-sorted, no whitespace), so byte-identical
 * inputs produce byte-identical results, wrapped in the untrusted-data markers.
 * The byte cap is asserted on the body alone (excluding the markers).
 *
 * A caller that cannot guarantee its payload fits uses this and turns the
 * overflow into a structured failure. Truncating instead is not an option: a
 * short entity and a trimmed one are indistinguishable to the model, so it would
 * reason about a partial entity believing it complete.
 */
export function tryBuildReadResult(args: {
	tool: string;
	payload: Record<string, unknown>;
}): { ok: true; result: string } | { ok: false; bytes: number } {
	const body = serializeBody(args.tool, args.payload);
	const bytes = byteLength(body);
	if (bytes > READ_RESULT_MAX_BYTES) return { ok: false, bytes };
	return { ok: true, result: `${UNTRUSTED_DOCUMENT_START}\n${body}\n${UNTRUSTED_DOCUMENT_END}` };
}

/**
 * {@link tryBuildReadResult} for callers whose payload is already bounded.
 *
 * Throws on overflow, because for these callers it is a programming error and
 * not a runtime condition: {@link paginate} stops adding results at the cap, and
 * the summary payload is a fixed set of counts. A caller whose payload size is
 * driven by document content must use {@link tryBuildReadResult} instead.
 *
 * A paginating caller only earns that guarantee by declaring everything it
 * serializes: fields passed to `paginate` as `envelope` are measured, and fields
 * added afterwards are not, which is how a page fitted to the cap can exceed it.
 */
export function buildReadResult(args: { tool: string; payload: Record<string, unknown> }): string {
	const built = tryBuildReadResult(args);
	if (!built.ok) {
		throw new Error(
			`Read result for "${args.tool}" is ${built.bytes} bytes, over the ${READ_RESULT_MAX_BYTES}-byte cap.`,
		);
	}
	return built.result;
}

function nextOffset(offset: number, returned: number, total: number): number | null {
	return offset + returned < total ? offset + returned : null;
}

/**
 * Walk `items` from `offset` in order, projecting and appending each while the
 * serialized envelope stays within {@link READ_RESULT_MAX_BYTES} and the count
 * stays within `limit`.
 *
 * Returns the assembled `{ page, results }` payload, guaranteed to serialize
 * within the byte cap. The byte check measures the whole trial envelope, so the
 * page meta's own size is accounted for. `stopped_by` distinguishes a full count
 * page (`"limit"`), a byte-bounded page (`"bytes"`), and the true end of the
 * matches (`"end"`).
 *
 * A caller that serializes fields alongside `page` and `results` must pass them
 * as `envelope`, or the guarantee is measured against a smaller body than the
 * one actually sent and a page filled to just under the cap goes over it.
 */
export function paginate<T, P>(
	items: readonly T[],
	options: {
		tool: string;
		offset: number;
		limit: number;
		project: (item: T) => P;
		envelope?: Record<string, unknown>;
	},
): { page: PageMeta; results: P[] } {
	const { tool, offset, limit, project, envelope = {} } = options;
	const total = items.length;
	const window = items.slice(offset);

	const results: P[] = [];
	let stopped: PageStop = "end";

	for (const item of window) {
		if (results.length >= limit) {
			stopped = "limit";
			break;
		}
		const projected = project(item);
		const trial = [...results, projected];
		// Measure with the longest `stopped_by` value so the final result — which
		// may use a shorter one ("end") — can never exceed what was measured here.
		const trialMeta: PageMeta = {
			offset,
			limit,
			returned: trial.length,
			total,
			next_offset: nextOffset(offset, trial.length, total),
			stopped_by: "limit",
		};
		const trialBytes = byteLength(
			serializeBody(tool, { ...envelope, page: trialMeta, results: trial }),
		);
		if (trialBytes > READ_RESULT_MAX_BYTES) {
			stopped = "bytes";
			break;
		}
		results.push(projected);
	}

	const page: PageMeta = {
		offset,
		limit,
		returned: results.length,
		total,
		next_offset: nextOffset(offset, results.length, total),
		stopped_by: stopped,
	};
	return { page, results };
}

/**
 * A structured, corrective read-tool failure.
 *
 * A closed union rendered by {@link describeReadFailure}, mirroring
 * `CommitRefusal`. Each is returned as `{ status: "error" }` so the turn machine
 * marks the `tool_result` `isError` and the model can correct itself, never as an
 * empty success that reads as "there are none".
 */
export type ReadToolFailure =
	| { code: "unknown_id"; kind: string; id: string; count: number }
	| { code: "invalid_filter"; kind: string; filter: string; applicable: readonly string[] }
	| { code: "offset_out_of_range"; kind: string; offset: number; total: number }
	| { code: "entity_too_large"; kind: string; id: string; bytes: number };

/**
 * Render a failure into an authored, model-facing message.
 *
 * The only untrusted value in any message is the echoed id, which is sanitized,
 * escaped, and capped at {@link ECHO_MAX_CODE_POINTS}. The message is authored
 * text and is deliberately not wrapped in the untrusted-data markers.
 */
export function describeReadFailure(failure: ReadToolFailure): string {
	switch (failure.code) {
		case "unknown_id": {
			const echo = escapeScalar(failure.id, ECHO_MAX_CODE_POINTS).text;
			return (
				`No "${failure.kind}" entity with id "${echo}" exists in the current document. ` +
				`The document has ${failure.count} "${failure.kind}" entries; call search_entities ` +
				`with kind "${failure.kind}" to see which ids exist.`
			);
		}
		case "invalid_filter":
			return (
				`The filter "${failure.filter}" does not apply to kind "${failure.kind}". ` +
				`Filters for "${failure.kind}": ${failure.applicable.join(", ")}.`
			);
		case "offset_out_of_range":
			return (
				`Offset ${failure.offset} is past the end of the ${failure.total} "${failure.kind}" ` +
				`that match. Valid offsets are 0 to ${failure.total - 1}.`
			);
		case "entity_too_large": {
			const echo = escapeScalar(failure.id, ECHO_MAX_CODE_POINTS).text;
			return (
				`The "${failure.kind}" entity "${echo}" is ${failure.bytes} bytes projected, over the ` +
				`${READ_RESULT_MAX_BYTES}-byte result cap, so it cannot be returned whole. Call ` +
				`search_entities with kind "${failure.kind}" to read its compact projection.`
			);
		}
	}
}

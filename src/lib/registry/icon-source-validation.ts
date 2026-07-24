/**
 * Contribution-time SVG source validator.
 *
 * This is an allow-list reducer that accepts an SVG source document only if it reduces
 * to constrained path data, and rejects everything else with a reason. It runs where
 * untrusted SVG actually exists — icon contribution and CI — and NEVER ships to the
 * runtime bundle (`no-runtime-svg-parser.test.ts` enforces that mechanically).
 *
 * It is a contribution-hygiene gate, not the product's last line of defense. The shipped
 * safety property is that icon geometry is only ever path data constrained to a character
 * allow-list, rendered as attributes React sets on elements it constructs — no HTML
 * parsing, no `dangerouslySetInnerHTML`, no registry-supplied `style`/`class`/`fill`.
 * See `docs/knowledge/component-registry.md`.
 */

import type { IconPath } from "@/lib/registry/types";

/** Result of reducing an SVG source to path data. */
export type ParseIconSvgResult =
	| { readonly ok: true; readonly paths: readonly IconPath[] }
	| { readonly ok: false; readonly reason: string };

/** Path-data characters: SVG path commands, digits, sign, decimal point, separators. */
const PATH_D_ALLOWED = /^[MmZzLlHhVvCcSsQqTtAaEe0-9+\-.,\s]+$/;

/** Maximum length of a single `d` attribute after normalization. */
const MAX_PATH_D_LENGTH = 8 * 1024;

/** The only viewBox the runtime renders. */
const REQUIRED_VIEWBOX = "0 0 24 24";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const ALLOWED_SVG_ATTRIBUTES = new Set(["xmlns", "viewBox", "width", "height", "role", "fill"]);
const ALLOWED_PATH_ATTRIBUTES = new Set(["d", "fill-rule"]);
const ALLOWED_FILL_VALUES = new Set(["none", "currentColor"]);

/** Collapse whitespace runs to single spaces and trim. */
function normalizeD(d: string): string {
	return d.replace(/\s+/g, " ").trim();
}

/**
 * Reduce an SVG source document to its path data, or reject it with a reason.
 *
 * Runs at contribution/CI time only. See module header for the layered safety model.
 */
export function parseIconSvg(source: string): ParseIconSvgResult {
	// Pre-parse textual gate. Entity and DOCTYPE handling differs between XML parsers,
	// so these must be rejected before the source reaches any parser.
	if (/<!DOCTYPE/i.test(source)) {
		return { ok: false, reason: "DOCTYPE declaration is not allowed" };
	}
	if (/<!ENTITY/i.test(source)) {
		return { ok: false, reason: "ENTITY declaration is not allowed" };
	}
	// Allow a single leading `<?xml ... ?>` declaration; reject any other processing
	// instruction. The whitespace after `xml` is required so `<?xml-stylesheet ...?>`
	// (a distinct PI) is not mistaken for the declaration.
	const withoutXmlDecl = source.replace(/^\s*<\?xml\s[^>]*\?>/, "");
	if (/<\?/.test(withoutXmlDecl)) {
		return { ok: false, reason: "processing instructions are not allowed" };
	}

	const doc = new DOMParser().parseFromString(source, "image/svg+xml");
	if (doc.getElementsByTagName("parsererror").length > 0) {
		return { ok: false, reason: "source is not well-formed XML" };
	}

	const root = doc.documentElement;
	if (root.localName !== "svg" || root.prefix !== null) {
		return { ok: false, reason: "root element must be an unprefixed <svg>" };
	}
	if (root.namespaceURI !== SVG_NAMESPACE) {
		return { ok: false, reason: `<svg> must use the ${SVG_NAMESPACE} namespace` };
	}

	const rootReason = validateSvgRoot(root);
	if (rootReason) return { ok: false, reason: rootReason };

	const paths: IconPath[] = [];
	const walkReason = walkChildren(root, paths);
	if (walkReason) return { ok: false, reason: walkReason };

	if (paths.length === 0) {
		return { ok: false, reason: "source contains no <path> elements" };
	}
	return { ok: true, paths };
}

/** Validate the <svg> root element's attributes. */
function validateSvgRoot(root: Element): string | null {
	if (root.getAttribute("viewBox")?.trim() !== REQUIRED_VIEWBOX) {
		return `<svg> viewBox must equal "${REQUIRED_VIEWBOX}"`;
	}
	for (const attr of Array.from(root.attributes)) {
		const name = attr.name;
		if (!ALLOWED_SVG_ATTRIBUTES.has(name)) {
			return `<svg> has a disallowed attribute: ${name}`;
		}
		if (name === "fill" && !ALLOWED_FILL_VALUES.has(attr.value.trim())) {
			return `<svg> fill must be "none" or "currentColor"`;
		}
	}
	return null;
}

/** Walk allowed children of an element, collecting reduced paths. */
function walkChildren(parent: Element, paths: IconPath[]): string | null {
	for (const node of Array.from(parent.childNodes)) {
		if (node.nodeType === node.TEXT_NODE) {
			if (parent.localName === "svg" && node.textContent && node.textContent.trim() !== "") {
				return "unexpected text content in <svg>";
			}
			continue;
		}
		if (node.nodeType === node.COMMENT_NODE) continue;
		if (node.nodeType !== node.ELEMENT_NODE) {
			return "unexpected non-element node";
		}

		if (!(node instanceof Element)) {
			return "unexpected non-element node";
		}
		const el = node;
		if (el.prefix !== null) {
			return `namespaced element is not allowed: ${el.prefix}:${el.localName}`;
		}
		switch (el.localName) {
			case "path": {
				const reason = validatePath(el, paths);
				if (reason) return reason;
				break;
			}
			case "title":
			case "desc": {
				const reason = validateTextOnly(el);
				if (reason) return reason;
				break;
			}
			default:
				return `element is not allowed: <${el.localName}>`;
		}
	}
	return null;
}

/** A <title>/<desc> may hold only text; its content is discarded. */
function validateTextOnly(el: Element): string | null {
	for (const attr of Array.from(el.attributes)) {
		return `<${el.localName}> has a disallowed attribute: ${attr.name}`;
	}
	for (const child of Array.from(el.childNodes)) {
		if (child.nodeType !== child.TEXT_NODE) {
			return `<${el.localName}> may contain text only`;
		}
	}
	return null;
}

/** Validate a <path> and append its reduced form. */
function validatePath(el: Element, paths: IconPath[]): string | null {
	let d: string | null = null;
	let fillRule: "evenodd" | "nonzero" | undefined;
	for (const attr of Array.from(el.attributes)) {
		if (el.attributes.getNamedItem(attr.name)?.prefix != null) {
			return `<path> has a namespaced attribute: ${attr.name}`;
		}
		if (!ALLOWED_PATH_ATTRIBUTES.has(attr.name)) {
			return `<path> has a disallowed attribute: ${attr.name}`;
		}
		if (attr.name === "d") {
			d = normalizeD(attr.value);
		}
		if (attr.name === "fill-rule") {
			if (attr.value !== "evenodd" && attr.value !== "nonzero") {
				return `<path> fill-rule must be "evenodd" or "nonzero"`;
			}
			fillRule = attr.value;
		}
	}
	if (el.childNodes.length > 0) {
		for (const child of Array.from(el.childNodes)) {
			if (child instanceof Element) {
				return `<path> may not contain child elements: <${child.localName}>`;
			}
		}
		return "<path> must be empty";
	}
	if (d === null || d === "") {
		return "<path> is missing a d attribute";
	}
	if (d.length > MAX_PATH_D_LENGTH) {
		return `<path> d exceeds the ${MAX_PATH_D_LENGTH}-byte bound`;
	}
	if (!PATH_D_ALLOWED.test(d)) {
		return "<path> d contains disallowed characters";
	}
	paths.push(fillRule ? { d, fillRule } : { d });
	return null;
}

/** True if `d` satisfies the runtime path-data character allow-list and size bound. */
export function isAllowedPathData(d: string): boolean {
	return d.length > 0 && d.length <= MAX_PATH_D_LENGTH && PATH_D_ALLOWED.test(d);
}

export { MAX_PATH_D_LENGTH };

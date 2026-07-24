import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { hasLucideIcon, IconRenderer, LUCIDE_ICONS } from "@/components/icons/icon-renderer";
import { COMPONENT_ENTRIES } from "@/lib/registry/component-entries";
import { ICON_ENTRIES } from "@/lib/registry/icon-entries";
import { getIcon, resolveElementIcon } from "@/lib/registry/registry";

/**
 * The renderer owns the only `lucide-react` name map and the only SVG element construction.
 * The "every lucide name resolves to a bundled component" assertion is re-homed here from the
 * deleted `component-library.test.ts`.
 */

describe("icon renderer: lucide name map", () => {
	it("every kind:lucide entry names a component in the renderer map", () => {
		for (const entry of ICON_ENTRIES) {
			if (entry.artwork.kind !== "lucide") continue;
			expect(
				hasLucideIcon(entry.artwork.name),
				`icon "${entry.id}" names lucide "${entry.artwork.name}" which is not in the renderer map`,
			).toBe(true);
		}
	});

	it("has no unused names beyond the shipped lucide entries", () => {
		const usedNames = new Set(
			ICON_ENTRIES.flatMap((e) => (e.artwork.kind === "lucide" ? [e.artwork.name] : [])),
		);
		for (const name of Object.keys(LUCIDE_ICONS)) {
			expect(usedNames.has(name), `lucide "${name}" is mapped but no icon entry uses it`).toBe(
				true,
			);
		}
	});

	it("every component and variant references a real icon entry", () => {
		for (const component of COMPONENT_ENTRIES) {
			expect(
				getIcon(component.iconId),
				`${component.id} iconId "${component.iconId}"`,
			).toBeDefined();
			for (const variant of component.variants) {
				expect(
					getIcon(variant.iconId),
					`${component.id}/${variant.id} iconId "${variant.iconId}"`,
				).toBeDefined();
			}
		}
	});
});

describe("icon renderer: artwork rendering", () => {
	it("renders a lucide entry as an svg", () => {
		const box = getIcon("box");
		expect(box).toBeDefined();
		if (!box) return;
		const { container } = render(<IconRenderer icon={box} className="h-4 w-4" />);
		const svg = container.querySelector("svg");
		expect(svg).not.toBeNull();
		expect(svg?.getAttribute("class")).toContain("h-4");
	});

	it("renders a kind:paths brand mark as constrained path geometry", () => {
		const docker = getIcon("docker");
		expect(docker?.artwork.kind).toBe("paths");
		if (!docker) return;
		const { container } = render(<IconRenderer icon={docker} className="h-4 w-4" />);
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
		expect(svg?.getAttribute("fill")).toBe("currentColor");
		const path = container.querySelector("path");
		expect(path?.getAttribute("d")?.startsWith("M13.983 11.078")).toBe(true);
		// No className/style/fill leaks onto the path from registry data.
		expect(path?.getAttribute("style")).toBeNull();
	});

	it("renders a withdrawn entry as its fallback glyph", () => {
		const aws = getIcon("aws");
		expect(aws?.artwork.kind).toBe("withdrawn");
		if (!aws) return;
		// aws falls back to `archive` (a lucide entry), so the output is a lucide svg.
		const { container } = render(<IconRenderer icon={aws} className="h-4 w-4" />);
		expect(container.querySelector("svg")).not.toBeNull();
	});
});

describe("icon renderer: untrusted input can never become markup", () => {
	it("an injected type/icon renders the inert generic glyph, never a script", () => {
		const icon = resolveElementIcon({
			type: "../../etc/passwd",
			subtype: "</path><script>",
			icon: "</path><script>alert(1)</script>",
		});
		expect(icon.id).toBe("box");
		const { container } = render(<IconRenderer icon={icon} className="h-4 w-4" />);
		expect(container.querySelector("script")).toBeNull();
		expect(container.querySelector("svg")).not.toBeNull();
	});
});

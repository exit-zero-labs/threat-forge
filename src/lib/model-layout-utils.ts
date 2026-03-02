import type { DiagramLayout, ThreatModel } from "@/types/threat-model";

/** Build a DiagramLayout from inline model positions (for setPendingLayout). */
export function buildLayoutFromModel(model: ThreatModel): DiagramLayout | null {
	if (model.diagrams.length === 0) return null;

	const diagram = model.diagrams[0];

	const hasInlinePositions =
		model.elements.some((e) => e.position) || model.trust_boundaries.some((b) => b.position);

	if (!hasInlinePositions && !diagram.viewport) return null;

	const nodes = [
		...model.elements
			.filter((e) => e.position)
			.map((e) => ({
				id: e.id,
				x: e.position?.x ?? 0,
				y: e.position?.y ?? 0,
			})),
		...model.trust_boundaries
			.filter((b) => b.position)
			.map((b) => ({
				id: b.id,
				x: b.position?.x ?? 0,
				y: b.position?.y ?? 0,
				width: b.size?.width,
				height: b.size?.height,
			})),
	];

	return {
		diagram_id: diagram.id,
		viewport: diagram.viewport ?? { x: 0, y: 0, zoom: 1 },
		nodes,
	};
}

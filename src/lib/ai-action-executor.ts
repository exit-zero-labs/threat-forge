/**
 * AI Action Executor — applies validated AI actions to the threat model via stores.
 */

import type { AiAction } from "@/lib/ai-actions";
import { generateBoundaryId, generateElementId, generateFlowId } from "@/stores/canvas-store";
import { useHistoryStore } from "@/stores/history-store";
import { useModelStore } from "@/stores/model-store";
import type { DataFlow, Element, Threat, ThreatModel, TrustBoundary } from "@/types/threat-model";

function generateThreatId(): string {
	const hex = Math.random().toString(16).slice(2, 10);
	return `threat-${hex}`;
}

/** Apply a single AI action to the model. Returns updated model or null on failure. */
function applyAction(model: ThreatModel, action: AiAction): ThreatModel | null {
	switch (action.action) {
		case "add_element": {
			const id = generateElementId();
			const newEl: Element = {
				id,
				type: action.element.type,
				name: action.element.name,
				trust_zone: action.element.trust_zone ?? "",
				description: action.element.description ?? "",
				technologies: action.element.technologies ?? [],
			};
			return { ...model, elements: [...model.elements, newEl] };
		}

		case "update_element": {
			const idx = model.elements.findIndex((e) => e.id === action.id);
			if (idx === -1) return null;
			const updated = { ...model.elements[idx], ...action.updates };
			const elements = [...model.elements];
			elements[idx] = updated;
			return { ...model, elements };
		}

		case "delete_element": {
			const exists = model.elements.some((e) => e.id === action.id);
			if (!exists) return null;
			return {
				...model,
				elements: model.elements.filter((e) => e.id !== action.id),
				data_flows: model.data_flows.filter((f) => f.from !== action.id && f.to !== action.id),
				trust_boundaries: model.trust_boundaries.map((b) => ({
					...b,
					contains: b.contains.filter((c) => c !== action.id),
				})),
			};
		}

		case "add_data_flow": {
			const id = generateFlowId();
			// Compute next flow number
			const maxNum = model.data_flows.reduce((max, f) => Math.max(max, f.flow_number ?? 0), 0);
			const newFlow: DataFlow = {
				id,
				flow_number: maxNum + 1,
				name: action.data_flow.name ?? "",
				from: action.data_flow.from,
				to: action.data_flow.to,
				protocol: action.data_flow.protocol ?? "",
				data: action.data_flow.data ?? [],
				authenticated: action.data_flow.authenticated ?? false,
			};
			return { ...model, data_flows: [...model.data_flows, newFlow] };
		}

		case "update_data_flow": {
			const idx = model.data_flows.findIndex((f) => f.id === action.id);
			if (idx === -1) return null;
			const updated = { ...model.data_flows[idx], ...action.updates };
			const data_flows = [...model.data_flows];
			data_flows[idx] = updated;
			return { ...model, data_flows };
		}

		case "delete_data_flow": {
			const exists = model.data_flows.some((f) => f.id === action.id);
			if (!exists) return null;
			return {
				...model,
				data_flows: model.data_flows.filter((f) => f.id !== action.id),
			};
		}

		case "add_trust_boundary": {
			const id = generateBoundaryId();
			const newBoundary: TrustBoundary = {
				id,
				name: action.trust_boundary.name,
				contains: action.trust_boundary.contains ?? [],
			};
			return { ...model, trust_boundaries: [...model.trust_boundaries, newBoundary] };
		}

		case "update_trust_boundary": {
			const idx = model.trust_boundaries.findIndex((b) => b.id === action.id);
			if (idx === -1) return null;
			const updated = { ...model.trust_boundaries[idx], ...action.updates };
			const trust_boundaries = [...model.trust_boundaries];
			trust_boundaries[idx] = updated;
			return { ...model, trust_boundaries };
		}

		case "delete_trust_boundary": {
			const exists = model.trust_boundaries.some((b) => b.id === action.id);
			if (!exists) return null;
			return {
				...model,
				trust_boundaries: model.trust_boundaries.filter((b) => b.id !== action.id),
			};
		}

		case "add_threat": {
			const id = generateThreatId();
			const newThreat: Threat = {
				id,
				title: action.threat.title,
				category: action.threat.category,
				element: action.threat.element,
				flow: action.threat.flow,
				severity: action.threat.severity,
				description: action.threat.description,
				mitigation: action.threat.mitigation,
			};
			return { ...model, threats: [...model.threats, newThreat] };
		}

		case "update_threat": {
			const idx = model.threats.findIndex((t) => t.id === action.id);
			if (idx === -1) return null;
			const updated = { ...model.threats[idx], ...action.updates };
			const threats = [...model.threats];
			threats[idx] = updated;
			return { ...model, threats };
		}

		case "delete_threat": {
			const exists = model.threats.some((t) => t.id === action.id);
			if (!exists) return null;
			return {
				...model,
				threats: model.threats.filter((t) => t.id !== action.id),
			};
		}
	}
}

/** Execute a batch of AI actions against the current model. Pushes undo snapshot. */
export function executeActions(actions: AiAction[]): { applied: number; failed: number } {
	const model = useModelStore.getState().model;
	if (!model) return { applied: 0, failed: actions.length };

	useHistoryStore.getState().pushSnapshot(model);

	let current = model;
	let applied = 0;
	let failed = 0;

	for (const action of actions) {
		const result = applyAction(current, action);
		if (result) {
			current = result;
			applied++;
		} else {
			failed++;
		}
	}

	if (applied > 0) {
		useModelStore.getState().setModel(current, useModelStore.getState().filePath);
		useModelStore.getState().markDirty();
	}

	return { applied, failed };
}

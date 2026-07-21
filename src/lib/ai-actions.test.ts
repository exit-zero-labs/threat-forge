import { describe, expect, it } from "vitest";
import { type AiAction, describeAction, extractActions } from "./ai-actions";

describe("extractActions", () => {
	it("extracts valid actions from a fenced block", () => {
		const text = `Here are the changes:

\`\`\`actions
[
  { "action": "add_element", "element": { "type": "process", "name": "Auth Service", "trust_zone": "internal" } }
]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		expect(actions[0].action).toBe("add_element");
	});

	it("extracts multiple actions from one block", () => {
		const text = `\`\`\`actions
[
  { "action": "add_element", "element": { "type": "process", "name": "Svc A" } },
  { "action": "add_data_flow", "data_flow": { "from": "a", "to": "b" } },
  { "action": "delete_element", "id": "old" }
]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(3);
	});

	it("extracts actions from multiple blocks", () => {
		const text = `\`\`\`actions
[{ "action": "add_element", "element": { "type": "process", "name": "A" } }]
\`\`\`
Some text
\`\`\`actions
[{ "action": "delete_element", "id": "b" }]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(2);
	});

	it("returns empty array for no actions blocks", () => {
		expect(extractActions("Just some text")).toEqual([]);
	});

	it("returns empty array for malformed JSON", () => {
		const text = "```actions\n{broken json}\n```";
		expect(extractActions(text)).toEqual([]);
	});

	it("skips invalid actions but keeps valid ones", () => {
		const text = `\`\`\`actions
[
  { "action": "add_element", "element": { "type": "process", "name": "Valid" } },
  { "action": "invalid_type" },
  { "action": "add_element", "element": {} }
]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		expect(actions[0].action).toBe("add_element");
	});

	it("validates add_element requires type and name", () => {
		const text = `\`\`\`actions
[{ "action": "add_element", "element": { "type": "process" } }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});

	it("validates add_data_flow requires from and to", () => {
		const text = `\`\`\`actions
[{ "action": "add_data_flow", "data_flow": { "from": "a" } }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});

	it("validates add_trust_boundary requires name", () => {
		const text = `\`\`\`actions
[{ "action": "add_trust_boundary", "trust_boundary": {} }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});

	it("validates add_threat requires title, category, severity, description", () => {
		const text = `\`\`\`actions
[{ "action": "add_threat", "threat": { "title": "Test", "category": "Spoofing", "severity": "high", "description": "Risk" } }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(1);
	});

	it("rejects add_threat with invalid category", () => {
		const text = `\`\`\`actions
[{ "action": "add_threat", "threat": { "title": "Test", "category": "InvalidCategory", "severity": "high", "description": "Risk" } }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});

	it("rejects add_threat with invalid severity", () => {
		const text = `\`\`\`actions
[{ "action": "add_threat", "threat": { "title": "Test", "category": "Spoofing", "severity": "extreme", "description": "Risk" } }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});

	it("validates update actions require id and updates", () => {
		const validUpdate = `\`\`\`actions
[{ "action": "update_element", "id": "api-gw", "updates": { "name": "New Name" } }]
\`\`\``;
		expect(extractActions(validUpdate)).toHaveLength(1);

		const noId = `\`\`\`actions
[{ "action": "update_element", "updates": { "name": "New Name" } }]
\`\`\``;
		expect(extractActions(noId)).toHaveLength(0);

		const noUpdates = `\`\`\`actions
[{ "action": "update_element", "id": "api-gw" }]
\`\`\``;
		expect(extractActions(noUpdates)).toHaveLength(0);
	});

	it("validates delete actions require id", () => {
		const valid = `\`\`\`actions
[{ "action": "delete_element", "id": "old-svc" }]
\`\`\``;
		expect(extractActions(valid)).toHaveLength(1);

		const noId = `\`\`\`actions
[{ "action": "delete_element" }]
\`\`\``;
		expect(extractActions(noId)).toHaveLength(0);
	});

	it("handles a single action object (not array)", () => {
		const text = `\`\`\`actions
{ "action": "add_element", "element": { "type": "data_store", "name": "DB" } }
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
	});
});

describe("update action field allowlist", () => {
	const updateActions = [
		{ action: "update_element", legalField: "name" },
		{ action: "update_data_flow", legalField: "protocol" },
		{ action: "update_trust_boundary", legalField: "name" },
		{ action: "update_threat", legalField: "title" },
	] as const;

	for (const { action, legalField } of updateActions) {
		it(`rejects ${action} that rewrites id`, () => {
			const text = `\`\`\`actions
[{ "action": "${action}", "id": "original", "updates": { "id": "hijacked" } }]
\`\`\``;
			expect(extractActions(text)).toHaveLength(0);
		});

		it(`rejects ${action} that smuggles id alongside a legal field`, () => {
			const text = `\`\`\`actions
[{ "action": "${action}", "id": "original", "updates": { "${legalField}": "Renamed", "id": "hijacked" } }]
\`\`\``;
			expect(extractActions(text)).toHaveLength(0);
		});

		it(`still accepts ${action} carrying only writable fields`, () => {
			const text = `\`\`\`actions
[{ "action": "${action}", "id": "original", "updates": { "${legalField}": "Renamed" } }]
\`\`\``;
			expect(extractActions(text)).toHaveLength(1);
		});

		it(`rejects ${action} carrying an unknown field`, () => {
			const text = `\`\`\`actions
[{ "action": "${action}", "id": "original", "updates": { "${legalField}": "Renamed", "injected": true } }]
\`\`\``;
			expect(extractActions(text)).toHaveLength(0);
		});

		it(`rejects ${action} whose updates is an array`, () => {
			const text = `\`\`\`actions
[{ "action": "${action}", "id": "original", "updates": ["id", "hijacked"] }]
\`\`\``;
			expect(extractActions(text)).toHaveLength(0);
		});
	}

	it("rejects a hijacking action without discarding valid actions beside it", () => {
		const text = `\`\`\`actions
[
  { "action": "update_element", "id": "a", "updates": { "id": "hijacked" } },
  { "action": "update_element", "id": "b", "updates": { "name": "Legit" } }
]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		expect(actions[0].action === "update_element" && actions[0].id).toBe("b");
	});

	it("rejects keys that a prototype-walking check would let through", () => {
		for (const key of ["__proto__", "toString", "constructor", "hasOwnProperty"]) {
			const text = `\`\`\`actions
[{ "action": "update_element", "id": "a", "updates": { "${key}": "x" } }]
\`\`\``;
			expect(extractActions(text), `${key} must not be writable`).toHaveLength(0);
		}
	});
});

describe("update payloads keep every schema field writable", () => {
	// `id` is the single excluded field. Narrowing the rest to a "sensible"
	// subset would silently withdraw working behavior: the system prompt prints
	// each element's `position` and `subtype` back to the model, and `stores` and
	// `encryption` have no property-panel editor at all, so the assistant is the
	// only in-app way to set them.
	it("accepts every non-id Element field", () => {
		const text = `\`\`\`actions
[{ "action": "update_element", "id": "api-gw", "updates": {
  "name": "Gateway", "type": "process", "trust_zone": "dmz", "subtype": "alb",
  "icon": "aws/alb", "description": "Edge", "technologies": ["nginx"],
  "stores": ["session"], "encryption": "AES-256", "position": { "x": 10, "y": 20 },
  "fill_color": "#fff", "stroke_color": "#000", "fill_opacity": 0.5,
  "stroke_opacity": 1, "font_size": 12, "font_weight": "bold"
} }]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		const [action] = actions;
		if (action.action !== "update_element") throw new Error("expected update_element");
		expect(Object.keys(action.updates)).toHaveLength(16);
	});

	it("accepts every non-id DataFlow field", () => {
		const text = `\`\`\`actions
[{ "action": "update_data_flow", "id": "f1", "updates": {
  "flow_number": 2, "name": "Req", "from": "a", "to": "b", "protocol": "HTTPS",
  "data": ["pii"], "authenticated": true, "label_offset": { "x": 1, "y": 2 },
  "source_handle": "right", "target_handle": "left",
  "stroke_color": "#000", "stroke_opacity": 0.8
} }]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		const [action] = actions;
		if (action.action !== "update_data_flow") throw new Error("expected update_data_flow");
		expect(Object.keys(action.updates)).toHaveLength(12);
	});

	it("accepts every non-id TrustBoundary field", () => {
		const text = `\`\`\`actions
[{ "action": "update_trust_boundary", "id": "tb1", "updates": {
  "name": "DMZ", "contains": ["a"], "position": { "x": 0, "y": 0 },
  "size": { "width": 100, "height": 50 },
  "fill_color": "#eee", "stroke_color": "#333", "fill_opacity": 0.2, "stroke_opacity": 1
} }]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		const [action] = actions;
		if (action.action !== "update_trust_boundary") throw new Error("expected boundary update");
		expect(Object.keys(action.updates)).toHaveLength(8);
	});

	it("accepts every non-id Threat field", () => {
		const text = `\`\`\`actions
[{ "action": "update_threat", "id": "t1", "updates": {
  "title": "SQL Injection", "category": "Tampering", "element": "api-gw",
  "flow": "f1", "severity": "high", "description": "Risk",
  "mitigation": { "status": "mitigated", "description": "Added WAF" }
} }]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		const [action] = actions;
		if (action.action !== "update_threat") throw new Error("expected update_threat");
		expect(Object.keys(action.updates)).toHaveLength(7);
	});
});

describe("update payload value types", () => {
	// A well-named field carrying the wrong type propagates into rendering and
	// serialization: the executor spreads `updates` over a real entity, so
	// `technologies: "text"` reaches a `.map` call in the canvas node and throws
	// during render, with no error boundary to contain it.
	const badValues: ReadonlyArray<[string, string, string]> = [
		["update_element", "technologies", '"not-an-array"'],
		["update_element", "technologies", "[1, 2]"],
		["update_element", "name", '{ "nested": true }'],
		["update_element", "position", '{ "x": "left", "y": 0 }'],
		["update_element", "font_size", '"large"'],
		["update_data_flow", "authenticated", '"yes"'],
		["update_data_flow", "data", '"pii"'],
		["update_data_flow", "flow_number", '"two"'],
		["update_trust_boundary", "contains", "5"],
		["update_trust_boundary", "size", '{ "width": 10 }'],
		["update_threat", "category", '"Bogus"'],
		["update_threat", "mitigation", '{ "status": "bogus", "description": "x" }'],
		["update_threat", "mitigation", '"mitigated"'],
		["update_threat", "severity", "5"],
	];

	for (const [action, field, value] of badValues) {
		it(`rejects ${action}.${field} = ${value}`, () => {
			const text = `\`\`\`actions
[{ "action": "${action}", "id": "x", "updates": { "${field}": ${value} } }]
\`\`\``;
			expect(extractActions(text)).toHaveLength(0);
		});
	}

	it("rejects a non-string severity without discarding the rest of the block", () => {
		// `severity` used to be passed to `.toLowerCase()`, which threw on a
		// number. The throw escaped into extractActions' catch and silently
		// discarded every remaining action in the same block.
		const text = `\`\`\`actions
[
  { "action": "update_threat", "id": "t1", "updates": { "severity": 5 } },
  { "action": "update_element", "id": "e1", "updates": { "name": "Survivor" } }
]
\`\`\``;
		const actions = extractActions(text);
		expect(actions).toHaveLength(1);
		expect(actions[0].action === "update_element" && actions[0].id).toBe("e1");
	});
});

describe("add payloads reject invented fields", () => {
	// Adds are validated against the same generated schemas as updates, so a key
	// the executor would ignore no longer travels silently into an applied action.
	it("rejects an add_element carrying an unknown element field", () => {
		const text = `\`\`\`actions
[{ "action": "add_element", "element": { "type": "process", "name": "Auth", "owner": "attacker" } }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});

	it("rejects an add_threat whose mitigation status is not a known status", () => {
		const text = `\`\`\`actions
[{ "action": "add_threat", "threat": { "title": "T", "category": "Spoofing", "severity": "high",
   "description": "Risk", "mitigation": { "status": "handled", "description": "x" } } }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});

	it("rejects an empty id on a delete", () => {
		const text = `\`\`\`actions
[{ "action": "delete_element", "id": "" }]
\`\`\``;
		expect(extractActions(text)).toHaveLength(0);
	});
});

describe("describeAction", () => {
	it("describes add_element", () => {
		const action: AiAction = {
			action: "add_element",
			element: { type: "process", name: "Auth Service" },
		};
		expect(describeAction(action)).toBe("Add element: Auth Service (process)");
	});

	it("describes add_data_flow", () => {
		const action: AiAction = {
			action: "add_data_flow",
			data_flow: { from: "a", to: "b" },
		};
		expect(describeAction(action)).toContain("a");
		expect(describeAction(action)).toContain("b");
	});

	it("describes delete actions", () => {
		const action: AiAction = { action: "delete_element", id: "old-svc" };
		expect(describeAction(action)).toContain("old-svc");
	});

	it("describes add_threat", () => {
		const action: AiAction = {
			action: "add_threat",
			threat: {
				title: "SQL Injection",
				category: "Tampering",
				severity: "high",
				description: "Risk",
			},
		};
		expect(describeAction(action)).toContain("SQL Injection");
	});
});

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

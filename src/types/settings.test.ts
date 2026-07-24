/** Keep persisted settings defaults aligned with the curated model catalog. */

import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "@/lib/ai-models";
import { DEFAULT_USER_SETTINGS } from "./settings";

describe("DEFAULT_USER_SETTINGS AI model defaults", () => {
	it("matches both catalog defaults", () => {
		expect(DEFAULT_USER_SETTINGS).toMatchObject({
			aiModelAnthropic: DEFAULT_ANTHROPIC_MODEL,
			aiModelOpenai: DEFAULT_OPENAI_MODEL,
		});
	});
});

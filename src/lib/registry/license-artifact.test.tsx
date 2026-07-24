import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TermsPage } from "@/pages/terms-page";
import licenseRaw from "../../../LICENSE?raw";
import noticeRaw from "../../../NOTICE?raw";
import tauriConfig from "../../../src-tauri/tauri.conf.json";

describe("icon license artifact inclusion", () => {
	it("the web legal page embeds the canonical LICENSE and NOTICE", () => {
		const { container } = render(
			<MemoryRouter>
				<TermsPage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Open-source and third-party license notices")).toBeInTheDocument();
		expect(container.textContent).toContain(licenseRaw);
		expect(container.textContent).toContain(noticeRaw);
	});

	it("desktop bundles include the canonical LICENSE and NOTICE", () => {
		expect(tauriConfig.bundle.licenseFile).toBe("../LICENSE");
		expect(tauriConfig.bundle.resources).toEqual({
			"../LICENSE": "LICENSE",
			"../NOTICE": "NOTICE",
		});
	});

	it("NOTICE carries the complete Lucide ISC and Feather MIT grants", () => {
		expect(noticeRaw).toContain(
			"Permission to use, copy, modify, and/or distribute this software for any",
		);
		expect(noticeRaw).toContain(
			"Permission is hereby granted, free of charge, to any person obtaining a copy",
		);
	});
});

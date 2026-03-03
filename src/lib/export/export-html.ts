import type {
	DataFlow,
	Element,
	Severity,
	StrideCategory,
	Threat,
	ThreatModel,
	TrustBoundary,
} from "@/types/threat-model";

/** Severity sort order (critical first). */
const SEVERITY_ORDER: Record<Severity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4,
};

/** Badge colors per severity. */
const SEVERITY_COLORS: Record<Severity, { bg: string; text: string }> = {
	critical: { bg: "#dc2626", text: "#fff" },
	high: { bg: "#ea580c", text: "#fff" },
	medium: { bg: "#d97706", text: "#fff" },
	low: { bg: "#2563eb", text: "#fff" },
	info: { bg: "#6b7280", text: "#fff" },
};

/** STRIDE category colors. */
const STRIDE_COLORS: Record<StrideCategory, string> = {
	Spoofing: "#7c3aed",
	Tampering: "#dc2626",
	Repudiation: "#d97706",
	"Information Disclosure": "#2563eb",
	"Denial of Service": "#ea580c",
	"Elevation of Privilege": "#059669",
};

/** Mitigation status labels. */
const MITIGATION_LABELS: Record<string, string> = {
	not_started: "Not Started",
	in_progress: "In Progress",
	mitigated: "Mitigated",
	accepted: "Accepted",
	transferred: "Transferred",
};

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Count threats by severity. */
function severityCounts(threats: Threat[]): Record<Severity, number> {
	const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
	for (const t of threats) {
		const sev = t.severity.toLowerCase() as Severity;
		if (sev in counts) counts[sev]++;
	}
	return counts;
}

/** Count threats by STRIDE category. */
function strideCounts(threats: Threat[]): Partial<Record<StrideCategory, number>> {
	const counts: Partial<Record<StrideCategory, number>> = {};
	for (const t of threats) {
		counts[t.category] = (counts[t.category] ?? 0) + 1;
	}
	return counts;
}

/** Get bounding box of all positioned entities for diagram scaling. */
function getDiagramBounds(model: ThreatModel): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
} {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const el of model.elements) {
		if (!el.position) continue;
		minX = Math.min(minX, el.position.x);
		minY = Math.min(minY, el.position.y);
		maxX = Math.max(maxX, el.position.x + 160);
		maxY = Math.max(maxY, el.position.y + 60);
	}
	for (const b of model.trust_boundaries) {
		if (!b.position) continue;
		const w = b.size?.width ?? 400;
		const h = b.size?.height ?? 300;
		minX = Math.min(minX, b.position.x);
		minY = Math.min(minY, b.position.y);
		maxX = Math.max(maxX, b.position.x + w);
		maxY = Math.max(maxY, b.position.y + h);
	}

	if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
	return { minX: minX - 40, minY: minY - 40, maxX: maxX + 40, maxY: maxY + 40 };
}

/** Render the diagram section as positioned HTML + SVG arrows. */
function renderDiagram(model: ThreatModel): string {
	const bounds = getDiagramBounds(model);
	const width = bounds.maxX - bounds.minX;
	const height = bounds.maxY - bounds.minY;
	const ox = bounds.minX;
	const oy = bounds.minY;

	const elementMap = new Map(model.elements.map((e) => [e.id, e]));

	// Render trust boundaries
	let boundariesHtml = "";
	for (const b of model.trust_boundaries) {
		if (!b.position) continue;
		const w = b.size?.width ?? 400;
		const h = b.size?.height ?? 300;
		boundariesHtml += `<div class="dg-boundary" style="left:${b.position.x - ox}px;top:${b.position.y - oy}px;width:${w}px;height:${h}px;">
			<span class="dg-boundary-label">${escapeHtml(b.name)}</span>
		</div>\n`;
	}

	// Render elements
	let elementsHtml = "";
	for (const el of model.elements) {
		if (!el.position) continue;
		const typeLabel =
			el.type === "external_entity"
				? "External Entity"
				: el.type === "data_store"
					? "Data Store"
					: "Process";
		const shapeClass = `dg-el-${el.type.replace(/_/g, "-")}`;
		elementsHtml += `<div class="dg-element ${shapeClass}" style="left:${el.position.x - ox}px;top:${el.position.y - oy}px;">
			<div class="dg-el-name">${escapeHtml(el.name)}</div>
			<div class="dg-el-type">${escapeHtml(typeLabel)}</div>
		</div>\n`;
	}

	// Render data flow arrows as SVG
	let flowsSvg = "";
	for (const flow of model.data_flows) {
		const src = elementMap.get(flow.from);
		const tgt = elementMap.get(flow.to);
		if (!src?.position || !tgt?.position) continue;

		const x1 = src.position.x - ox + 80;
		const y1 = src.position.y - oy + 30;
		const x2 = tgt.position.x - ox + 80;
		const y2 = tgt.position.y - oy + 30;

		const label = flow.flow_number != null ? `${flow.flow_number}. ${flow.name}` : flow.name;
		const mx = (x1 + x2) / 2;
		const my = (y1 + y2) / 2;

		flowsSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dg-flow-line" marker-end="url(#arrowhead)"/>
		<text x="${mx}" y="${my - 6}" class="dg-flow-label">${escapeHtml(label || flow.protocol)}</text>\n`;
	}

	return `<div class="diagram-container" style="width:${width}px;height:${height}px;">
		${boundariesHtml}
		${elementsHtml}
		<svg class="dg-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
			<defs>
				<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
					<polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/>
				</marker>
			</defs>
			${flowsSvg}
		</svg>
	</div>`;
}

/** Render the threat table. */
function renderThreatTable(threats: Threat[], model: ThreatModel): string {
	if (threats.length === 0) return "<p>No threats identified.</p>";

	const sorted = [...threats].sort(
		(a, b) =>
			SEVERITY_ORDER[a.severity.toLowerCase() as Severity] -
			SEVERITY_ORDER[b.severity.toLowerCase() as Severity],
	);

	const elementMap = new Map(model.elements.map((e) => [e.id, e]));
	const flowMap = new Map(model.data_flows.map((f) => [f.id, f]));

	let rows = "";
	for (const t of sorted) {
		const sev = t.severity.toLowerCase() as Severity;
		const colors = SEVERITY_COLORS[sev];
		const catColor = STRIDE_COLORS[t.category] ?? "#6b7280";
		const targetEl = t.element ? elementMap.get(t.element) : undefined;
		const targetFlow = t.flow ? flowMap.get(t.flow) : undefined;
		const target = targetEl?.name ?? targetFlow?.name ?? "";
		const mitStatus = t.mitigation
			? (MITIGATION_LABELS[t.mitigation.status] ?? t.mitigation.status)
			: "None";

		rows += `<tr>
			<td>${escapeHtml(t.id)}</td>
			<td>${escapeHtml(t.title)}</td>
			<td><span class="badge" style="background:${catColor}">${escapeHtml(t.category)}</span></td>
			<td><span class="badge" style="background:${colors.bg};color:${colors.text}">${escapeHtml(t.severity)}</span></td>
			<td>${escapeHtml(target)}</td>
			<td>${escapeHtml(mitStatus)}</td>
		</tr>\n`;
	}

	return `<table>
		<thead><tr>
			<th>ID</th><th>Title</th><th>Category</th><th>Severity</th><th>Target</th><th>Mitigation</th>
		</tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

/** Render element inventory table. */
function renderElementTable(elements: Element[]): string {
	if (elements.length === 0) return "<p>No elements defined.</p>";

	let rows = "";
	for (const el of elements) {
		const typeLabel =
			el.type === "external_entity"
				? "External Entity"
				: el.type === "data_store"
					? "Data Store"
					: "Process";
		rows += `<tr>
			<td>${escapeHtml(el.id)}</td>
			<td>${escapeHtml(el.name)}</td>
			<td>${escapeHtml(typeLabel)}</td>
			<td>${escapeHtml(el.trust_zone || "—")}</td>
			<td>${escapeHtml(el.technologies?.join(", ") || "—")}</td>
			<td>${escapeHtml(el.description || "—")}</td>
		</tr>\n`;
	}

	return `<table>
		<thead><tr>
			<th>ID</th><th>Name</th><th>Type</th><th>Trust Zone</th><th>Technologies</th><th>Description</th>
		</tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

/** Render data flow inventory table. */
function renderFlowTable(flows: DataFlow[], elements: Element[]): string {
	if (flows.length === 0) return "<p>No data flows defined.</p>";

	const elementMap = new Map(elements.map((e) => [e.id, e]));
	let rows = "";
	for (const f of flows) {
		const fromName = elementMap.get(f.from)?.name ?? f.from;
		const toName = elementMap.get(f.to)?.name ?? f.to;
		const num = f.flow_number != null ? `#${f.flow_number}` : "—";
		rows += `<tr>
			<td>${num}</td>
			<td>${escapeHtml(f.name || "—")}</td>
			<td>${escapeHtml(fromName)}</td>
			<td>${escapeHtml(toName)}</td>
			<td>${escapeHtml(f.protocol || "—")}</td>
			<td>${escapeHtml(f.data?.join(", ") || "—")}</td>
			<td>${f.authenticated ? "Yes" : "No"}</td>
		</tr>\n`;
	}

	return `<table>
		<thead><tr>
			<th>#</th><th>Name</th><th>From</th><th>To</th><th>Protocol</th><th>Data</th><th>Auth</th>
		</tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

/** Render trust boundary inventory. */
function renderBoundaryTable(boundaries: TrustBoundary[], elements: Element[]): string {
	if (boundaries.length === 0) return "<p>No trust boundaries defined.</p>";

	const elementMap = new Map(elements.map((e) => [e.id, e]));
	let rows = "";
	for (const b of boundaries) {
		const containsNames = b.contains.map((id) => elementMap.get(id)?.name ?? id).join(", ");
		rows += `<tr>
			<td>${escapeHtml(b.id)}</td>
			<td>${escapeHtml(b.name)}</td>
			<td>${escapeHtml(containsNames || "—")}</td>
		</tr>\n`;
	}

	return `<table>
		<thead><tr>
			<th>ID</th><th>Name</th><th>Contains</th>
		</tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

/** Generate a self-contained HTML report from a threat model. */
export function generateHtmlReport(model: ThreatModel): string {
	const meta = model.metadata;
	const sevCounts = severityCounts(model.threats);
	const catCounts = strideCounts(model.threats);
	const mitigatedCount = model.threats.filter((t) => t.mitigation?.status === "mitigated").length;

	const totalThreats = model.threats.length;
	const title = escapeHtml(meta.title);
	const description = meta.description ? escapeHtml(meta.description) : "";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Threat Model Report</title>
<style>
:root {
	--bg: #0f172a;
	--surface: #1e293b;
	--surface-2: #334155;
	--text: #e2e8f0;
	--text-muted: #94a3b8;
	--border: #334155;
	--accent: #38bdf8;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	background: var(--bg);
	color: var(--text);
	line-height: 1.6;
	padding: 0;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Navigation */
nav {
	position: sticky; top: 0; z-index: 100;
	background: var(--surface);
	border-bottom: 1px solid var(--border);
	padding: 0.5rem 2rem;
	display: flex; gap: 1.5rem; align-items: center;
	font-size: 0.875rem;
}
nav .nav-title { font-weight: 600; color: var(--accent); margin-right: 1rem; }

/* Main content */
.container { max-width: 1200px; margin: 0 auto; padding: 2rem; }

/* Cover section */
.cover {
	text-align: center;
	padding: 3rem 2rem;
	border-bottom: 1px solid var(--border);
	margin-bottom: 2rem;
}
.cover h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }
.cover .meta { color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem; }
.cover .description {
	max-width: 700px; margin: 1rem auto 0;
	color: var(--text-muted);
	white-space: pre-wrap;
}

/* Section */
section { margin-bottom: 2.5rem; }
h2 {
	font-size: 1.25rem; font-weight: 600;
	margin-bottom: 1rem; padding-bottom: 0.5rem;
	border-bottom: 1px solid var(--border);
}

/* Summary stats */
.stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 0.75rem;
	margin-bottom: 1.5rem;
}
.stat-card {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 1rem;
	text-align: center;
}
.stat-card .stat-value { font-size: 1.75rem; font-weight: 700; }
.stat-card .stat-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

/* STRIDE breakdown */
.stride-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
	gap: 0.5rem;
	margin-bottom: 1.5rem;
}
.stride-card {
	display: flex; align-items: center; gap: 0.5rem;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 6px;
	padding: 0.5rem 0.75rem;
	font-size: 0.875rem;
}
.stride-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

/* Tables */
table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.8125rem;
	background: var(--surface);
	border-radius: 8px;
	overflow: hidden;
}
th, td {
	text-align: left;
	padding: 0.5rem 0.75rem;
	border-bottom: 1px solid var(--border);
}
th { background: var(--surface-2); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(56, 189, 248, 0.05); }

/* Badges */
.badge {
	display: inline-block;
	padding: 0.125rem 0.5rem;
	border-radius: 9999px;
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: capitalize;
	white-space: nowrap;
}

/* Diagram */
.diagram-wrapper {
	overflow: auto;
	border: 1px solid var(--border);
	border-radius: 8px;
	background: var(--surface);
	padding: 1rem;
}
.diagram-container {
	position: relative;
	margin: 0 auto;
}
.dg-boundary {
	position: absolute;
	border: 2px dashed var(--border);
	border-radius: 8px;
	background: rgba(56, 189, 248, 0.04);
}
.dg-boundary-label {
	position: absolute; top: 4px; left: 8px;
	font-size: 0.6875rem; font-weight: 600;
	color: var(--text-muted);
	text-transform: uppercase;
	letter-spacing: 0.05em;
}
.dg-element {
	position: absolute;
	width: 160px;
	background: var(--surface-2);
	border: 1.5px solid var(--text-muted);
	border-radius: 6px;
	padding: 0.5rem 0.625rem;
	font-size: 0.75rem;
	text-align: center;
}
.dg-el-process { border-radius: 6px; }
.dg-el-external-entity { border-radius: 6px; border-style: dashed; }
.dg-el-data-store { border-radius: 0; border-left: 3px solid var(--accent); border-right: 3px solid var(--accent); border-top: none; border-bottom: none; }
.dg-el-name { font-weight: 600; margin-bottom: 2px; }
.dg-el-type { color: var(--text-muted); font-size: 0.625rem; text-transform: uppercase; }
.dg-svg { position: absolute; top: 0; left: 0; pointer-events: none; }
.dg-flow-line { stroke: #64748b; stroke-width: 1.5; }
.dg-flow-label { fill: var(--text-muted); font-size: 10px; text-anchor: middle; }

/* Print styles */
@media print {
	body { background: #fff; color: #1e293b; }
	nav { position: static; background: #fff; border-bottom: 2px solid #1e293b; }
	.stat-card, .stride-card, table, .diagram-wrapper { background: #fff; }
	th { background: #f1f5f9; color: #1e293b; }
	.dg-element { background: #f8fafc; }
	.dg-boundary { background: rgba(0,0,0,0.02); }
	:root {
		--bg: #fff; --surface: #fff; --surface-2: #f1f5f9;
		--text: #1e293b; --text-muted: #64748b; --border: #e2e8f0;
	}
	@page { margin: 1cm; }
}

/* Footer */
.footer {
	text-align: center;
	padding: 1.5rem;
	color: var(--text-muted);
	font-size: 0.75rem;
	border-top: 1px solid var(--border);
	margin-top: 2rem;
}
</style>
</head>
<body>

<nav>
	<span class="nav-title">ThreatForge</span>
	<a href="#diagram">Diagram</a>
	<a href="#summary">Summary</a>
	<a href="#threats">Threats</a>
	<a href="#elements">Elements</a>
	<a href="#flows">Data Flows</a>
	<a href="#boundaries">Boundaries</a>
</nav>

<div class="container">

<!-- Cover -->
<div class="cover">
	<h1>${title}</h1>
	<div class="meta">
		Author: ${escapeHtml(meta.author || "—")} &nbsp;|&nbsp;
		Created: ${escapeHtml(meta.created)} &nbsp;|&nbsp;
		Modified: ${escapeHtml(meta.modified)}
	</div>
	${description ? `<div class="description">${description}</div>` : ""}
</div>

<!-- Diagram -->
<section id="diagram">
	<h2>Data Flow Diagram</h2>
	<div class="diagram-wrapper">
		${renderDiagram(model)}
	</div>
</section>

<!-- Summary -->
<section id="summary">
	<h2>Summary</h2>
	<div class="stats">
		<div class="stat-card">
			<div class="stat-value">${model.elements.length}</div>
			<div class="stat-label">Elements</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">${model.data_flows.length}</div>
			<div class="stat-label">Data Flows</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">${model.trust_boundaries.length}</div>
			<div class="stat-label">Boundaries</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">${totalThreats}</div>
			<div class="stat-label">Threats</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">${mitigatedCount}</div>
			<div class="stat-label">Mitigated</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">${totalThreats > 0 ? Math.round((mitigatedCount / totalThreats) * 100) : 0}%</div>
			<div class="stat-label">Coverage</div>
		</div>
	</div>

	<h3 style="font-size:0.875rem;margin-bottom:0.5rem;">Severity Breakdown</h3>
	<div class="stats" style="margin-bottom:1rem;">
		${(["critical", "high", "medium", "low", "info"] as const)
			.map(
				(s) => `<div class="stat-card">
			<div class="stat-value" style="color:${SEVERITY_COLORS[s].bg}">${sevCounts[s]}</div>
			<div class="stat-label">${s}</div>
		</div>`,
			)
			.join("\n")}
	</div>

	<h3 style="font-size:0.875rem;margin-bottom:0.5rem;">STRIDE Categories</h3>
	<div class="stride-grid">
		${(Object.keys(STRIDE_COLORS) as StrideCategory[])
			.map(
				(cat) =>
					`<div class="stride-card"><span class="stride-dot" style="background:${STRIDE_COLORS[cat]}"></span>${escapeHtml(cat)}: <strong>${catCounts[cat] ?? 0}</strong></div>`,
			)
			.join("\n")}
	</div>
</section>

<!-- Threats -->
<section id="threats">
	<h2>Threat Analysis (${totalThreats})</h2>
	${renderThreatTable(model.threats, model)}
</section>

<!-- Elements -->
<section id="elements">
	<h2>Element Inventory (${model.elements.length})</h2>
	${renderElementTable(model.elements)}
</section>

<!-- Data Flows -->
<section id="flows">
	<h2>Data Flow Inventory (${model.data_flows.length})</h2>
	${renderFlowTable(model.data_flows, model.elements)}
</section>

<!-- Boundaries -->
<section id="boundaries">
	<h2>Trust Boundaries (${model.trust_boundaries.length})</h2>
	${renderBoundaryTable(model.trust_boundaries, model.elements)}
</section>

</div>

<div class="footer">
	Generated by <strong>ThreatForge</strong> on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
</div>

</body>
</html>`;
}

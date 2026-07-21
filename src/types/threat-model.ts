/**
 * TypeScript types mirroring the Rust YAML schema.
 * These types are used for Tauri IPC communication and Zustand state.
 */

/** Component type — a string identifying the component kind (e.g. "api_gateway", "sql_database"). */
export type ElementType = string;

export type StrideCategory =
	| "Spoofing"
	| "Tampering"
	| "Repudiation"
	| "Information Disclosure"
	| "Denial of Service"
	| "Elevation of Privilege";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type MitigationStatus =
	| "not_started"
	| "in_progress"
	| "mitigated"
	| "accepted"
	| "transferred";

export interface FileSettings {
	grid_size?: number;
	default_element_fill?: string;
	default_element_stroke?: string;
	default_boundary_fill?: string;
	default_boundary_stroke?: string;
}

export interface Metadata {
	title: string;
	author: string;
	created: string; // ISO date string (YYYY-MM-DD)
	modified: string;
	description: string;
	created_by?: string;
	modified_by?: string;
	last_edit_timestamp?: number;
	/**
	 * Tri-state threat-analysis flag. `undefined` is not "disabled": an existing file carries no
	 * flag and its state is inferred from whether it has threats. Mirrors Rust `Option<bool>`.
	 */
	threat_analysis_enabled?: boolean;
	settings?: FileSettings;
}

export interface Position {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Viewport {
	x: number;
	y: number;
	zoom: number;
}

export interface Element {
	id: string;
	type: ElementType;
	name: string;
	trust_zone: string;
	/** Optional architecture layer this element belongs to (references `Layer.id`). */
	layer?: string;
	/** Optional non-security group this element belongs to (references `Group.id`). */
	group?: string;
	subtype?: string;
	icon?: string;
	description: string;
	technologies: string[];
	/** Free-form classification labels. */
	tags?: string[];
	stores?: string[];
	encryption?: string;
	position?: Position;
	fill_color?: string;
	stroke_color?: string;
	fill_opacity?: number;
	stroke_opacity?: number;
	font_size?: number;
	font_weight?: string;
}

export interface DataFlow {
	id: string;
	flow_number?: number;
	name: string;
	from: string;
	to: string;
	protocol: string;
	data: string[];
	authenticated: boolean;
	label_offset?: Position;
	source_handle?: string;
	target_handle?: string;
	stroke_color?: string;
	stroke_opacity?: number;
}

export interface TrustBoundary {
	id: string;
	name: string;
	contains: string[];
	position?: Position;
	size?: Size;
	fill_color?: string;
	stroke_color?: string;
	fill_opacity?: number;
	stroke_opacity?: number;
}

/**
 * A horizontal architecture layer. Array order is display order (mirrors Rust `Layer`).
 * Member order must match the Rust struct — the browser writer emits keys in this order.
 */
export interface Layer {
	id: string;
	name: string;
	description?: string;
}

/**
 * A non-security grouping of components. Mirrors Rust `Group`; membership is element-side
 * (`Element.group`), not a `contains` list, and groups may nest via `parent`.
 */
export interface Group {
	id: string;
	name: string;
	type?: string;
	parent?: string;
	description?: string;
	position?: Position;
	size?: Size;
	fill_color?: string;
	stroke_color?: string;
	fill_opacity?: number;
	stroke_opacity?: number;
}

/**
 * A non-data-flow relationship between two elements (e.g. `deploys_to`, `depends_on`). Mirrors
 * Rust `Relationship`. Deliberately separate from `DataFlow`: relationships are never analyzed by
 * STRIDE, so they cannot manufacture false-positive threats. `type` is required.
 */
export interface Relationship {
	id: string;
	type: string;
	from: string;
	to: string;
	name?: string;
	description?: string;
	source_handle?: string;
	target_handle?: string;
	label_offset?: Position;
	stroke_color?: string;
	stroke_opacity?: number;
}

export interface Mitigation {
	status: MitigationStatus;
	description: string;
}

export interface Threat {
	id: string;
	title: string;
	category: StrideCategory;
	element?: string;
	flow?: string;
	severity: Severity;
	description: string;
	mitigation?: Mitigation;
}

export interface Diagram {
	id: string;
	name: string;
	/** Free-form view kind (e.g. "architecture", "dfd", "deployment"). */
	kind?: string;
	description?: string;
	layout_file?: string;
	viewport?: Viewport;
}

export interface ThreatModel {
	version: string;
	metadata: Metadata;
	layers?: Layer[];
	groups?: Group[];
	elements: Element[];
	data_flows: DataFlow[];
	relationships?: Relationship[];
	trust_boundaries: TrustBoundary[];
	threats: Threat[];
	diagrams: Diagram[];
}

// Layout types (used by legacy sidecar JSON migration)

export interface NodePosition {
	id: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
}

export interface DiagramLayout {
	diagram_id: string;
	viewport: Viewport;
	nodes: NodePosition[];
}

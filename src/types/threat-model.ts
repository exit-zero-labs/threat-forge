/**
 * TypeScript types mirroring the Rust YAML schema.
 * These types are used for Tauri IPC communication and Zustand state.
 */

export type ElementType = "process" | "data_store" | "external_entity";

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

export interface Metadata {
	title: string;
	author: string;
	created: string; // ISO date string (YYYY-MM-DD)
	modified: string;
	description: string;
}

export interface Element {
	id: string;
	type: ElementType;
	name: string;
	trust_zone: string;
	icon?: string;
	description: string;
	technologies: string[];
	stores?: string[];
	encryption?: string;
}

export interface DataFlow {
	id: string;
	name: string;
	from: string;
	to: string;
	protocol: string;
	data: string[];
	authenticated: boolean;
}

export interface TrustBoundary {
	id: string;
	name: string;
	contains: string[];
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
	layout_file: string;
}

export interface ThreatModel {
	version: string;
	metadata: Metadata;
	elements: Element[];
	data_flows: DataFlow[];
	trust_boundaries: TrustBoundary[];
	threats: Threat[];
	diagrams: Diagram[];
}

// Layout types (stored in separate JSON files)

export interface Viewport {
	x: number;
	y: number;
	zoom: number;
}

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

/**
 * The one production factory that builds a turn's tool set.
 *
 * A turn is offered exactly two capabilities: the read tools that query the
 * current document and the typed component catalog, and the twelve graph action
 * tools that mutate the document. Read tools lead the advertised list so the
 * non-mutating capability comes first and the order stays deterministic. Issues
 * `#204` and `#205` extend {@link READ_TOOLS} and `GRAPH_ACTION_TOOLS` rather than
 * rewiring the loop.
 */

import {
	createToolRegistry,
	type RegisteredTool,
	type ToolRegistry,
} from "@/lib/ai/loop/tool-runtime";
import { CATALOG_READ_TOOL } from "@/lib/ai/tools/catalog-read-tool";
import { DOCUMENT_READ_TOOLS } from "@/lib/ai/tools/document-read-tools";
import { GRAPH_ACTION_TOOLS } from "@/lib/ai/tools/graph-action-tools";

/** Every `effect: "read"` tool offered to a tool-capable model, in advertised order. */
export const READ_TOOLS: readonly RegisteredTool[] = [...DOCUMENT_READ_TOOLS, CATALOG_READ_TOOL];

/** The production tool set: read tools first, then the twelve graph mutation tools. */
export function createAiToolRegistry(): ToolRegistry {
	return createToolRegistry([...READ_TOOLS, ...GRAPH_ACTION_TOOLS]);
}

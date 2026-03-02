//! ThreatForge MCP Server — exposes threat model data and mutation tools
//! to external AI assistants (Claude Code, VS Code Copilot, Cursor, etc.)
//! via the Model Context Protocol over stdio.

use std::borrow::Cow;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rmcp::handler::server::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::*;
use rmcp::{tool, tool_handler, tool_router, ServerHandler};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::models::{
    DataFlow, Element, Severity, StrideCategory, Threat, ThreatModel, TrustBoundary,
};

fn mcp_err(msg: impl Into<String>) -> ErrorData {
    ErrorData {
        code: ErrorCode(-32603),
        message: Cow::from(msg.into()),
        data: None,
    }
}

fn text_result(s: impl Into<String>) -> CallToolResult {
    CallToolResult::success(vec![Content::text(s.into())])
}

/// Shared, file-backed threat model state.
#[derive(Clone)]
pub struct ThreatForgeServer {
    file_path: PathBuf,
    model: Arc<Mutex<ThreatModel>>,
    tool_router: ToolRouter<Self>,
}

impl ThreatForgeServer {
    /// Create a new server instance for the given `.thf` file.
    pub fn new(file_path: PathBuf) -> Result<Self, String> {
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read {}: {e}", file_path.display()))?;
        let model: ThreatModel = serde_yaml::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {e}", file_path.display()))?;
        Ok(Self {
            file_path,
            model: Arc::new(Mutex::new(model)),
            tool_router: Self::tool_router(),
        })
    }

    /// Persist the current model state to disk.
    fn save(&self) -> Result<(), ErrorData> {
        let model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
        let yaml =
            serde_yaml::to_string(&*model).map_err(|e| mcp_err(format!("Serialize: {e}")))?;
        std::fs::write(&self.file_path, yaml)
            .map_err(|e| mcp_err(format!("Write file: {e}")))?;
        Ok(())
    }

    /// Reload the model from disk (picks up external changes).
    fn reload(&self) -> Result<(), ErrorData> {
        let content = std::fs::read_to_string(&self.file_path)
            .map_err(|e| mcp_err(format!("Read file: {e}")))?;
        let fresh: ThreatModel =
            serde_yaml::from_str(&content).map_err(|e| mcp_err(format!("Parse: {e}")))?;
        let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
        *model = fresh;
        Ok(())
    }

    fn next_flow_number(model: &ThreatModel) -> u32 {
        model
            .data_flows
            .iter()
            .filter_map(|f| f.flow_number)
            .max()
            .unwrap_or(0)
            + 1
    }
}

// ───── Tool input schemas ─────

#[derive(Debug, Deserialize, JsonSchema)]
struct GetModelRequest {}

#[derive(Debug, Deserialize, JsonSchema)]
struct AddElementRequest {
    #[schemars(description = "Element type: process, data_store, or external_entity")]
    element_type: String,
    #[schemars(description = "Human-readable element name")]
    name: String,
    #[schemars(description = "Trust zone (e.g. internal, dmz, external)")]
    trust_zone: Option<String>,
    #[schemars(description = "Description of the element")]
    description: Option<String>,
    #[schemars(description = "Technologies used (e.g. [\"nginx\", \"TLS\"])")]
    technologies: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateElementRequest {
    #[schemars(description = "ID of the element to update")]
    id: String,
    #[schemars(description = "New name")]
    name: Option<String>,
    #[schemars(description = "New type")]
    element_type: Option<String>,
    #[schemars(description = "New trust zone")]
    trust_zone: Option<String>,
    #[schemars(description = "New description")]
    description: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct DeleteByIdRequest {
    #[schemars(description = "ID of the item to delete")]
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct AddDataFlowRequest {
    #[schemars(description = "Source element ID")]
    from: String,
    #[schemars(description = "Target element ID")]
    to: String,
    #[schemars(description = "Flow name")]
    name: Option<String>,
    #[schemars(description = "Protocol (e.g. HTTPS/TLS-1.3)")]
    protocol: Option<String>,
    #[schemars(description = "Data items carried")]
    data: Option<Vec<String>>,
    #[schemars(description = "Whether the flow is authenticated")]
    authenticated: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct AddTrustBoundaryRequest {
    #[schemars(description = "Boundary name")]
    name: String,
    #[schemars(description = "Element IDs contained in this boundary")]
    contains: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct AddThreatRequest {
    #[schemars(description = "Threat title")]
    title: String,
    #[schemars(
        description = "STRIDE category: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege"
    )]
    category: String,
    #[schemars(description = "Severity: critical, high, medium, low, info")]
    severity: String,
    #[schemars(description = "Detailed threat description")]
    description: String,
    #[schemars(description = "Target element ID")]
    element: Option<String>,
    #[schemars(description = "Target data flow ID")]
    flow: Option<String>,
}

// ───── Tool implementations ─────

#[tool_router]
impl ThreatForgeServer {
    #[tool(description = "Get the full threat model as JSON. Returns metadata, elements, data flows, trust boundaries, and threats.")]
    async fn get_model(
        &self,
        Parameters(_req): Parameters<GetModelRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        let model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
        let json =
            serde_json::to_string_pretty(&*model).map_err(|e| mcp_err(format!("JSON: {e}")))?;
        Ok(text_result(json))
    }

    #[tool(description = "List all elements in the threat model with their IDs, types, and names.")]
    async fn list_elements(
        &self,
        Parameters(_req): Parameters<GetModelRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        let model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
        let summary: Vec<serde_json::Value> = model
            .elements
            .iter()
            .map(|e| {
                serde_json::json!({
                    "id": e.id,
                    "type": e.element_type,
                    "name": e.name,
                    "trust_zone": e.trust_zone,
                })
            })
            .collect();
        let json = serde_json::to_string_pretty(&summary)
            .map_err(|e| mcp_err(format!("JSON: {e}")))?;
        Ok(text_result(json))
    }

    #[tool(description = "List all threats with their IDs, titles, categories, and severities.")]
    async fn list_threats(
        &self,
        Parameters(_req): Parameters<GetModelRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        let model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
        let summary: Vec<serde_json::Value> = model
            .threats
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "title": t.title,
                    "category": t.category,
                    "severity": t.severity,
                    "element": t.element,
                    "flow": t.flow,
                })
            })
            .collect();
        let json = serde_json::to_string_pretty(&summary)
            .map_err(|e| mcp_err(format!("JSON: {e}")))?;
        Ok(text_result(json))
    }

    #[tool(description = "Add a new DFD element (process, data_store, or external_entity) to the threat model.")]
    async fn add_element(
        &self,
        Parameters(req): Parameters<AddElementRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        let id = crate::models::generate_element_id(&req.name);
        let element = Element {
            id: id.clone(),
            element_type: req.element_type,
            name: req.name,
            trust_zone: req.trust_zone.unwrap_or_default(),
            subtype: None,
            icon: None,
            description: req.description.unwrap_or_default(),
            technologies: req.technologies.unwrap_or_default(),
            stores: None,
            encryption: None,
            position: None,
            fill_color: None,
            stroke_color: None,
            fill_opacity: None,
            stroke_opacity: None,
        };
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            model.elements.push(element);
        }
        self.save()?;
        Ok(text_result(format!("Added element: {id}")))
    }

    #[tool(description = "Update an existing element's name, type, trust zone, or description.")]
    async fn update_element(
        &self,
        Parameters(req): Parameters<UpdateElementRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            let el = model
                .elements
                .iter_mut()
                .find(|e| e.id == req.id)
                .ok_or_else(|| mcp_err(format!("Element not found: {}", req.id)))?;
            if let Some(name) = req.name {
                el.name = name;
            }
            if let Some(t) = req.element_type {
                el.element_type = t;
            }
            if let Some(tz) = req.trust_zone {
                el.trust_zone = tz;
            }
            if let Some(desc) = req.description {
                el.description = desc;
            }
        }
        self.save()?;
        Ok(text_result(format!("Updated element: {}", req.id)))
    }

    #[tool(description = "Delete an element and its connected data flows.")]
    async fn delete_element(
        &self,
        Parameters(req): Parameters<DeleteByIdRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            let existed = model.elements.iter().any(|e| e.id == req.id);
            if !existed {
                return Err(mcp_err(format!("Element not found: {}", req.id)));
            }
            model.elements.retain(|e| e.id != req.id);
            // Cascade: remove connected flows
            model
                .data_flows
                .retain(|f| f.from != req.id && f.to != req.id);
            // Cascade: remove from trust boundary contains lists
            for b in &mut model.trust_boundaries {
                b.contains.retain(|c| c != &req.id);
            }
        }
        self.save()?;
        Ok(text_result(format!("Deleted element: {}", req.id)))
    }

    #[tool(description = "Add a data flow between two elements.")]
    async fn add_data_flow(
        &self,
        Parameters(req): Parameters<AddDataFlowRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        let id;
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            let flow_number = Self::next_flow_number(&model);
            id = format!("flow-{flow_number}");
            let flow = DataFlow {
                id: id.clone(),
                flow_number: Some(flow_number),
                name: req.name.unwrap_or_default(),
                from: req.from,
                to: req.to,
                protocol: req.protocol.unwrap_or_default(),
                data: req.data.unwrap_or_default(),
                authenticated: req.authenticated.unwrap_or(false),
                label_offset: None,
                source_handle: None,
                target_handle: None,
                stroke_color: None,
                stroke_opacity: None,
            };
            model.data_flows.push(flow);
        }
        self.save()?;
        Ok(text_result(format!("Added data flow: {id}")))
    }

    #[tool(description = "Delete a data flow by ID.")]
    async fn delete_data_flow(
        &self,
        Parameters(req): Parameters<DeleteByIdRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            let existed = model.data_flows.iter().any(|f| f.id == req.id);
            if !existed {
                return Err(mcp_err(format!("Data flow not found: {}", req.id)));
            }
            model.data_flows.retain(|f| f.id != req.id);
        }
        self.save()?;
        Ok(text_result(format!("Deleted data flow: {}", req.id)))
    }

    #[tool(description = "Add a trust boundary grouping elements.")]
    async fn add_trust_boundary(
        &self,
        Parameters(req): Parameters<AddTrustBoundaryRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        let id = crate::models::generate_element_id(&req.name);
        let boundary = TrustBoundary {
            id: id.clone(),
            name: req.name,
            contains: req.contains.unwrap_or_default(),
            position: None,
            size: None,
            fill_color: None,
            stroke_color: None,
            fill_opacity: None,
            stroke_opacity: None,
        };
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            model.trust_boundaries.push(boundary);
        }
        self.save()?;
        Ok(text_result(format!("Added trust boundary: {id}")))
    }

    #[tool(description = "Delete a trust boundary by ID.")]
    async fn delete_trust_boundary(
        &self,
        Parameters(req): Parameters<DeleteByIdRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            let existed = model.trust_boundaries.iter().any(|b| b.id == req.id);
            if !existed {
                return Err(mcp_err(format!("Trust boundary not found: {}", req.id)));
            }
            model.trust_boundaries.retain(|b| b.id != req.id);
        }
        self.save()?;
        Ok(text_result(format!("Deleted trust boundary: {}", req.id)))
    }

    #[tool(description = "Add a STRIDE threat to the threat model.")]
    async fn add_threat(
        &self,
        Parameters(req): Parameters<AddThreatRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let category: StrideCategory = serde_json::from_value(serde_json::Value::String(
            req.category.clone(),
        ))
        .map_err(|_| {
            mcp_err(format!(
                "Invalid STRIDE category: {}. Use: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege",
                req.category
            ))
        })?;
        let severity: Severity =
            serde_json::from_value(serde_json::Value::String(req.severity.clone())).map_err(
                |_| {
                    mcp_err(format!(
                        "Invalid severity: {}. Use: critical, high, medium, low, info",
                        req.severity
                    ))
                },
            )?;
        self.reload()?;
        let id = crate::models::generate_threat_id();
        let threat = Threat {
            id: id.clone(),
            title: req.title,
            category,
            element: req.element,
            flow: req.flow,
            severity,
            description: req.description,
            mitigation: None,
        };
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            model.threats.push(threat);
        }
        self.save()?;
        Ok(text_result(format!("Added threat: {id}")))
    }

    #[tool(description = "Delete a threat by ID.")]
    async fn delete_threat(
        &self,
        Parameters(req): Parameters<DeleteByIdRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        self.reload()?;
        {
            let mut model = self.model.lock().map_err(|e| mcp_err(e.to_string()))?;
            let existed = model.threats.iter().any(|t| t.id == req.id);
            if !existed {
                return Err(mcp_err(format!("Threat not found: {}", req.id)));
            }
            model.threats.retain(|t| t.id != req.id);
        }
        self.save()?;
        Ok(text_result(format!("Deleted threat: {}", req.id)))
    }
}

#[tool_handler]
impl ServerHandler for ThreatForgeServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "threatforge-mcp".into(),
                version: env!("CARGO_PKG_VERSION").into(),
                title: None,
                description: Some("ThreatForge MCP Server for threat model manipulation".into()),
                icons: None,
                website_url: Some("https://github.com/exit-zero-labs/threat-forge".into()),
            },
            instructions: Some(
                "ThreatForge MCP Server — read and modify threat models (.thf files). \
                 Tools: get_model, list_elements, list_threats, add_element, update_element, \
                 delete_element, add_data_flow, delete_data_flow, add_trust_boundary, \
                 delete_trust_boundary, add_threat, delete_threat."
                    .to_string(),
            ),
        }
    }
}


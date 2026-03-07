//! Parser for Microsoft Threat Modeling Tool `.tm7` XML files.
//!
//! TM7 files use .NET DataContract XML serialization with multiple namespaces.
//! This parser uses `quick-xml` to walk the XML tree and extract elements,
//! data flows, trust boundaries, and threats, converting them to our
//! `ThreatModel` format.

use crate::models::{
    DataFlow, Diagram, Element, Metadata, Mitigation, MitigationStatus, Position, Severity, Size,
    StrideCategory, Threat, ThreatModel, TrustBoundary, Viewport,
};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use std::collections::HashMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Tm7Error {
    #[error("XML parsing error: {0}")]
    Xml(#[from] quick_xml::Error),
}

/// Intermediate representation of a TM7 stencil element.
#[derive(Debug, Default)]
struct Tm7Element {
    guid: String,
    generic_type_id: String,
    name: String,
    left: f64,
    top: f64,
    width: f64,
    height: f64,
    out_of_scope: bool,
    /// e.g. StencilRectangle, StencilEllipse, StencilParallelLines, BorderBoundary
    stencil_type: String,
}

/// Intermediate representation of a TM7 connector/line.
#[derive(Debug, Default)]
struct Tm7Line {
    guid: String,
    generic_type_id: String,
    name: String,
    source_guid: String,
    target_guid: String,
    source_x: f64,
    source_y: f64,
    target_x: f64,
    target_y: f64,
    /// e.g. Connector, LineBoundary
    line_type: String,
}

/// Intermediate representation of a TM7 threat instance.
#[derive(Debug, Default)]
struct Tm7Threat {
    id: String,
    flow_guid: String,
    source_guid: String,
    target_guid: String,
    priority: String,
    state: String,
    state_information: String,
    type_id: String,
    properties: HashMap<String, String>,
}

/// Intermediate TM7 metadata.
#[derive(Debug, Default)]
struct Tm7Meta {
    name: String,
    owner: String,
    description: String,
}

/// Parse a TM7 XML string into a `ThreatModel`.
pub fn parse_tm7(xml: &str) -> Result<ThreatModel, Tm7Error> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut meta = Tm7Meta::default();
    let mut border_elements: Vec<Tm7Element> = Vec::new();
    let mut lines: Vec<Tm7Line> = Vec::new();
    let mut threats: Vec<Tm7Threat> = Vec::new();
    let mut diagram_name = String::from("Level 0 DFD");

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let local = local_name(e);
                match local.as_str() {
                    "MetaInformation" => {
                        meta = parse_meta_information(&mut reader)?;
                    }
                    "DrawingSurfaceModel" => {
                        let (name, borders, surface_lines) = parse_drawing_surface(&mut reader)?;
                        if !name.is_empty() {
                            diagram_name = name;
                        }
                        border_elements.extend(borders);
                        lines.extend(surface_lines);
                    }
                    "ThreatInstances" => {
                        threats = parse_threat_instances(&mut reader)?;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }

    // Build GUID → kebab-id mapping for elements
    let mut guid_to_id: HashMap<String, String> = HashMap::new();
    let mut id_counter: HashMap<String, u32> = HashMap::new();

    let mut thf_elements: Vec<Element> = Vec::new();
    let mut thf_boundaries: Vec<TrustBoundary> = Vec::new();

    for elem in &border_elements {
        if elem.stencil_type == "BorderBoundary" {
            let id = make_unique_id(&elem.name, "boundary", &mut id_counter);
            guid_to_id.insert(elem.guid.clone(), id.clone());
            thf_boundaries.push(TrustBoundary {
                id,
                name: elem.name.clone(),
                contains: Vec::new(), // populated later by containment check
                position: Some(Position {
                    x: elem.left,
                    y: elem.top,
                }),
                size: Some(Size {
                    width: elem.width,
                    height: elem.height,
                }),
                fill_color: None,
                stroke_color: None,
                fill_opacity: None,
                stroke_opacity: None,
            });
        } else if !elem.out_of_scope {
            let element_type = match elem.generic_type_id.as_str() {
                "GE.P" => "process",
                "GE.DS" => "data_store",
                "GE.EI" => "external_entity",
                _ => "process",
            };
            let id = make_unique_id(&elem.name, element_type, &mut id_counter);
            guid_to_id.insert(elem.guid.clone(), id.clone());
            thf_elements.push(Element {
                id,
                element_type: element_type.to_string(),
                name: elem.name.clone(),
                trust_zone: String::new(),
                subtype: None,
                icon: None,
                description: String::new(),
                technologies: Vec::new(),
                stores: None,
                encryption: None,
                position: Some(Position {
                    x: elem.left,
                    y: elem.top,
                }),
                fill_color: None,
                stroke_color: None,
                fill_opacity: None,
                stroke_opacity: None,
                font_size: None,
                font_weight: None,
            });
        }
    }

    // Line boundaries → trust boundaries
    for line in &lines {
        if line.line_type == "LineBoundary" {
            let id = make_unique_id(&line.name, "boundary", &mut id_counter);
            guid_to_id.insert(line.guid.clone(), id.clone());
            // Convert line boundary to a rectangular boundary using endpoint coordinates
            let x = line.source_x.min(line.target_x);
            let y = line.source_y.min(line.target_y);
            let w = (line.target_x - line.source_x).abs().max(200.0);
            let h = (line.target_y - line.source_y).abs().max(100.0);
            thf_boundaries.push(TrustBoundary {
                id,
                name: line.name.clone(),
                contains: Vec::new(),
                position: Some(Position { x, y }),
                size: Some(Size {
                    width: w,
                    height: h,
                }),
                fill_color: None,
                stroke_color: None,
                fill_opacity: None,
                stroke_opacity: None,
            });
        }
    }

    // Build a lookup from element ID to its TM7 dimensions for accurate containment
    let elem_dimensions: HashMap<&str, (f64, f64)> = border_elements
        .iter()
        .filter(|e| e.stencil_type != "BorderBoundary")
        .filter_map(|e| {
            guid_to_id
                .get(&e.guid)
                .map(|id| (id.as_str(), (e.width, e.height)))
        })
        .collect();

    // Determine containment: which elements are inside which boundaries
    for boundary in &mut thf_boundaries {
        let (bx, by, bw, bh) = match (&boundary.position, &boundary.size) {
            (Some(p), Some(s)) => (p.x, p.y, s.width, s.height),
            _ => continue,
        };

        for elem in &thf_elements {
            if let Some(ref pos) = elem.position {
                // Use actual element dimensions from TM7, falling back to 100x100
                let (ew, eh) = elem_dimensions
                    .get(elem.id.as_str())
                    .copied()
                    .unwrap_or((100.0, 100.0));
                let cx = pos.x + ew / 2.0;
                let cy = pos.y + eh / 2.0;
                if cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh {
                    boundary.contains.push(elem.id.clone());
                }
            }
        }
    }

    // Data flows
    let mut thf_flows: Vec<DataFlow> = Vec::new();
    let mut flow_counter: u32 = 0;
    for line in &lines {
        if line.line_type == "Connector" {
            let from_id = guid_to_id.get(&line.source_guid).cloned();
            let to_id = guid_to_id.get(&line.target_guid).cloned();
            // Skip flows referencing out-of-scope or unknown elements
            if let (Some(from), Some(to)) = (from_id, to_id) {
                flow_counter += 1;
                let flow_id = format!("flow-{flow_counter}");
                guid_to_id.insert(line.guid.clone(), flow_id.clone());
                thf_flows.push(DataFlow {
                    id: flow_id,
                    flow_number: Some(flow_counter),
                    name: line.name.clone(),
                    from,
                    to,
                    protocol: String::new(),
                    data: Vec::new(),
                    authenticated: false,
                    label_offset: None,
                    source_handle: None,
                    target_handle: None,
                    stroke_color: None,
                    stroke_opacity: None,
                });
            }
        }
    }

    // Threats
    let mut thf_threats: Vec<Threat> = Vec::new();
    for tm7_threat in &threats {
        let title = tm7_threat
            .properties
            .get("Title")
            .cloned()
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }

        let category_str = tm7_threat
            .properties
            .get("UserThreatCategory")
            .cloned()
            .unwrap_or_default();
        let category = parse_stride_category(&category_str, &tm7_threat.type_id);

        let description = tm7_threat
            .properties
            .get("UserThreatDescription")
            .cloned()
            .unwrap_or_default();

        let severity = parse_severity(&tm7_threat.priority);
        let mitigation = parse_mitigation_status(&tm7_threat.state, &tm7_threat.state_information);

        // Resolve element references via GUID mapping
        let element = guid_to_id.get(&tm7_threat.source_guid).cloned();
        let flow = guid_to_id.get(&tm7_threat.flow_guid).cloned();

        let threat_id = format!("threat-{}", thf_threats.len() + 1);
        thf_threats.push(Threat {
            id: threat_id,
            title,
            category,
            element,
            flow,
            severity,
            description,
            mitigation: Some(mitigation),
        });
    }

    let today = chrono::Local::now().date_naive();
    let title = if meta.name.is_empty() {
        "Imported Threat Model".to_string()
    } else {
        meta.name
    };

    Ok(ThreatModel {
        version: "1.0".to_string(),
        metadata: Metadata {
            title,
            author: if meta.owner.is_empty() {
                String::new()
            } else {
                meta.owner
            },
            created: today,
            modified: today,
            description: meta.description,
            created_by: None,
            modified_by: None,
            last_edit_timestamp: None,
            settings: None,
        },
        elements: thf_elements,
        data_flows: thf_flows,
        trust_boundaries: thf_boundaries,
        threats: thf_threats,
        diagrams: vec![Diagram {
            id: "main-dfd".to_string(),
            name: diagram_name,
            layout_file: None,
            viewport: Some(Viewport {
                x: 0.0,
                y: 0.0,
                zoom: 1.0,
            }),
        }],
    })
}

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

/// Extract the local name (without namespace prefix) from an XML element.
fn local_name(e: &BytesStart<'_>) -> String {
    let binding = e.local_name();
    let full = String::from_utf8_lossy(binding.as_ref());
    full.to_string()
}

/// Read all text content until the matching end tag, skipping nested elements.
fn read_text_content(reader: &mut Reader<&[u8]>) -> Result<String, Tm7Error> {
    let mut buf = Vec::new();
    let mut text = String::new();
    let mut depth: u32 = 1;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Text(e)) => {
                if depth == 1 {
                    // Use unwrap_or_default for resilience — malformed XML entities
                    // (e.g. &invalid;) produce empty text rather than failing the import.
                    text.push_str(&e.unescape().unwrap_or_default());
                }
            }
            Ok(Event::Start(_)) => {
                depth += 1;
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(text)
}

/// Skip over an element and all its children until the matching end tag.
fn skip_element(reader: &mut Reader<&[u8]>) -> Result<(), Tm7Error> {
    let mut buf = Vec::new();
    let mut depth: u32 = 1;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(_)) => depth += 1,
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(())
}

/// Get the value of the `i:type` attribute from a start element.
fn get_itype(e: &BytesStart<'_>) -> Option<String> {
    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref());
        if key == "i:type" || key.ends_with(":type") {
            return Some(String::from_utf8_lossy(&attr.value).to_string());
        }
    }
    None
}

/// Check if an element has `i:nil="true"`.
fn is_nil(e: &BytesStart<'_>) -> bool {
    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref());
        if key == "i:nil" || key.ends_with(":nil") {
            return String::from_utf8_lossy(&attr.value) == "true";
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

fn parse_meta_information(reader: &mut Reader<&[u8]>) -> Result<Tm7Meta, Tm7Error> {
    let mut meta = Tm7Meta::default();
    let mut buf = Vec::new();
    let mut depth: u32 = 1;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                match name.as_str() {
                    "ThreatModelName" => meta.name = read_text_content(reader)?,
                    "Owner" => meta.owner = read_text_content(reader)?,
                    "HighLevelSystemDescription" => {
                        meta.description = read_text_content(reader)?;
                    }
                    _ => {}
                }
                // read_text_content consumes the end tag, so adjust depth
                if matches!(
                    name.as_str(),
                    "ThreatModelName" | "Owner" | "HighLevelSystemDescription"
                ) {
                    depth -= 1;
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(meta)
}

fn parse_drawing_surface(
    reader: &mut Reader<&[u8]>,
) -> Result<(String, Vec<Tm7Element>, Vec<Tm7Line>), Tm7Error> {
    let mut buf = Vec::new();
    let mut depth: u32 = 1;
    let mut diagram_name = String::new();
    let mut borders: Vec<Tm7Element> = Vec::new();
    let mut lines: Vec<Tm7Line> = Vec::new();
    let mut found_borders = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                match name.as_str() {
                    "Borders" => {
                        found_borders = true;
                        borders = parse_borders(reader)?;
                        depth -= 1; // parse_borders consumed end tag
                    }
                    "Lines" => {
                        lines = parse_lines(reader)?;
                        depth -= 1;
                    }
                    // Properties before Borders is the diagram-level properties
                    "Properties" if !found_borders => {
                        diagram_name = parse_properties_name(reader)?;
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok((diagram_name, borders, lines))
}

/// Parse the `<Borders>` section containing stencil elements and boundary boxes.
fn parse_borders(reader: &mut Reader<&[u8]>) -> Result<Vec<Tm7Element>, Tm7Error> {
    let mut elements = Vec::new();
    let mut buf = Vec::new();
    let mut depth: u32 = 1;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                if name == "Value" {
                    let itype = get_itype(e).unwrap_or_default();
                    let elem = parse_border_value(reader, &itype)?;
                    elements.push(elem);
                    depth -= 1; // parse_border_value consumed end tag
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(elements)
}

/// Parse a single `<Value>` element inside `<Borders>`.
fn parse_border_value(reader: &mut Reader<&[u8]>, itype: &str) -> Result<Tm7Element, Tm7Error> {
    let mut elem = Tm7Element {
        stencil_type: itype.to_string(),
        ..Default::default()
    };
    let mut buf = Vec::new();
    let mut depth: u32 = 1;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                match name.as_str() {
                    "GenericTypeId" => {
                        elem.generic_type_id = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "Guid" => {
                        elem.guid = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "Left" => {
                        elem.left = read_text_content(reader)?.parse().unwrap_or(0.0);
                        depth -= 1;
                    }
                    "Top" => {
                        elem.top = read_text_content(reader)?.parse().unwrap_or(0.0);
                        depth -= 1;
                    }
                    "Width" => {
                        elem.width = read_text_content(reader)?.parse().unwrap_or(100.0);
                        depth -= 1;
                    }
                    "Height" => {
                        elem.height = read_text_content(reader)?.parse().unwrap_or(100.0);
                        depth -= 1;
                    }
                    "Properties" => {
                        let (prop_name, out_of_scope) = parse_stencil_properties(reader)?;
                        elem.name = prop_name;
                        elem.out_of_scope = out_of_scope;
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(elem)
}

/// Parse `<Lines>` section containing connectors and line boundaries.
fn parse_lines(reader: &mut Reader<&[u8]>) -> Result<Vec<Tm7Line>, Tm7Error> {
    let mut lines = Vec::new();
    let mut buf = Vec::new();
    let mut depth: u32 = 1;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                if name == "Value" {
                    let itype = get_itype(e).unwrap_or_default();
                    let line = parse_line_value(reader, &itype)?;
                    lines.push(line);
                    depth -= 1;
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(lines)
}

/// Parse a single `<Value>` element inside `<Lines>`.
fn parse_line_value(reader: &mut Reader<&[u8]>, itype: &str) -> Result<Tm7Line, Tm7Error> {
    let mut line = Tm7Line {
        line_type: itype.to_string(),
        ..Default::default()
    };
    let mut buf = Vec::new();
    let mut depth: u32 = 1;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                match name.as_str() {
                    "GenericTypeId" => {
                        line.generic_type_id = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "Guid" => {
                        line.guid = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "SourceGuid" => {
                        line.source_guid = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "TargetGuid" => {
                        line.target_guid = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "SourceX" => {
                        line.source_x = read_text_content(reader)?.parse().unwrap_or(0.0);
                        depth -= 1;
                    }
                    "SourceY" => {
                        line.source_y = read_text_content(reader)?.parse().unwrap_or(0.0);
                        depth -= 1;
                    }
                    "TargetX" => {
                        line.target_x = read_text_content(reader)?.parse().unwrap_or(0.0);
                        depth -= 1;
                    }
                    "TargetY" => {
                        line.target_y = read_text_content(reader)?.parse().unwrap_or(0.0);
                        depth -= 1;
                    }
                    "Properties" => {
                        line.name = parse_properties_name(reader)?;
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }

    // Detect line boundaries by checking for nil GUIDs
    if line.line_type == "LineBoundary"
        || line.generic_type_id == "GE.TB.L"
        || line.generic_type_id.starts_with("GE.TB")
    {
        line.line_type = "LineBoundary".to_string();
    }

    Ok(line)
}

/// Parse `<ThreatInstances>` section.
fn parse_threat_instances(reader: &mut Reader<&[u8]>) -> Result<Vec<Tm7Threat>, Tm7Error> {
    let mut threats = Vec::new();
    let mut buf = Vec::new();
    let mut depth: u32 = 1;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                // The threat value element name varies but always contains "Value"
                if name == "Value" {
                    let threat = parse_threat_value(reader)?;
                    threats.push(threat);
                    depth -= 1;
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(threats)
}

/// Parse a single threat `<Value>` element.
fn parse_threat_value(reader: &mut Reader<&[u8]>) -> Result<Tm7Threat, Tm7Error> {
    let mut threat = Tm7Threat::default();
    let mut buf = Vec::new();
    let mut depth: u32 = 1;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                if is_nil(e) {
                    skip_element(reader)?;
                    depth -= 1;
                    buf.clear();
                    continue;
                }
                match name.as_str() {
                    "Id" => {
                        threat.id = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "FlowGuid" => {
                        threat.flow_guid = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "SourceGuid" => {
                        threat.source_guid = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "TargetGuid" => {
                        threat.target_guid = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "Priority" => {
                        threat.priority = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "State" => {
                        threat.state = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "StateInformation" => {
                        threat.state_information = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "TypeId" => {
                        threat.type_id = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "Properties" => {
                        threat.properties = parse_threat_properties(reader)?;
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(_)) => {
                // Self-closing nil elements (e.g. <b:Title i:nil="true"/>) — skip
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }

    // Fallback: if priority is empty, try from properties
    if threat.priority.is_empty() {
        if let Some(p) = threat.properties.get("Priority") {
            threat.priority = p.clone();
        }
    }

    Ok(threat)
}

/// Parse key-value properties inside a threat `<Properties>` element.
fn parse_threat_properties(
    reader: &mut Reader<&[u8]>,
) -> Result<HashMap<String, String>, Tm7Error> {
    let mut props = HashMap::new();
    let mut buf = Vec::new();
    let mut depth: u32 = 1;
    let mut current_key = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let name = local_name(e);
                if name == "Key" {
                    current_key = read_text_content(reader)?;
                    depth -= 1;
                } else if name == "Value" {
                    let value = read_text_content(reader)?;
                    if !current_key.is_empty() {
                        props.insert(current_key.clone(), value);
                    }
                    depth -= 1;
                }
            }
            Ok(Event::Empty(ref e)) => {
                // Handle self-closing <a:Value i:nil="true"/>
                let name = local_name(e);
                if name == "Value" && !current_key.is_empty() {
                    props.insert(current_key.clone(), String::new());
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok(props)
}

/// Extract the "Name" property from a `<Properties>` element.
/// Also returns whether "Out Of Scope" is true.
fn parse_stencil_properties(reader: &mut Reader<&[u8]>) -> Result<(String, bool), Tm7Error> {
    let mut name = String::new();
    let mut out_of_scope = false;
    let mut buf = Vec::new();
    let mut depth: u32 = 1;
    let mut current_display_name = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                depth += 1;
                let local = local_name(e);
                match local.as_str() {
                    "DisplayName" => {
                        current_display_name = read_text_content(reader)?;
                        depth -= 1;
                    }
                    "Value" => {
                        if is_nil(e) {
                            skip_element(reader)?;
                            depth -= 1;
                            current_display_name.clear();
                            buf.clear();
                            continue;
                        }
                        let value = read_text_content(reader)?;
                        match current_display_name.as_str() {
                            "Name" => name = value,
                            "Out Of Scope" => out_of_scope = value == "true",
                            _ => {}
                        }
                        current_display_name.clear();
                        depth -= 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                // Handle self-closing Value with i:nil="true"
                let local = local_name(e);
                if local == "Value" && current_display_name == "Name" && is_nil(e) {
                    // Name is nil — keep empty
                }
            }
            Ok(Event::End(_)) => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Tm7Error::Xml(e)),
            _ => {}
        }
        buf.clear();
    }
    Ok((name, out_of_scope))
}

/// Extract just the "Name" property from a `<Properties>` element.
fn parse_properties_name(reader: &mut Reader<&[u8]>) -> Result<String, Tm7Error> {
    let (name, _) = parse_stencil_properties(reader)?;
    Ok(name)
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/// Generate a unique kebab-case ID from a name.
fn make_unique_id(name: &str, fallback: &str, counter: &mut HashMap<String, u32>) -> String {
    let base = if name.is_empty() {
        fallback.to_string()
    } else {
        name.to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-")
    };

    let entry = counter.entry(base.clone()).or_insert(0);
    *entry += 1;
    if *entry == 1 {
        base
    } else {
        format!("{base}-{}", *entry)
    }
}

/// Map a TM7 STRIDE category string or TypeId prefix to our `StrideCategory`.
fn parse_stride_category(category: &str, type_id: &str) -> StrideCategory {
    // Try the explicit category string first
    match category {
        "Spoofing" => return StrideCategory::Spoofing,
        "Tampering" => return StrideCategory::Tampering,
        "Repudiation" => return StrideCategory::Repudiation,
        "Information Disclosure" => return StrideCategory::InformationDisclosure,
        "Denial Of Service" | "Denial of Service" => return StrideCategory::DenialOfService,
        "Elevation Of Privilege" | "Elevation of Privilege" => {
            return StrideCategory::ElevationOfPrivilege;
        }
        _ => {}
    }

    // Fallback: infer from TypeId prefix (S1, T7, I23, etc.)
    match type_id.chars().next() {
        Some('S') => StrideCategory::Spoofing,
        Some('T') => StrideCategory::Tampering,
        Some('R') => StrideCategory::Repudiation,
        Some('I') => StrideCategory::InformationDisclosure,
        Some('D') => StrideCategory::DenialOfService,
        Some('E') => StrideCategory::ElevationOfPrivilege,
        _ => StrideCategory::Tampering, // safe default
    }
}

/// Map a TM7 priority string to our `Severity`.
fn parse_severity(priority: &str) -> Severity {
    match priority {
        "Critical" => Severity::Critical,
        "High" => Severity::High,
        "Medium" => Severity::Medium,
        "Low" => Severity::Low,
        _ => Severity::Medium,
    }
}

/// Map a TM7 state to our `Mitigation` struct.
fn parse_mitigation_status(state: &str, justification: &str) -> Mitigation {
    let status = match state {
        "Mitigated" => MitigationStatus::Mitigated,
        "NotApplicable" => MitigationStatus::Accepted,
        "NeedsInvestigation" | "Not Started" => MitigationStatus::NotStarted,
        // "AutoGenerated" and anything else → not started
        _ => MitigationStatus::NotStarted,
    };
    Mitigation {
        status,
        description: justification.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL_TM7: &str = r#"<?xml version="1.0"?>
<ThreatModel xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <DrawingSurfaceList>
    <DrawingSurfaceModel xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/">
      <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</GenericTypeId>
      <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">aaaa-bbbb</Guid>
      <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
          <b:DisplayName>Name</b:DisplayName>
          <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Diagram 1</b:Value>
        </a:anyType>
      </Properties>
      <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</TypeId>
      <Borders xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-user</a:Key>
          <a:Value i:type="StencilRectangle">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.EI</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-user</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">User</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">some-type</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">10</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">81</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
        <a:KeyValueOfguidanyType>
          <a:Key>guid-webapp</a:Key>
          <a:Value i:type="StencilEllipse">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.P</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-webapp</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Web Application</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">some-type</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">449</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">94</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
        <a:KeyValueOfguidanyType>
          <a:Key>guid-db</a:Key>
          <a:Value i:type="StencilParallelLines">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.DS</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-db</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">SQL Database</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">some-type</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">684</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">93</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
        <a:KeyValueOfguidanyType>
          <a:Key>guid-boundary</a:Key>
          <a:Value i:type="BorderBoundary">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">boundary-type</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-boundary</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Internet DMZ</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">some-type</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">231</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">222</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">26</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">611</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Borders>
      <Lines xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-flow-1</a:Key>
          <a:Value i:type="Connector">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.DF</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-flow-1</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">HTTPS Request</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">some-type</TypeId>
            <HandleX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">300</HandleX>
            <HandleY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">88</HandleY>
            <SourceGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-user</SourceGuid>
            <SourceX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">110</SourceX>
            <SourceY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">131</SourceY>
            <TargetGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-webapp</TargetGuid>
            <TargetX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">449</TargetX>
            <TargetY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">144</TargetY>
          </a:Value>
        </a:KeyValueOfguidanyType>
        <a:KeyValueOfguidanyType>
          <a:Key>guid-flow-2</a:Key>
          <a:Value i:type="Connector">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.DF</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-flow-2</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">SQL</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">some-type</TypeId>
            <HandleX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">624</HandleX>
            <HandleY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">88</HandleY>
            <SourceGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-webapp</SourceGuid>
            <SourceX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">544</SourceX>
            <SourceY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">144</SourceY>
            <TargetGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-db</TargetGuid>
            <TargetX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">684</TargetX>
            <TargetY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">143</TargetY>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Lines>
    </DrawingSurfaceModel>
  </DrawingSurfaceList>
  <MetaInformation>
    <Assumptions/>
    <Contributors/>
    <ExternalDependencies/>
    <HighLevelSystemDescription>A sample web application threat model.</HighLevelSystemDescription>
    <Owner>Alice</Owner>
    <Reviewer/>
    <ThreatModelName>Sample Web App</ThreatModelName>
  </MetaInformation>
  <Notes/>
  <ThreatInstances xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
    <a:KeyValueOfstringThreatpc_P0_PhOB>
      <a:Key>T-guid-webapp-guid-flow-2-guid-db</a:Key>
      <a:Value xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
        <b:ChangedBy i:nil="true"/>
        <b:DrawingSurfaceGuid>aaaa-bbbb</b:DrawingSurfaceGuid>
        <b:FlowGuid>guid-flow-2</b:FlowGuid>
        <b:Id>1</b:Id>
        <b:InteractionKey>guid-webapp:guid-flow-2:guid-db</b:InteractionKey>
        <b:ModifiedAt>0001-01-01T00:00:00</b:ModifiedAt>
        <b:Priority>High</b:Priority>
        <b:Properties>
          <a:KeyValueOfstringstring>
            <a:Key>Title</a:Key>
            <a:Value>SQL Injection on Database</a:Value>
          </a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring>
            <a:Key>UserThreatCategory</a:Key>
            <a:Value>Tampering</a:Value>
          </a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring>
            <a:Key>UserThreatDescription</a:Key>
            <a:Value>An attacker could inject malicious SQL queries.</a:Value>
          </a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring>
            <a:Key>Priority</a:Key>
            <a:Value>High</a:Value>
          </a:KeyValueOfstringstring>
        </b:Properties>
        <b:SourceGuid>guid-webapp</b:SourceGuid>
        <b:State>Mitigated</b:State>
        <b:StateInformation>Using parameterized queries.</b:StateInformation>
        <b:TargetGuid>guid-db</b:TargetGuid>
        <b:Title i:nil="true"/>
        <b:TypeId>T7</b:TypeId>
        <b:Upgraded>false</b:Upgraded>
      </a:Value>
    </a:KeyValueOfstringThreatpc_P0_PhOB>
    <a:KeyValueOfstringThreatpc_P0_PhOB>
      <a:Key>S-guid-user-guid-flow-1-guid-webapp</a:Key>
      <a:Value xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
        <b:ChangedBy i:nil="true"/>
        <b:DrawingSurfaceGuid>aaaa-bbbb</b:DrawingSurfaceGuid>
        <b:FlowGuid>guid-flow-1</b:FlowGuid>
        <b:Id>2</b:Id>
        <b:InteractionKey>guid-user:guid-flow-1:guid-webapp</b:InteractionKey>
        <b:ModifiedAt>0001-01-01T00:00:00</b:ModifiedAt>
        <b:Priority>Medium</b:Priority>
        <b:Properties>
          <a:KeyValueOfstringstring>
            <a:Key>Title</a:Key>
            <a:Value>Spoofing of User</a:Value>
          </a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring>
            <a:Key>UserThreatCategory</a:Key>
            <a:Value>Spoofing</a:Value>
          </a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring>
            <a:Key>UserThreatDescription</a:Key>
            <a:Value>An attacker could impersonate a legitimate user.</a:Value>
          </a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring>
            <a:Key>Priority</a:Key>
            <a:Value>Medium</a:Value>
          </a:KeyValueOfstringstring>
        </b:Properties>
        <b:SourceGuid>guid-user</b:SourceGuid>
        <b:State>AutoGenerated</b:State>
        <b:StateInformation/>
        <b:TargetGuid>guid-webapp</b:TargetGuid>
        <b:Title i:nil="true"/>
        <b:TypeId>S1</b:TypeId>
        <b:Upgraded>false</b:Upgraded>
      </a:Value>
    </a:KeyValueOfstringThreatpc_P0_PhOB>
  </ThreatInstances>
  <ThreatGenerationEnabled>true</ThreatGenerationEnabled>
  <Version>4.3</Version>
</ThreatModel>"#;

    #[test]
    fn test_parse_minimal_tm7() {
        let model = parse_tm7(MINIMAL_TM7).expect("Failed to parse TM7");

        // Metadata
        assert_eq!(model.metadata.title, "Sample Web App");
        assert_eq!(model.metadata.author, "Alice");
        assert_eq!(
            model.metadata.description,
            "A sample web application threat model."
        );

        // Elements
        assert_eq!(model.elements.len(), 3);
        assert_eq!(model.elements[0].name, "User");
        assert_eq!(model.elements[0].element_type, "external_entity");
        assert_eq!(
            model.elements[0].position,
            Some(Position { x: 10.0, y: 81.0 })
        );

        assert_eq!(model.elements[1].name, "Web Application");
        assert_eq!(model.elements[1].element_type, "process");

        assert_eq!(model.elements[2].name, "SQL Database");
        assert_eq!(model.elements[2].element_type, "data_store");

        // Trust boundaries
        assert_eq!(model.trust_boundaries.len(), 1);
        assert_eq!(model.trust_boundaries[0].name, "Internet DMZ");
        assert_eq!(
            model.trust_boundaries[0].position,
            Some(Position { x: 222.0, y: 26.0 })
        );
        assert_eq!(
            model.trust_boundaries[0].size,
            Some(Size {
                width: 611.0,
                height: 231.0
            })
        );
        // Web Application and SQL Database should be inside the boundary
        assert!(model.trust_boundaries[0]
            .contains
            .contains(&model.elements[1].id));
        assert!(model.trust_boundaries[0]
            .contains
            .contains(&model.elements[2].id));

        // Data flows
        assert_eq!(model.data_flows.len(), 2);
        assert_eq!(model.data_flows[0].name, "HTTPS Request");
        assert_eq!(model.data_flows[0].from, model.elements[0].id); // User
        assert_eq!(model.data_flows[0].to, model.elements[1].id); // Web Application
        assert_eq!(model.data_flows[1].name, "SQL");
        assert_eq!(model.data_flows[1].from, model.elements[1].id); // Web App
        assert_eq!(model.data_flows[1].to, model.elements[2].id); // SQL Database

        // Threats
        assert_eq!(model.threats.len(), 2);

        assert_eq!(model.threats[0].title, "SQL Injection on Database");
        assert_eq!(model.threats[0].category, StrideCategory::Tampering);
        assert_eq!(model.threats[0].severity, Severity::High);
        assert_eq!(model.threats[0].flow, Some(model.data_flows[1].id.clone()));
        assert_eq!(
            model.threats[0].mitigation.as_ref().unwrap().status,
            MitigationStatus::Mitigated
        );
        assert_eq!(
            model.threats[0].mitigation.as_ref().unwrap().description,
            "Using parameterized queries."
        );

        assert_eq!(model.threats[1].title, "Spoofing of User");
        assert_eq!(model.threats[1].category, StrideCategory::Spoofing);
        assert_eq!(model.threats[1].severity, Severity::Medium);
        assert_eq!(
            model.threats[1].mitigation.as_ref().unwrap().status,
            MitigationStatus::NotStarted
        );

        // Diagram
        assert_eq!(model.diagrams.len(), 1);
        assert_eq!(model.diagrams[0].name, "Diagram 1");
    }

    #[test]
    fn test_parse_empty_tm7() {
        let xml = r#"<?xml version="1.0"?>
<ThreatModel xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <DrawingSurfaceList/>
  <MetaInformation>
    <ThreatModelName/>
    <Owner/>
    <HighLevelSystemDescription/>
  </MetaInformation>
  <ThreatInstances/>
  <Version>4.3</Version>
</ThreatModel>"#;

        let model = parse_tm7(xml).expect("Failed to parse empty TM7");
        assert_eq!(model.metadata.title, "Imported Threat Model");
        assert!(model.elements.is_empty());
        assert!(model.data_flows.is_empty());
        assert!(model.threats.is_empty());
    }

    #[test]
    fn test_unique_id_generation() {
        let mut counter = HashMap::new();
        assert_eq!(
            make_unique_id("Web App", "process", &mut counter),
            "web-app"
        );
        assert_eq!(
            make_unique_id("Web App", "process", &mut counter),
            "web-app-2"
        );
        assert_eq!(
            make_unique_id("Web App", "process", &mut counter),
            "web-app-3"
        );
        assert_eq!(make_unique_id("DB", "data_store", &mut counter), "db");
    }

    #[test]
    fn test_stride_category_parsing() {
        assert_eq!(
            parse_stride_category("Spoofing", "S1"),
            StrideCategory::Spoofing
        );
        assert_eq!(
            parse_stride_category("Information Disclosure", "I23"),
            StrideCategory::InformationDisclosure
        );
        assert_eq!(
            parse_stride_category("Denial Of Service", "D5"),
            StrideCategory::DenialOfService
        );
        // Fallback from type_id prefix
        assert_eq!(
            parse_stride_category("Unknown", "E12"),
            StrideCategory::ElevationOfPrivilege
        );
        assert_eq!(parse_stride_category("", "R3"), StrideCategory::Repudiation);
    }

    #[test]
    fn test_severity_parsing() {
        assert_eq!(parse_severity("High"), Severity::High);
        assert_eq!(parse_severity("Medium"), Severity::Medium);
        assert_eq!(parse_severity("Low"), Severity::Low);
        assert_eq!(parse_severity("Critical"), Severity::Critical);
        assert_eq!(parse_severity("Unknown"), Severity::Medium);
    }

    #[test]
    fn test_mitigation_status_parsing() {
        let m = parse_mitigation_status("Mitigated", "Fixed it");
        assert_eq!(m.status, MitigationStatus::Mitigated);
        assert_eq!(m.description, "Fixed it");

        let m = parse_mitigation_status("AutoGenerated", "");
        assert_eq!(m.status, MitigationStatus::NotStarted);

        let m = parse_mitigation_status("NotApplicable", "Not relevant");
        assert_eq!(m.status, MitigationStatus::Accepted);
    }

    #[test]
    fn test_out_of_scope_elements_excluded() {
        let xml = r#"<?xml version="1.0"?>
<ThreatModel xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <DrawingSurfaceList>
    <DrawingSurfaceModel xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/">
      <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</GenericTypeId>
      <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">ds-1</Guid>
      <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
          <b:DisplayName>Name</b:DisplayName>
          <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Diagram 1</b:Value>
        </a:anyType>
      </Properties>
      <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</TypeId>
      <Borders xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-in-scope</a:Key>
          <a:Value i:type="StencilEllipse">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.P</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-in-scope</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">In Scope App</b:Value>
              </a:anyType>
              <a:anyType i:type="b:BooleanDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Out Of Scope</b:DisplayName>
                <b:Value i:type="c:boolean" xmlns:c="http://www.w3.org/2001/XMLSchema">false</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
        <a:KeyValueOfguidanyType>
          <a:Key>guid-out-of-scope</a:Key>
          <a:Value i:type="StencilEllipse">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.P</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-out-of-scope</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Out Of Scope App</b:Value>
              </a:anyType>
              <a:anyType i:type="b:BooleanDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Out Of Scope</b:DisplayName>
                <b:Value i:type="c:boolean" xmlns:c="http://www.w3.org/2001/XMLSchema">true</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">400</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Borders>
      <Lines xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays"/>
    </DrawingSurfaceModel>
  </DrawingSurfaceList>
  <MetaInformation><ThreatModelName>Scope Test</ThreatModelName><Owner/><HighLevelSystemDescription/></MetaInformation>
  <ThreatInstances/>
  <Version>4.3</Version>
</ThreatModel>"#;

        let model = parse_tm7(xml).expect("Failed to parse");
        assert_eq!(
            model.elements.len(),
            1,
            "Out-of-scope element should be excluded"
        );
        assert_eq!(model.elements[0].name, "In Scope App");
    }

    #[test]
    fn test_threat_with_orphaned_flow_guid() {
        // Flow references an out-of-scope element, so it's skipped.
        // The threat referencing that flow should still appear but with flow: None.
        let xml = r#"<?xml version="1.0"?>
<ThreatModel xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <DrawingSurfaceList>
    <DrawingSurfaceModel xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/">
      <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</GenericTypeId>
      <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">ds-1</Guid>
      <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
          <b:DisplayName>Name</b:DisplayName>
          <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">D</b:Value>
        </a:anyType>
      </Properties>
      <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</TypeId>
      <Borders xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-a</a:Key>
          <a:Value i:type="StencilEllipse">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.P</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-a</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">App A</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">0</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">0</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Borders>
      <Lines xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays"/>
    </DrawingSurfaceModel>
  </DrawingSurfaceList>
  <MetaInformation><ThreatModelName>Orphan Test</ThreatModelName><Owner/><HighLevelSystemDescription/></MetaInformation>
  <ThreatInstances xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
    <a:KeyValueOfstringThreatpc_P0_PhOB>
      <a:Key>T-orphan</a:Key>
      <a:Value xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
        <b:FlowGuid>guid-nonexistent-flow</b:FlowGuid>
        <b:Id>1</b:Id>
        <b:Priority>High</b:Priority>
        <b:Properties>
          <a:KeyValueOfstringstring><a:Key>Title</a:Key><a:Value>Orphaned Threat</a:Value></a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring><a:Key>UserThreatCategory</a:Key><a:Value>Tampering</a:Value></a:KeyValueOfstringstring>
          <a:KeyValueOfstringstring><a:Key>UserThreatDescription</a:Key><a:Value>Desc</a:Value></a:KeyValueOfstringstring>
        </b:Properties>
        <b:SourceGuid>guid-a</b:SourceGuid>
        <b:State>AutoGenerated</b:State>
        <b:StateInformation/>
        <b:TargetGuid>guid-unknown</b:TargetGuid>
        <b:TypeId>T1</b:TypeId>
      </a:Value>
    </a:KeyValueOfstringThreatpc_P0_PhOB>
  </ThreatInstances>
  <Version>4.3</Version>
</ThreatModel>"#;

        let model = parse_tm7(xml).expect("Failed to parse");
        assert_eq!(model.threats.len(), 1);
        assert_eq!(model.threats[0].title, "Orphaned Threat");
        assert!(
            model.threats[0].flow.is_none(),
            "Flow should be None when GUID doesn't resolve"
        );
        assert_eq!(
            model.threats[0].element,
            Some("app-a".to_string()),
            "Source element should still resolve"
        );
    }

    #[test]
    fn test_duplicate_element_names_get_unique_ids() {
        let xml = r#"<?xml version="1.0"?>
<ThreatModel xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <DrawingSurfaceList>
    <DrawingSurfaceModel xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/">
      <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</GenericTypeId>
      <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">ds-1</Guid>
      <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
          <b:DisplayName>Name</b:DisplayName>
          <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">D</b:Value>
        </a:anyType>
      </Properties>
      <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</TypeId>
      <Borders xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-1</a:Key>
          <a:Value i:type="StencilEllipse">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.P</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-1</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Web App</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">0</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">0</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
        <a:KeyValueOfguidanyType>
          <a:Key>guid-2</a:Key>
          <a:Value i:type="StencilEllipse">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.P</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-2</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Web App</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">200</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">0</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Borders>
      <Lines xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays"/>
    </DrawingSurfaceModel>
  </DrawingSurfaceList>
  <MetaInformation><ThreatModelName>Dup Test</ThreatModelName><Owner/><HighLevelSystemDescription/></MetaInformation>
  <ThreatInstances/>
  <Version>4.3</Version>
</ThreatModel>"#;

        let model = parse_tm7(xml).expect("Failed to parse");
        assert_eq!(model.elements.len(), 2);
        assert_eq!(model.elements[0].id, "web-app");
        assert_eq!(model.elements[1].id, "web-app-2");
    }

    #[test]
    fn test_line_boundary_parsed() {
        let xml = r#"<?xml version="1.0"?>
<ThreatModel xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <DrawingSurfaceList>
    <DrawingSurfaceModel xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/">
      <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</GenericTypeId>
      <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">ds-1</Guid>
      <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
          <b:DisplayName>Name</b:DisplayName>
          <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">D</b:Value>
        </a:anyType>
      </Properties>
      <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">DRAWINGSURFACE</TypeId>
      <Borders xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays"/>
      <Lines xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-lb</a:Key>
          <a:Value i:type="LineBoundary">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.TB.L</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-lb</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Internet Boundary</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <SourceGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">00000000-0000-0000-0000-000000000000</SourceGuid>
            <SourceX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</SourceX>
            <SourceY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">10</SourceY>
            <TargetGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">00000000-0000-0000-0000-000000000000</TargetGuid>
            <TargetX xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">100</TargetX>
            <TargetY xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">350</TargetY>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Lines>
    </DrawingSurfaceModel>
  </DrawingSurfaceList>
  <MetaInformation><ThreatModelName>Line Boundary Test</ThreatModelName><Owner/><HighLevelSystemDescription/></MetaInformation>
  <ThreatInstances/>
  <Version>4.3</Version>
</ThreatModel>"#;

        let model = parse_tm7(xml).expect("Failed to parse");
        assert_eq!(model.trust_boundaries.len(), 1);
        assert_eq!(model.trust_boundaries[0].name, "Internet Boundary");
        // Line boundary should be converted to a rectangle
        assert!(model.trust_boundaries[0].position.is_some());
        assert!(model.trust_boundaries[0].size.is_some());
        let size = model.trust_boundaries[0].size.as_ref().unwrap();
        assert!(size.width >= 200.0, "Width should be at least 200 (min)");
        assert_eq!(size.height, 340.0, "Height should be |350 - 10|");
    }

    #[test]
    fn test_malformed_xml_returns_error() {
        let xml = "<ThreatModel><broken";
        let result = parse_tm7(xml);
        assert!(result.is_err(), "Malformed XML should return an error");
    }

    #[test]
    fn test_needs_investigation_maps_to_not_started() {
        let m = parse_mitigation_status("NeedsInvestigation", "Checking");
        assert_eq!(m.status, MitigationStatus::NotStarted);
        assert_eq!(m.description, "Checking");
    }

    #[test]
    fn test_unknown_stride_fallback_from_type_id() {
        // TypeId starting with unknown prefix should fall back to Tampering
        let cat = parse_stride_category("", "X.something");
        assert_eq!(cat, StrideCategory::Tampering);
    }

    #[test]
    fn test_self_loop_flow_imported() {
        let xml = r#"<?xml version="1.0"?>
<ThreatModel xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <DrawingSurfaceList>
    <DrawingSurfaceModel xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/">
      <Borders xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-node</a:Key>
          <a:Value i:type="StencilEllipse">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.P</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-node</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Server</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <Height xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">80</Height>
            <Left xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">50</Left>
            <Top xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">50</Top>
            <Width xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">80</Width>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Borders>
      <Lines xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
        <a:KeyValueOfguidanyType>
          <a:Key>guid-selfloop</a:Key>
          <a:Value i:type="Connector">
            <GenericTypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">GE.DF</GenericTypeId>
            <Guid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-selfloop</Guid>
            <Properties xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts" xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
              <a:anyType i:type="b:StringDisplayAttribute" xmlns:b="http://schemas.datacontract.org/2004/07/ThreatModeling.KnowledgeBase">
                <b:DisplayName>Name</b:DisplayName>
                <b:Value i:type="c:string" xmlns:c="http://www.w3.org/2001/XMLSchema">Self-refresh</b:Value>
              </a:anyType>
            </Properties>
            <TypeId xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">t</TypeId>
            <SourceGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-node</SourceGuid>
            <TargetGuid xmlns="http://schemas.datacontract.org/2004/07/ThreatModeling.Model.Abstracts">guid-node</TargetGuid>
          </a:Value>
        </a:KeyValueOfguidanyType>
      </Lines>
    </DrawingSurfaceModel>
  </DrawingSurfaceList>
  <MetaInformation><ThreatModelName>Self Loop Test</ThreatModelName><Owner/><HighLevelSystemDescription/></MetaInformation>
  <ThreatInstances/>
</ThreatModel>"#;

        let model = parse_tm7(xml).expect("Failed to parse self-loop TM7");
        assert_eq!(model.data_flows.len(), 1);
        assert_eq!(
            model.data_flows[0].from, model.data_flows[0].to,
            "Self-loop should have from == to"
        );
        assert_eq!(model.data_flows[0].name, "Self-refresh");
    }
}

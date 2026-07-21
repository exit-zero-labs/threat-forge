//! End-to-end check that the `threatforge-mcp` binary starts, completes the MCP
//! handshake over stdio, advertises its tools, and executes one.
//!
//! This drives the real binary over real pipes rather than calling the handler
//! directly, so a transport or protocol regression cannot pass unnoticed.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::Duration;

use serde_json::{json, Value};

/// Generous enough for a cold process start on a loaded CI runner, short enough
/// that a hung server fails the test instead of the job.
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);

const MODEL_THF: &str = "\
version: '1.0'
metadata:
  title: MCP Fixture
  author: Tester
  created: 2026-01-01
  modified: 2026-01-01
  description: ''
elements: []
data_flows: []
trust_boundaries: []
threats: []
diagrams:
- id: main-dfd
  name: Level 0 DFD
";

/// A running `threatforge-mcp` process with line-oriented JSON-RPC plumbing.
struct McpServer {
    child: Child,
    stdin: ChildStdin,
    stdout: Receiver<String>,
}

impl McpServer {
    fn spawn(model_path: &std::path::Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_threatforge-mcp"))
            .arg(model_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("threatforge-mcp should start");

        let stdin = child.stdin.take().expect("stdin is piped");
        let raw_stdout = child.stdout.take().expect("stdout is piped");

        // Read on a worker thread so a silent server times out instead of
        // blocking the test forever.
        let (tx, stdout) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(raw_stdout).lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });

        Self {
            child,
            stdin,
            stdout,
        }
    }

    fn send(&mut self, message: &Value) {
        writeln!(self.stdin, "{message}").expect("request should be written");
        self.stdin.flush().expect("request should be flushed");
    }

    /// Send a request and return its `result` payload.
    fn request(&mut self, id: u32, method: &str, params: Value) -> Value {
        self.send(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }));

        let line = match self.stdout.recv_timeout(RESPONSE_TIMEOUT) {
            Ok(line) => line,
            Err(RecvTimeoutError::Timeout) => panic!("timed out waiting for a `{method}` response"),
            Err(RecvTimeoutError::Disconnected) => {
                panic!("server exited before answering `{method}`")
            }
        };

        let response: Value = serde_json::from_str(&line)
            .unwrap_or_else(|e| panic!("`{method}` response is not JSON ({e}): {line}"));
        assert_eq!(response["id"], json!(id), "response id mismatch: {line}");
        assert!(
            response.get("error").is_none(),
            "`{method}` returned an error: {line}"
        );
        response["result"].clone()
    }
}

impl Drop for McpServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn initialize_params(protocol_version: &str) -> Value {
    json!({
        "protocolVersion": protocol_version,
        "capabilities": {},
        "clientInfo": { "name": "threatforge-tests", "version": "0" },
    })
}

#[test]
fn mcp_server_handshakes_lists_its_tools_and_executes_one_over_stdio() {
    let dir = tempfile::tempdir().expect("temp dir");
    let model_path = dir.path().join("model.thf");
    std::fs::write(&model_path, MODEL_THF).expect("fixture .thf should be written");

    let mut server = McpServer::spawn(&model_path);

    let init = server.request(1, "initialize", initialize_params("2024-11-05"));
    assert_eq!(init["protocolVersion"], json!("2024-11-05"));
    assert_eq!(init["serverInfo"]["name"], json!("threatforge-mcp"));
    assert!(
        init["capabilities"]["tools"].is_object(),
        "server must advertise the tools capability: {init}"
    );

    server.send(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));

    let listed = server.request(2, "tools/list", json!({}));
    let mut names: Vec<&str> = listed["tools"]
        .as_array()
        .expect("tools/list returns an array")
        .iter()
        .map(|t| t["name"].as_str().expect("each tool has a name"))
        .collect();
    names.sort_unstable();
    assert_eq!(
        names,
        [
            "add_data_flow",
            "add_element",
            "add_threat",
            "add_trust_boundary",
            "delete_data_flow",
            "delete_element",
            "delete_threat",
            "delete_trust_boundary",
            "get_model",
            "list_elements",
            "list_threats",
            "update_element",
        ]
    );

    let called = server.request(
        3,
        "tools/call",
        json!({
            "name": "add_element",
            "arguments": { "element_type": "process", "name": "Web API" },
        }),
    );
    assert_eq!(
        called["content"][0]["text"],
        json!("Added element: web-api"),
        "add_element should report the generated id: {called}"
    );

    let saved = std::fs::read_to_string(&model_path).expect("model file should still be readable");
    assert!(
        saved.contains("id: web-api"),
        "the tool call must be persisted to the .thf file, got:\n{saved}"
    );
}

/// The server declares `2024-11-05` in `get_info`, but rmcp echoes back any
/// protocol version it recognises, so a newer client is not silently downgraded
/// and an unrecognised one falls back to the declared version.
#[test]
fn mcp_server_negotiates_a_known_protocol_version_and_falls_back_otherwise() {
    let dir = tempfile::tempdir().expect("temp dir");
    let model_path = dir.path().join("model.thf");
    std::fs::write(&model_path, MODEL_THF).expect("fixture .thf should be written");

    let mut newer = McpServer::spawn(&model_path);
    let init = newer.request(1, "initialize", initialize_params("2025-11-25"));
    assert_eq!(init["protocolVersion"], json!("2025-11-25"));

    let mut unknown = McpServer::spawn(&model_path);
    let init = unknown.request(1, "initialize", initialize_params("1999-01-01"));
    assert_eq!(init["protocolVersion"], json!("2024-11-05"));
}

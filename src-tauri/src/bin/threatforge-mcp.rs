//! ThreatForge MCP Server binary — stdio transport.
//!
//! Usage:
//!   threatforge-mcp <path-to-model.thf>
//!
//! External AI tools (Claude Code, VS Code Copilot, Cursor) spawn this
//! process and communicate via MCP over stdin/stdout.

use std::path::PathBuf;

use rmcp::transport::stdio;
use rmcp::ServiceExt;

use threat_forge_lib::mcp::server::ThreatForgeServer;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: threatforge-mcp <path-to-model.thf>");
        std::process::exit(1);
    }
    let file_path = PathBuf::from(&args[1]);
    if !file_path.exists() {
        eprintln!("File not found: {}", file_path.display());
        std::process::exit(1);
    }

    let server = match ThreatForgeServer::new(file_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to initialize MCP server: {e}");
            std::process::exit(1);
        }
    };

    let service = match server.serve(stdio()).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to start MCP server: {e}");
            std::process::exit(1);
        }
    };

    if let Err(e) = service.waiting().await {
        eprintln!("MCP server error: {e}");
        std::process::exit(1);
    }
}

# ThreatForge MCP Server

ThreatForge includes a Model Context Protocol (MCP) server that allows external AI tools to read and modify threat models programmatically.

## Overview

The MCP server exposes `.thf` threat model files via the MCP protocol over stdio. External AI assistants (Claude Code, VS Code Copilot, Cursor, etc.) can connect to it and use tools to query and modify threat models.

## Building

The MCP server binary is built alongside the main application:

```bash
cd src-tauri
cargo build --bin threatforge-mcp            # Debug build
cargo build --release --bin threatforge-mcp  # Release build (optimized)
```

The binary will be at `src-tauri/target/debug/threatforge-mcp` (debug) or `src-tauri/target/release/threatforge-mcp` (release). Use the release build for production.

## Usage

```bash
threatforge-mcp <path-to-model.thf>
```

The server reads the specified `.thf` file and communicates via stdin/stdout using the MCP protocol.

## Configuration

### Claude Code

Add to your Claude Code MCP configuration (`.claude/mcp.json` or project settings):

```json
{
  "mcpServers": {
    "threatforge": {
      "command": "/path/to/threatforge-mcp",
      "args": ["/path/to/your-model.thf"]
    }
  }
}
```

### VS Code (Copilot / Continue)

Add to your VS Code settings or MCP extension configuration:

```json
{
  "mcp.servers": {
    "threatforge": {
      "command": "/path/to/threatforge-mcp",
      "args": ["/path/to/your-model.thf"]
    }
  }
}
```

### Cursor

Add to your Cursor MCP configuration:

```json
{
  "mcpServers": {
    "threatforge": {
      "command": "/path/to/threatforge-mcp",
      "args": ["/path/to/your-model.thf"]
    }
  }
}
```

## Available Tools

### Read Operations

| Tool | Description |
|------|-------------|
| `get_model` | Returns the full threat model as JSON |
| `list_elements` | Lists all DFD elements with IDs, types, and names |
| `list_threats` | Lists all threats with IDs, titles, categories, and severities |

### Element Operations

| Tool | Parameters | Description |
|------|-----------|-------------|
| `add_element` | `element_type`, `name`, `trust_zone?`, `description?`, `technologies?` | Add a new DFD element |
| `update_element` | `id`, `name?`, `element_type?`, `trust_zone?`, `description?` | Update an element |
| `delete_element` | `id` | Delete an element (cascades to connected flows) |

### Data Flow Operations

| Tool | Parameters | Description |
|------|-----------|-------------|
| `add_data_flow` | `from`, `to`, `name?`, `protocol?`, `data?`, `authenticated?` | Add a data flow between elements |
| `delete_data_flow` | `id` | Delete a data flow |

### Trust Boundary Operations

| Tool | Parameters | Description |
|------|-----------|-------------|
| `add_trust_boundary` | `name`, `contains?` | Add a trust boundary |
| `delete_trust_boundary` | `id` | Delete a trust boundary |

### Threat Operations

| Tool | Parameters | Description |
|------|-----------|-------------|
| `add_threat` | `title`, `category`, `severity`, `description`, `element?`, `flow?` | Add a STRIDE threat |
| `delete_threat` | `id` | Delete a threat |

## Element Types

- `process` — A software process or service
- `data_store` — A database or persistent storage
- `external_entity` — An external system or actor

## STRIDE Categories

- `Spoofing`
- `Tampering`
- `Repudiation`
- `Information Disclosure`
- `Denial of Service`
- `Elevation of Privilege`

## Severity Levels

- `critical`, `high`, `medium`, `low`, `info`

## How It Works

The MCP server:

1. Loads the `.thf` file on startup
2. Reloads from disk before each operation (picks up external changes)
3. Writes changes back to disk after each mutation
4. Communicates via JSON-RPC over stdin/stdout

This file-based approach means the MCP server and the ThreatForge desktop app can work with the same file. The desktop app detects file changes and updates its canvas accordingly.

## Cascading Deletes

When an element is deleted:
- All data flows connected to that element are removed
- The element is removed from any trust boundary `contains` lists

## Limitations

- No real-time sync with the running desktop app (file-based sync only)
- No undo/redo from MCP mutations (use the desktop app for undo)
- Layout positions are preserved but not managed by MCP tools

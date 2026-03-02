# Debugging Tauri IPC

Guide for diagnosing and fixing issues in the Rust-React communication layer.

## How Tauri IPC Works

ThreatForge uses Tauri v2's IPC system:

```
React Frontend                    Rust Backend
     |                                 |
     |-- invoke("command", args) ----->|
     |                                 |-- #[tauri::command] fn
     |                                 |-- Returns Result<T, String>
     |<---- JSON response -------------|
     |                                 |
     |<---- emit("event", data) -------|  (async events)
```

- **Commands**: Synchronous request-response. Frontend calls `invoke()`, Rust handler returns.
- **Events**: Async backend-to-frontend. Rust calls `app.emit()`, frontend listens.
- **All data is JSON-serialized** across the boundary via serde.

## Common Issues

### 1. "command not found" Error

**Symptom**: `invoke("my_command")` throws "command my_command not found"

**Cause**: Command not registered in the invoke handler.

**Fix**: Add the command to `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    my_new_command,  // Add here
])
```

Also ensure it's imported:
```rust
use commands::my_new_command;
```

### 2. Serialization Mismatch

**Symptom**: Command returns successfully but data is wrong or fields are missing.

**Cause**: Rust struct field names don't match TypeScript interface.

**Debug**:
```rust
// Add debug logging in the Rust command
println!("Serialized: {}", serde_json::to_string_pretty(&result).unwrap());
```

```typescript
// Log the raw response in TypeScript
const result = await invoke("my_command", { args });
console.log("IPC result:", JSON.stringify(result, null, 2));
```

**Common pitfalls**:
- Rust uses `snake_case`, TypeScript uses `camelCase`. Use `#[serde(rename_all = "snake_case")]` on Rust structs (or match manually).
- Missing `Serialize`/`Deserialize` derives on Rust types.
- `Option<T>` in Rust maps to `T | null` in TypeScript, not `T | undefined`.

### 3. Command Panics

**Symptom**: Frontend gets a generic error, app doesn't crash but command fails.

**Cause**: `.unwrap()` or `panic!()` in command handler.

**Fix**: Replace all `.unwrap()` with proper error handling:
```rust
// Bad
let data = serde_yaml::from_str(&content).unwrap();

// Good
let data = serde_yaml::from_str(&content)
    .map_err(|e| format!("Failed to parse YAML: {e}"))?;
```

### 4. Event Not Received

**Symptom**: Rust emits an event but frontend listener never fires.

**Debug**:
```typescript
// Verify the listener is registered
import { listen } from "@tauri-apps/api/event";

const unlisten = await listen("my-event", (event) => {
    console.log("Received:", event.payload);
});
```

**Common causes**:
- Event name mismatch (Rust uses `"my-event"`, TS listens for `"my_event"`)
- Listener registered after event was emitted (race condition on startup)
- Listener was unregistered (component unmounted)

### 5. Large Payload Performance

**Symptom**: IPC calls are slow with large threat models.

**Cause**: Serialization/deserialization overhead for large JSON payloads.

**Fix**:
- Only send the data you need (don't send the full model for every command)
- Use incremental updates (send diffs, not full state)
- Profile with `console.time("invoke")` / `console.timeEnd("invoke")`

## Debugging Tools

### Browser DevTools

Open the webview DevTools:
- **macOS**: Right-click > Inspect Element, or `Cmd+Option+I`
- **Linux**: Right-click > Inspect Element, or `Ctrl+Shift+I`

Use the Console and Network tabs to inspect IPC calls.

### Rust Logging

Add temporary `println!` or `eprintln!` statements in Rust handlers. Output appears in the terminal running `npm run tauri dev`.

For structured logging:
```rust
eprintln!("[DEBUG] save_threat_model: path={}", path);
```

### Type Checking

Run TypeScript type checking to catch interface mismatches early:
```bash
npx tsc --noEmit
```

## Adding a New Command

1. **Create the handler** in `src-tauri/src/commands/`:
```rust
#[tauri::command]
pub fn my_command(arg1: String, arg2: i32) -> Result<MyResponse, String> {
    // implementation
    Ok(MyResponse { ... })
}
```

2. **Export from commands module** in `src-tauri/src/commands/mod.rs`

3. **Register in lib.rs**: Add to `invoke_handler` and import

4. **Call from frontend**:
```typescript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<MyResponse>("my_command", {
    arg1: "hello",
    arg2: 42,
});
```

5. **Test**: Write unit tests for the Rust handler, mock `invoke` in frontend tests

## Architecture Rules

- All commands return `Result<T, String>` — never panic
- Keep command handlers thin — delegate to domain functions
- Frontend is untrusted — validate all input on the Rust side
- Never expose file system paths directly — use Tauri's path resolver
- API keys never cross the IPC boundary in plaintext

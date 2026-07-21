//! Guard: the system prompt lives only in TypeScript.
//!
//! Issue #61 step 5 deleted `src-tauri/src/ai/prompt.rs` and moved prompt
//! ownership entirely to `src/lib/ai-prompt.ts`. This test fails if a second
//! prompt builder or the fenced-action protocol text reappears anywhere under
//! `src-tauri/src`, which would reintroduce the drift the deletion removed.
//!
//! The fenced needle is assembled at runtime rather than written literally so
//! that `rg` for the fence over `src-tauri/` — the plan's manual guard — stays
//! clean of this test file itself.

use std::fs;
use std::path::{Path, PathBuf};

/// Collect every `.rs` file under `dir`, recursively.
fn rust_sources(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let entries = fs::read_dir(dir).expect("src directory should be readable");
    for entry in entries {
        let path = entry.expect("dir entry should be readable").path();
        if path.is_dir() {
            files.extend(rust_sources(&path));
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            files.push(path);
        }
    }
    files
}

#[test]
fn no_rust_system_prompt_or_fenced_actions_remain() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let fenced_actions = format!("{}actions", "`".repeat(3));

    let sources = rust_sources(&src);
    assert!(
        !sources.is_empty(),
        "expected to scan Rust sources under {}",
        src.display()
    );

    for file in sources {
        let contents = fs::read_to_string(&file)
            .unwrap_or_else(|e| panic!("failed to read {}: {e}", file.display()));

        assert!(
            !contents.contains("build_system_prompt"),
            "{} still defines or calls build_system_prompt; the prompt lives only in TypeScript",
            file.display()
        );
        assert!(
            !contents.contains(&fenced_actions),
            "{} still carries fenced-action prompt text; that protocol is described only in TypeScript",
            file.display()
        );
    }
}

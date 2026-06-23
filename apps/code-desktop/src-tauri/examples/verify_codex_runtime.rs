#![allow(dead_code)]

#[path = "../src/runtime_readiness.rs"]
mod runtime_readiness;

use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
};

use walkdir::WalkDir;

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn main() {
    let Some(codex) =
        resolve_codex_executable(env::var_os("PATH").as_deref(), env::var_os("HOME").as_deref())
    else {
        eprintln!(
            "Codex executable was not found. Install the Codex CLI, add it to PATH, or install the OpenAI Codex editor extension."
        );
        std::process::exit(1);
    };
    let runtime = tokio::runtime::Runtime::new().expect("Tokio runtime should start");
    if let Err(error) = runtime.block_on(runtime_readiness::probe_codex_protocol(&codex)) {
        eprintln!("{error}");
        std::process::exit(1);
    }
    println!("Codex app-server protocol is compatible.");
}

fn resolve_codex_executable(path: Option<&OsStr>, home: Option<&OsStr>) -> Option<PathBuf> {
    if let Some(path) = path {
        for directory in env::split_paths(path) {
            let candidate = directory.join("codex");
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }

    let home = home.map(PathBuf::from)?;
    for relative in [".local/bin/codex", ".bun/bin/codex"] {
        let candidate = home.join(relative);
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }

    let mut candidates = Vec::new();
    for relative in [
        ".cursor/extensions",
        ".vscode/extensions",
        ".vscode-insiders/extensions",
    ] {
        let root = home.join(relative);
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(root)
            .min_depth(1)
            .max_depth(6)
            .into_iter()
            .filter_map(Result::ok)
        {
            let candidate = entry.path();
            if candidate.file_name() == Some(OsStr::new("codex"))
                && candidate.components().any(|component| {
                    component
                        .as_os_str()
                        .to_string_lossy()
                        .starts_with("openai.chatgpt-")
                })
                && is_executable(candidate)
            {
                candidates.push(candidate.to_path_buf());
            }
        }
    }
    candidates.sort();
    candidates.pop()
}

fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

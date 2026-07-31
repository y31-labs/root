use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use tokio::process::Command;
use walkdir::WalkDir;

pub(super) fn executable() -> Result<PathBuf, String> {
    resolve_executable(
        env::var_os("PATH").as_deref(),
        env::var_os("HOME").as_deref(),
    )
    .ok_or_else(|| {
        "Codex was not found. Install the Codex CLI or the OpenAI Codex editor extension."
            .to_string()
    })
}

fn resolve_executable(path: Option<&OsStr>, home: Option<&OsStr>) -> Option<PathBuf> {
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
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

pub(super) async fn command_text(program: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .await
        .map_err(display_error)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.trim().is_empty() {
        return Ok(stdout.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[cfg(target_os = "macos")]
pub(super) fn open_url(url: &str) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(display_error)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(super) fn open_url(_url: &str) -> Result<(), String> {
    Err("Open the Codex login from macOS.".to_string())
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

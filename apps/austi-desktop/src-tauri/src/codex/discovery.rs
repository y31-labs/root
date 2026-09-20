use std::{
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use tokio::process::Command;
use walkdir::WalkDir;

pub(super) fn executable() -> Result<PathBuf, String> {
    resolve_executable_with_system_candidates(
        env::var_os("PATH").as_deref(),
        env::var_os("HOME").as_deref(),
        &system_candidates(),
    )
    .ok_or_else(|| {
        "Codex was not found. Install the Codex CLI, Codex app, or OpenAI Codex editor extension."
            .to_string()
    })
}

fn resolve_executable_with_system_candidates(
    path: Option<&OsStr>,
    home: Option<&OsStr>,
    system_candidates: &[PathBuf],
) -> Option<PathBuf> {
    if let Some(path) = path {
        for directory in env::split_paths(path) {
            let candidate = directory.join("codex");
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }

    let home = home.map(PathBuf::from);
    if let Some(home) = &home {
        for relative in [
            "Applications/Codex.app/Contents/Resources/codex",
            "Applications/ChatGPT.app/Contents/Resources/codex",
            ".codex/bin/codex",
            ".local/bin/codex",
            ".bun/bin/codex",
            ".npm-global/bin/codex",
            ".volta/bin/codex",
            "Library/pnpm/codex",
        ] {
            let candidate = home.join(relative);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }

    if let Some(candidate) = system_candidates
        .iter()
        .find(|candidate| is_executable(candidate))
    {
        return Some(candidate.clone());
    }

    if let Some(home) = home {
        let extension = newest_executable(
            [
                ".cursor/extensions",
                ".vscode/extensions",
                ".vscode-insiders/extensions",
                ".windsurf/extensions",
                ".vscode-oss/extensions",
            ]
            .into_iter()
            .map(|relative| home.join(relative)),
            6,
            true,
        );
        if extension.is_some() {
            return extension;
        }

        let package_manager = newest_executable(
            [
                ".nvm/versions/node",
                ".local/share/fnm/node-versions",
                ".asdf/installs/nodejs",
                ".mise/installs/node",
            ]
            .into_iter()
            .map(|relative| home.join(relative)),
            4,
            false,
        );
        if package_manager.is_some() {
            return package_manager;
        }
    }
    None
}

fn newest_executable(
    roots: impl Iterator<Item = PathBuf>,
    max_depth: usize,
    require_extension_component: bool,
) -> Option<PathBuf> {
    roots
        .filter(|root| root.is_dir())
        .flat_map(|root| {
            WalkDir::new(root)
                .min_depth(1)
                .max_depth(max_depth)
                .into_iter()
                .filter_map(Result::ok)
        })
        .map(|entry| entry.into_path())
        .filter(|candidate| {
            candidate.file_name() == Some(OsStr::new("codex"))
                && (!require_extension_component
                    || candidate.components().any(|component| {
                        component
                            .as_os_str()
                            .to_string_lossy()
                            .starts_with("openai.chatgpt-")
                    }))
                && is_executable(candidate)
        })
        .max_by_key(|candidate| {
            candidate
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(UNIX_EPOCH)
        })
}

fn system_candidates() -> Vec<PathBuf> {
    [
        "/Applications/Codex.app/Contents/Resources/codex",
        "/Applications/ChatGPT.app/Contents/Resources/codex",
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn discovers_gui_and_version_manager_installations() {
        let home = temporary_directory();
        let codex = home.join(".nvm/versions/node/v24.1.0/bin/codex");
        make_executable(&codex);

        assert_eq!(
            resolve_executable_with_system_candidates(
                Some(OsStr::new("")),
                Some(home.as_os_str()),
                &[]
            ),
            Some(codex)
        );
        std::fs::remove_dir_all(home).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn discovers_codex_app_system_bundle() {
        let root = temporary_directory();
        let codex = root.join("Codex.app/Contents/Resources/codex");
        make_executable(&codex);

        assert_eq!(
            resolve_executable_with_system_candidates(None, None, std::slice::from_ref(&codex)),
            Some(codex)
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    fn make_executable(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "").unwrap();
        let mut permissions = std::fs::metadata(path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions).unwrap();
    }

    fn temporary_directory() -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("austi-discovery-test-{unique}"))
    }
}

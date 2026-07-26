use std::path::Path;

use serde_json::{json, Value};

use super::super::{
    session::request,
    types::{ModelSettings, ModelSpeed, PermissionMode},
};
use crate::AppState;

const CHAT_INSTRUCTIONS: &str = r#"You are the text assistant inside y31, an application for exploring and shaping internal tools and workflows.

Respond directly to the user's request in clear plain text. You may use tools to inspect and, when the active permission setting allows it, modify the selected working folder. Respect approval decisions and keep the response focused and useful."#;

pub(crate) fn turn_start_params(
    thread_id: &str,
    input: Vec<Value>,
    cwd: &str,
    settings: Option<ModelSettings>,
    permission_mode: PermissionMode,
) -> Value {
    let mut params = json!({
        "threadId": thread_id,
        "input": input,
        "cwd": cwd,
        "runtimeWorkspaceRoots": [cwd],
        "approvalPolicy": permission_mode.approval_policy(),
        "approvalsReviewer": "user",
        "summary": "auto"
    });
    if let Some(settings) = settings {
        params["model"] = json!(settings.model);
        params["effort"] = json!(settings.effort);
        params["serviceTier"] = match settings.speed {
            ModelSpeed::Standard => Value::Null,
            ModelSpeed::Fast => json!("priority"),
        };
    }
    params
}

pub(crate) fn resolve_working_directory(
    working_directory: Option<&str>,
    fallback: &Path,
) -> Result<String, String> {
    let directory = working_directory.map(Path::new).unwrap_or(fallback);
    if !directory.is_absolute() {
        return Err("Select an absolute working folder.".to_string());
    }
    let canonical = directory
        .canonicalize()
        .map_err(|_| "The selected working folder is unavailable.".to_string())?;
    if !canonical.is_dir() {
        return Err("The selected working folder is not a directory.".to_string());
    }
    Ok(canonical.to_string_lossy().into_owned())
}

pub(super) async fn open_thread(
    state: &AppState,
    thread_id: Option<String>,
    cwd: &str,
    permission_mode: PermissionMode,
) -> Result<String, String> {
    let response = match thread_id {
        Some(thread_id) => {
            request(
                state,
                "thread/resume",
                json!({
                    "threadId": thread_id,
                    "cwd": cwd,
                    "runtimeWorkspaceRoots": [cwd],
                    "approvalPolicy": permission_mode.approval_policy(),
                    "approvalsReviewer": "user",
                    "sandbox": permission_mode.sandbox()
                }),
            )
            .await?
        }
        None => {
            request(
                state,
                "thread/start",
                json!({
                    "cwd": cwd,
                    "runtimeWorkspaceRoots": [cwd],
                    "approvalPolicy": permission_mode.approval_policy(),
                    "approvalsReviewer": "user",
                    "sandbox": permission_mode.sandbox(),
                    "developerInstructions": CHAT_INSTRUCTIONS,
                    "serviceName": "y31-desktop"
                }),
            )
            .await?
        }
    };
    response
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Codex did not return a thread id".to_string())
}

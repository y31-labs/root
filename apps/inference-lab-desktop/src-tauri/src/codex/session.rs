use serde_json::{json, Value};
use tokio::sync::broadcast;

use super::client::CodexClient;
use crate::AppState;

pub(super) async fn require_chatgpt_account(state: &AppState) -> Result<(), String> {
    let response = request(state, "account/read", json!({})).await?;
    if response.pointer("/account/type").and_then(Value::as_str) == Some("chatgpt") {
        return Ok(());
    }
    Err("Connect Codex with ChatGPT in Settings before sending a message.".to_string())
}

pub(super) async fn request(
    state: &AppState,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let mut guard = state.codex.lock().await;
    if guard.is_none() {
        *guard = Some(CodexClient::start().await?);
    }
    let client = guard.as_mut().expect("Codex client initialized");
    match client.request(method, params).await {
        Ok(value) => Ok(value),
        Err(error) => {
            tracing::warn!(method, error = %error, "Codex request failed");
            tracing::warn!(
                target: crate::logging::EXTERNAL_EVENT_TARGET,
                event = "codex_request_failed",
                method
            );
            if error_requires_restart(&error) {
                *guard = None;
            }
            Err(error)
        }
    }
}

pub(super) async fn notifications(state: &AppState) -> Result<broadcast::Receiver<Value>, String> {
    let mut guard = state.codex.lock().await;
    if guard.is_none() {
        *guard = Some(CodexClient::start().await?);
    }
    Ok(guard
        .as_ref()
        .expect("Codex client initialized")
        .subscribe())
}

fn error_requires_restart(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    [
        "app-server stopped",
        "broken pipe",
        "channel closed",
        "stdin unavailable",
        "stdout unavailable",
        "timed out",
    ]
    .into_iter()
    .any(|failure| error.contains(failure))
}

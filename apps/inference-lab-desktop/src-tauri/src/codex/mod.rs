mod client;
mod discovery;
mod stream;
mod types;

pub(crate) use client::CodexClient;
use serde_json::{json, Value};
use stream::stream_turn;
use tauri::{ipc::Channel, State};
use tokio::sync::broadcast;
use types::{CodexIntegrationStatus, CodexStreamEvent, CodexTextInput, CodexTextResult};

use crate::AppState;

const CHAT_INSTRUCTIONS: &str = r#"You are the text assistant inside y31, an application for exploring and shaping internal tools and workflows.

Respond directly to the user's request in clear plain text. For now, provide text only: do not create HTML, do not modify files, do not run commands, and do not invoke tools. Keep the response focused and useful."#;

#[tauri::command]
pub(crate) async fn codex_integration_status(
    state: State<'_, AppState>,
) -> Result<CodexIntegrationStatus, String> {
    let executable = match discovery::executable() {
        Ok(executable) => executable,
        Err(error) => {
            return Ok(CodexIntegrationStatus {
                installed: false,
                authenticated: false,
                app_server_available: false,
                connected: false,
                version: None,
                account_email: None,
                plan_type: None,
                detail: Some(error),
            });
        }
    };
    let version = discovery::command_text(&executable, &["--version"])
        .await
        .ok();
    let account = match request(&state, "account/read", json!({})).await {
        Ok(response) => response.get("account").cloned().unwrap_or(Value::Null),
        Err(error) => {
            tracing::warn!(error = %error, "Codex integration status request failed");
            return Ok(CodexIntegrationStatus {
                installed: true,
                authenticated: false,
                app_server_available: false,
                connected: false,
                version,
                account_email: None,
                plan_type: None,
                detail: Some(format!("Codex app-server is unavailable: {error}")),
            });
        }
    };
    let account_type = account.get("type").and_then(Value::as_str);
    let authenticated = account_type == Some("chatgpt");
    let detail = match account_type {
        Some("chatgpt") => None,
        Some("apiKey") => Some(
            "Codex is using an API key. Connect with ChatGPT to use your Codex plan.".to_string(),
        ),
        _ => Some("Connect Codex with ChatGPT to start a local text session.".to_string()),
    };

    Ok(CodexIntegrationStatus {
        installed: true,
        authenticated,
        app_server_available: true,
        connected: authenticated,
        version,
        account_email: account
            .get("email")
            .and_then(Value::as_str)
            .map(str::to_string),
        plan_type: account
            .get("planType")
            .and_then(Value::as_str)
            .map(str::to_string),
        detail,
    })
}

#[tauri::command]
pub(crate) async fn connect_codex(state: State<'_, AppState>) -> Result<(), String> {
    let response = request(&state, "account/login/start", json!({ "type": "chatgpt" })).await?;
    let auth_url = response
        .get("authUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex did not return a ChatGPT sign-in URL".to_string())?;
    discovery::open_url(auth_url)?;
    tracing::info!(
        target: crate::logging::EXTERNAL_EVENT_TARGET,
        event = "codex_login_started"
    );
    Ok(())
}

#[tauri::command]
pub(crate) async fn stream_codex_text(
    state: State<'_, AppState>,
    input: CodexTextInput,
    on_event: Channel<CodexStreamEvent>,
) -> Result<CodexTextResult, String> {
    let prompt = input.prompt.trim();
    if prompt.is_empty() {
        return Err("Enter a message before starting Codex.".to_string());
    }
    if prompt.chars().count() > 20_000 {
        return Err("The message is too long. Keep it under 20,000 characters.".to_string());
    }

    require_chatgpt_account(&state).await?;
    let mut notifications = notifications(&state).await?;
    let cwd = state.data_dir.to_string_lossy().to_string();
    let resumed = input.thread_id.is_some();
    let thread_id = open_thread(&state, input.thread_id, &cwd).await?;
    on_event
        .send(CodexStreamEvent::Started {
            thread_id: thread_id.clone(),
        })
        .map_err(display_error)?;

    let response = request(
        &state,
        "turn/start",
        json!({
            "threadId": thread_id,
            "input": [{ "type": "text", "text": prompt }],
            "cwd": cwd,
            "approvalPolicy": "never"
        }),
    )
    .await?;
    let turn_id = response
        .pointer("/turn/id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Codex did not return a turn id".to_string())?;
    tracing::info!(
        target: crate::logging::EXTERNAL_EVENT_TARGET,
        event = "codex_turn_started",
        resumed
    );

    if let Err(error) =
        stream_turn(&state, &mut notifications, &thread_id, &turn_id, &on_event).await
    {
        tracing::warn!(error = %error, "Codex turn failed");
        tracing::warn!(
            target: crate::logging::EXTERNAL_EVENT_TARGET,
            event = "codex_turn_failed"
        );
        return Err(error);
    }

    tracing::info!(
        target: crate::logging::EXTERNAL_EVENT_TARGET,
        event = "codex_turn_completed"
    );
    Ok(CodexTextResult { thread_id })
}

async fn open_thread(
    state: &AppState,
    thread_id: Option<String>,
    cwd: &str,
) -> Result<String, String> {
    let response = match thread_id {
        Some(thread_id) => {
            request(
                state,
                "thread/resume",
                json!({
                    "threadId": thread_id,
                    "cwd": cwd,
                    "approvalPolicy": "never",
                    "sandbox": "read-only"
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
                    "approvalPolicy": "never",
                    "sandbox": "read-only",
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

async fn require_chatgpt_account(state: &AppState) -> Result<(), String> {
    let response = request(state, "account/read", json!({})).await?;
    if response.pointer("/account/type").and_then(Value::as_str) == Some("chatgpt") {
        return Ok(());
    }
    Err("Connect Codex with ChatGPT in Settings before sending a message.".to_string())
}

async fn request(state: &AppState, method: &str, params: Value) -> Result<Value, String> {
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

async fn notifications(state: &AppState) -> Result<broadcast::Receiver<Value>, String> {
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

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

mod client;
mod discovery;
mod stream;
mod types;

pub(crate) use client::CodexClient;
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde_json::{json, Value};
use stream::stream_turn;
use tauri::{ipc::Channel, State};
use tokio::sync::broadcast;
use types::{
    CodexAttachmentInput, CodexIntegrationStatus, CodexStreamEvent, CodexTextInput, CodexTextResult,
};

use crate::AppState;

const CHAT_INSTRUCTIONS: &str = r#"You are the text assistant inside y31, an application for exploring and shaping internal tools and workflows.

Respond directly to the user's request in clear plain text. For now, provide text only and do not create HTML or modify files. You may use read-only tools to inspect the selected working folder and files explicitly attached by the user. Keep the response focused and useful."#;
const MAX_ATTACHMENTS: usize = 4;
const MAX_ATTACHMENT_DATA_URL_LENGTH: usize = 14_000_000;

struct PreparedTurnInput {
    input: Vec<Value>,
    attachment_dir: Option<PathBuf>,
}

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
    if prompt.is_empty() && input.attachments.is_empty() {
        return Err("Enter a message or attach a file before starting Codex.".to_string());
    }
    if prompt.chars().count() > 20_000 {
        return Err("The message is too long. Keep it under 20,000 characters.".to_string());
    }
    validate_attachments(&input.attachments)?;

    require_chatgpt_account(&state).await?;
    let mut notifications = notifications(&state).await?;
    let cwd = resolve_working_directory(input.working_directory.as_deref(), &state.data_dir)?;
    let resumed = input.thread_id.is_some();
    let thread_id = open_thread(&state, input.thread_id, &cwd).await?;
    let PreparedTurnInput {
        input: turn_input,
        attachment_dir,
    } = prepare_turn_input(prompt, &input.attachments, &state.data_dir)?;
    if let Err(error) = on_event
        .send(CodexStreamEvent::Started {
            thread_id: thread_id.clone(),
        })
        .map_err(display_error)
    {
        cleanup_attachment_dir(attachment_dir.as_deref());
        return Err(error);
    }

    let turn_id = match request(
        &state,
        "turn/start",
        json!({
            "threadId": thread_id,
            "input": turn_input,
            "cwd": cwd,
            "approvalPolicy": "never"
        }),
    )
    .await
    .and_then(|response| {
        response
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "Codex did not return a turn id".to_string())
    }) {
        Ok(turn_id) => turn_id,
        Err(error) => {
            cleanup_attachment_dir(attachment_dir.as_deref());
            return Err(error);
        }
    };
    tracing::info!(
        target: crate::logging::EXTERNAL_EVENT_TARGET,
        event = "codex_turn_started",
        resumed
    );

    let stream_result =
        stream_turn(&state, &mut notifications, &thread_id, &turn_id, &on_event).await;
    cleanup_attachment_dir(attachment_dir.as_deref());
    if let Err(error) = stream_result {
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

fn validate_attachments(attachments: &[CodexAttachmentInput]) -> Result<(), String> {
    if attachments.len() > MAX_ATTACHMENTS {
        return Err(format!("Attach no more than {MAX_ATTACHMENTS} files."));
    }

    for attachment in attachments {
        if attachment.data_url.len() > MAX_ATTACHMENT_DATA_URL_LENGTH {
            return Err("Each attachment must be 10 MB or smaller.".to_string());
        }
        let prefix = format!("data:{};base64,", attachment.media_type);
        if !attachment.data_url.starts_with(&prefix) {
            return Err("An attachment has an invalid data URL.".to_string());
        }
    }
    Ok(())
}

fn resolve_working_directory(
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

fn prepare_turn_input(
    prompt: &str,
    attachments: &[CodexAttachmentInput],
    data_dir: &Path,
) -> Result<PreparedTurnInput, String> {
    validate_attachments(attachments)?;
    let mut turn_input =
        Vec::with_capacity(usize::from(!prompt.is_empty()) + attachments.len() + 1);
    if !prompt.is_empty() {
        turn_input.push(json!({ "type": "text", "text": prompt }));
    }

    let mut decoded_files = Vec::new();
    for attachment in attachments {
        if supports_image_input(&attachment.media_type) {
            turn_input.push(json!({ "type": "image", "url": attachment.data_url }));
            continue;
        }
        if attachment.media_type.starts_with("audio/") {
            turn_input.push(json!({ "type": "audio", "url": attachment.data_url }));
            continue;
        }

        let prefix = format!("data:{};base64,", attachment.media_type);
        let encoded = attachment
            .data_url
            .strip_prefix(&prefix)
            .ok_or_else(|| "An attachment has an invalid data URL.".to_string())?;
        let bytes = BASE64
            .decode(encoded)
            .map_err(|_| "An attachment could not be decoded.".to_string())?;
        decoded_files.push((sanitize_filename(&attachment.filename), bytes));
    }

    if decoded_files.is_empty() {
        return Ok(PreparedTurnInput {
            input: turn_input,
            attachment_dir: None,
        });
    }

    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(display_error)?
        .as_nanos();
    let attachment_dir = data_dir
        .join("attachments")
        .join(format!("{}-{unique}", std::process::id()));
    std::fs::create_dir_all(&attachment_dir).map_err(display_error)?;

    let write_result = decoded_files
        .into_iter()
        .enumerate()
        .map(|(index, (filename, bytes))| {
            let path = attachment_dir.join(format!("{index}-{filename}"));
            std::fs::write(&path, bytes).map_err(display_error)?;
            Ok(path)
        })
        .collect::<Result<Vec<_>, String>>();
    let paths = match write_result {
        Ok(paths) => paths,
        Err(error) => {
            cleanup_attachment_dir(Some(&attachment_dir));
            return Err(error);
        }
    };
    let attached_files = paths
        .iter()
        .map(|path| format!("- {}", path.display()))
        .collect::<Vec<_>>()
        .join("\n");
    turn_input.push(json!({
        "type": "text",
        "text": format!("Files attached by the user:\n{attached_files}")
    }));

    Ok(PreparedTurnInput {
        input: turn_input,
        attachment_dir: Some(attachment_dir),
    })
}

fn supports_image_input(media_type: &str) -> bool {
    matches!(
        media_type,
        "image/gif" | "image/jpeg" | "image/png" | "image/webp"
    )
}

fn sanitize_filename(filename: &str) -> String {
    let sanitized = filename
        .chars()
        .take(120)
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.trim_matches('.').is_empty() {
        "attachment".to_string()
    } else {
        sanitized
    }
}

fn cleanup_attachment_dir(attachment_dir: Option<&Path>) {
    let Some(attachment_dir) = attachment_dir else {
        return;
    };
    if let Err(error) = std::fs::remove_dir_all(attachment_dir) {
        tracing::warn!(path = %attachment_dir.display(), error = %error, "failed to clean up attachments");
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn attachment(filename: &str, media_type: &str, data_url: &str) -> CodexAttachmentInput {
        CodexAttachmentInput {
            data_url: data_url.to_string(),
            filename: filename.to_string(),
            media_type: media_type.to_string(),
        }
    }

    #[test]
    fn builds_multimodal_turn_input() {
        let prepared = prepare_turn_input(
            "Match this layout",
            &[attachment(
                "layout.png",
                "image/png",
                "data:image/png;base64,aW1hZ2U=",
            )],
            Path::new("unused"),
        )
        .unwrap();

        assert_eq!(
            prepared.input,
            vec![
                json!({ "type": "text", "text": "Match this layout" }),
                json!({ "type": "image", "url": "data:image/png;base64,aW1hZ2U=" }),
            ]
        );
    }

    #[test]
    fn supports_image_only_turns() {
        assert_eq!(
            prepare_turn_input(
                "",
                &[attachment(
                    "reference.jpg",
                    "image/jpeg",
                    "data:image/jpeg;base64,aW1hZ2U="
                )],
                Path::new("unused")
            )
            .unwrap()
            .input,
            vec![json!({
                "type": "image",
                "url": "data:image/jpeg;base64,aW1hZ2U="
            })]
        );
    }

    #[test]
    fn stages_non_image_files_for_analysis() {
        let test_dir = std::env::temp_dir().join(format!(
            "y31-attachment-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let prepared = prepare_turn_input(
            "Summarize this file",
            &[attachment(
                "brief.pdf",
                "application/pdf",
                "data:application/pdf;base64,ZmlsZQ==",
            )],
            &test_dir,
        )
        .unwrap();
        let attachment_dir = prepared.attachment_dir.as_ref().unwrap();
        let staged_file = std::fs::read_dir(attachment_dir)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();

        assert_eq!(std::fs::read(&staged_file).unwrap(), b"file");
        assert!(prepared.input[1]["text"]
            .as_str()
            .unwrap()
            .contains(staged_file.to_string_lossy().as_ref()));

        cleanup_attachment_dir(Some(attachment_dir));
        let _ = std::fs::remove_dir_all(test_dir);
    }

    #[test]
    fn rejects_invalid_attachment_data_urls() {
        let result = validate_attachments(&[attachment(
            "brief.pdf",
            "application/pdf",
            "https://example.com/brief.pdf",
        )]);

        assert_eq!(
            result,
            Err("An attachment has an invalid data URL.".to_string())
        );
    }

    #[test]
    fn resolves_an_absolute_working_directory() {
        let current_dir = std::env::current_dir().unwrap();

        assert_eq!(
            resolve_working_directory(current_dir.to_str(), &current_dir).unwrap(),
            current_dir.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn rejects_a_relative_working_directory() {
        let current_dir = std::env::current_dir().unwrap();

        assert_eq!(
            resolve_working_directory(Some("relative/project"), &current_dir),
            Err("Select an absolute working folder.".to_string())
        );
    }
}

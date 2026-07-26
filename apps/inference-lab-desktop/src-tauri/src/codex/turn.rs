mod config;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use super::{
    attachments::{
        cleanup_attachment_dir, prepare_turn_input, validate_attachments, PreparedTurnInput,
    },
    runs::CodexRunOutcome,
    session::{notifications, request, require_chatgpt_account},
    stream::stream_turn,
    types::{CodexRunInfo, CodexStreamEvent, CodexTextInput, CodexTextResult},
};
use crate::AppState;

use config::open_thread;
pub(super) use config::{resolve_working_directory, turn_start_params};

#[tauri::command]
pub(crate) async fn start_codex_text(
    app: AppHandle,
    state: State<'_, AppState>,
    input: CodexTextInput,
) -> Result<CodexRunInfo, String> {
    if input.chat_id.trim().is_empty() || input.assistant_message_id.trim().is_empty() {
        return Err("Codex received an invalid chat identity.".to_string());
    }
    let prompt = input.prompt.trim();
    if prompt.is_empty() && input.attachments.is_empty() {
        return Err("Enter a message or attach a file before starting Codex.".to_string());
    }
    if prompt.chars().count() > 20_000 {
        return Err("The message is too long. Keep it under 20,000 characters.".to_string());
    }
    if input.permission_mode.requires_working_directory() && input.working_directory.is_none() {
        return Err("Select a working folder before granting write access.".to_string());
    }
    validate_attachments(&input.attachments)?;

    require_chatgpt_account(&state).await?;
    let mut notifications = notifications(&state).await?;
    let cwd = resolve_working_directory(input.working_directory.as_deref(), &state.data_dir)?;
    let resumed = input.thread_id.is_some();
    let thread_id = open_thread(&state, input.thread_id, &cwd, input.permission_mode).await?;
    let PreparedTurnInput {
        input: turn_input,
        attachment_dir,
    } = prepare_turn_input(prompt, &input.attachments, &state.data_dir)?;
    let turn_params = turn_start_params(
        &thread_id,
        turn_input,
        &cwd,
        input.settings.clone(),
        input.permission_mode,
    );

    let turn_id = match request(&state, "turn/start", turn_params)
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
    let run_info = CodexRunInfo {
        run_id: format!("{thread_id}:{turn_id}"),
        chat_id: input.chat_id,
        thread_id: thread_id.clone(),
        turn_id: turn_id.clone(),
        assistant_message_id: input.assistant_message_id,
        model: input.settings.map(|settings| settings.model),
    };
    let run = match state.codex_runs.insert(run_info.clone()) {
        Ok(run) => run,
        Err(error) => {
            let _ = interrupt_turn(&state, &thread_id, &turn_id).await;
            cleanup_attachment_dir(attachment_dir.as_deref());
            return Err(error);
        }
    };
    if let Err(error) = run.record(CodexStreamEvent::Started {
        thread_id: thread_id.clone(),
        turn_id: turn_id.clone(),
    }) {
        let _ = interrupt_turn(&state, &thread_id, &turn_id).await;
        let _ = run.finish(CodexRunOutcome::Failed(error.clone()));
        let _ = state.codex_runs.finish(&run_info.run_id);
        cleanup_attachment_dir(attachment_dir.as_deref());
        return Err(error);
    }
    tracing::info!(
        target: crate::logging::EXTERNAL_EVENT_TARGET,
        event = "codex_turn_started",
        resumed
    );

    let run_id = run_info.run_id.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let stream_result =
            stream_turn(&state, &mut notifications, &thread_id, &turn_id, &|event| {
                run.record(event)
            })
            .await;
        cleanup_attachment_dir(attachment_dir.as_deref());
        match stream_result {
            Ok(()) => {
                tracing::info!(
                    target: crate::logging::EXTERNAL_EVENT_TARGET,
                    event = "codex_turn_completed"
                );
                let _ = run.finish(CodexRunOutcome::Completed(CodexTextResult { thread_id }));
            }
            Err(error) => {
                tracing::warn!(error = %error, "Codex turn failed");
                tracing::warn!(
                    target: crate::logging::EXTERNAL_EVENT_TARGET,
                    event = "codex_turn_failed"
                );
                let _ = run.finish(CodexRunOutcome::Failed(error));
            }
        }
        if let Err(error) = state.codex_runs.finish(&run_id) {
            tracing::warn!(error = %error, "failed to finish Codex run state");
        }
    });

    Ok(run_info)
}

pub(super) async fn interrupt_turn(
    state: &AppState,
    thread_id: &str,
    turn_id: &str,
) -> Result<(), String> {
    request(
        state,
        "turn/interrupt",
        json!({ "threadId": thread_id, "turnId": turn_id }),
    )
    .await
    .map(|_| ())
}

#[cfg(test)]
mod tests;

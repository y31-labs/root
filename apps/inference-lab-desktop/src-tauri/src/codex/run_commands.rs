use serde_json::{json, Value};
use tauri::{ipc::Channel, State};
use tokio::sync::broadcast;

use super::{
    runs::CodexRunOutcome,
    turn::interrupt_turn,
    types::{CodexApprovalDecision, CodexRunStatus, CodexStreamEvent, CodexTextResult},
};
use crate::AppState;

#[tauri::command]
pub(crate) fn get_codex_run(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Option<CodexRunStatus>, String> {
    state
        .codex_runs
        .get_for_chat(&chat_id)?
        .map(|run| {
            Ok(CodexRunStatus {
                info: run.info.clone(),
                active: run.is_active(),
            })
        })
        .transpose()
}

#[tauri::command]
pub(crate) async fn stream_codex_run(
    state: State<'_, AppState>,
    run_id: String,
    on_event: Channel<CodexStreamEvent>,
) -> Result<CodexTextResult, String> {
    let run = state
        .codex_runs
        .get(&run_id)?
        .ok_or_else(|| "The Codex run is no longer available.".to_string())?;
    let (events, mut update_receiver) = run.subscribe()?;
    let mut last_sequence = None;

    for event in events {
        on_event.send(event.event).map_err(display_error)?;
        last_sequence = Some(event.sequence);
    }
    if let Some(outcome) = run.outcome()? {
        return outcome_result(outcome);
    }

    loop {
        match update_receiver.recv().await {
            Ok(()) | Err(broadcast::error::RecvError::Lagged(_)) => {
                for event in run.events_after(last_sequence)? {
                    on_event.send(event.event).map_err(display_error)?;
                    last_sequence = Some(event.sequence);
                }
                if let Some(outcome) = run.outcome()? {
                    return outcome_result(outcome);
                }
            }
            Err(broadcast::error::RecvError::Closed) => {
                return Err("The Codex run event stream closed.".to_string());
            }
        }
    }
}

#[tauri::command]
pub(crate) async fn interrupt_codex_turn(
    state: State<'_, AppState>,
    thread_id: String,
    turn_id: String,
) -> Result<(), String> {
    interrupt_turn(&state, &thread_id, &turn_id).await
}

#[tauri::command]
pub(crate) async fn resolve_codex_approval(
    state: State<'_, AppState>,
    request_id: Value,
    method: String,
    decision: CodexApprovalDecision,
) -> Result<(), String> {
    if !request_id.is_string() && !request_id.is_i64() && !request_id.is_u64() {
        return Err("Codex returned an invalid approval request id".to_string());
    }
    let result = approval_result(&method, decision)?;
    let mut guard = state.codex.lock().await;
    let client = guard
        .as_mut()
        .ok_or_else(|| "The Codex session is no longer available".to_string())?;
    if let Err(error) = client.respond(request_id, result).await {
        *guard = None;
        return Err(error);
    }
    Ok(())
}

fn outcome_result(outcome: CodexRunOutcome) -> Result<CodexTextResult, String> {
    match outcome {
        CodexRunOutcome::Completed(result) => Ok(result),
        CodexRunOutcome::Failed(error) => Err(error),
    }
}

fn approval_result(method: &str, decision: CodexApprovalDecision) -> Result<Value, String> {
    match method {
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
            Ok(json!({ "decision": decision }))
        }
        _ => Err(format!("Unsupported approval request: {method}")),
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_supported_approval_responses() {
        assert_eq!(
            approval_result(
                "item/commandExecution/requestApproval",
                CodexApprovalDecision::AcceptForSession,
            )
            .unwrap(),
            json!({ "decision": "acceptForSession" })
        );
        assert_eq!(
            approval_result(
                "item/fileChange/requestApproval",
                CodexApprovalDecision::Decline,
            )
            .unwrap(),
            json!({ "decision": "decline" })
        );
    }
}

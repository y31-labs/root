mod activity;
mod protocol;

use std::time::Duration;

use serde_json::{json, Value};
use tauri::ipc::Channel;
use tokio::{sync::broadcast, time::timeout};

use self::{
    activity::{activity_delta_event, activity_event},
    protocol::{
        agent_message_delta, approval_event, completed_turn, final_agent_message,
        reasoning_summary_delta,
    },
};
use super::{request, types::CodexStreamEvent};
use crate::AppState;

const TURN_TIMEOUT: Duration = Duration::from_secs(300);

pub(super) async fn stream_turn(
    state: &AppState,
    notifications: &mut broadcast::Receiver<Value>,
    thread_id: &str,
    turn_id: &str,
    on_event: &Channel<CodexStreamEvent>,
) -> Result<(), String> {
    let stream_result = timeout(TURN_TIMEOUT, async {
        let mut streamed_text = false;
        loop {
            let message = notifications.recv().await.map_err(|error| match error {
                broadcast::error::RecvError::Closed => "Codex app-server stopped".to_string(),
                broadcast::error::RecvError::Lagged(_) => {
                    "Codex produced updates faster than y31 could consume them".to_string()
                }
            })?;
            if message.get("method").and_then(Value::as_str) == Some("server/stopped") {
                return Err("Codex app-server stopped".to_string());
            }
            if let Some(approval) = approval_event(&message, thread_id, turn_id) {
                on_event.send(approval).map_err(display_error)?;
                continue;
            }
            if let Some((item_id, delta)) = agent_message_delta(&message, thread_id, turn_id) {
                streamed_text = true;
                on_event
                    .send(CodexStreamEvent::MessageDelta {
                        id: item_id.to_string(),
                        text: delta.to_string(),
                    })
                    .map_err(display_error)?;
                continue;
            }
            if let Some((item_id, summary_index, delta)) =
                reasoning_summary_delta(&message, thread_id, turn_id)
            {
                on_event
                    .send(CodexStreamEvent::ReasoningDelta {
                        id: item_id.to_string(),
                        summary_index,
                        text: delta.to_string(),
                    })
                    .map_err(display_error)?;
                continue;
            }
            if let Some(activity) = activity_event(&message, thread_id, turn_id) {
                on_event.send(activity).map_err(display_error)?;
                continue;
            }
            if let Some(activity_delta) = activity_delta_event(&message, thread_id, turn_id) {
                on_event.send(activity_delta).map_err(display_error)?;
                continue;
            }
            let Some(turn) = completed_turn(&message, thread_id, turn_id) else {
                continue;
            };
            match turn.get("status").and_then(Value::as_str) {
                Some("completed") => {
                    if !streamed_text {
                        if let Some((id, text)) = final_agent_message(turn) {
                            on_event
                                .send(CodexStreamEvent::MessageDelta { id, text })
                                .map_err(display_error)?;
                        }
                    }
                    on_event
                        .send(CodexStreamEvent::Completed)
                        .map_err(display_error)?;
                    return Ok(());
                }
                Some("interrupted") => return Err("Codex stopped the response.".to_string()),
                Some("failed") => {
                    return Err(turn
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("Codex could not complete the response")
                        .to_string());
                }
                _ => continue,
            }
        }
    })
    .await;

    match stream_result {
        Ok(result) => result,
        Err(_) => {
            let _ = request(
                state,
                "turn/interrupt",
                json!({ "threadId": thread_id, "turnId": turn_id }),
            )
            .await;
            Err("Codex response timed out after five minutes.".to_string())
        }
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

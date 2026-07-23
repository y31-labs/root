use std::time::Duration;

use serde_json::{json, Value};
use tauri::ipc::Channel;
use tokio::{sync::broadcast, time::timeout};

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
        let mut last_item_id: Option<String> = None;
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
                if streamed_text && last_item_id.as_deref() != Some(item_id) {
                    on_event
                        .send(CodexStreamEvent::Delta {
                            text: "\n\n".to_string(),
                        })
                        .map_err(display_error)?;
                }
                streamed_text = true;
                last_item_id = Some(item_id.to_string());
                on_event
                    .send(CodexStreamEvent::Delta {
                        text: delta.to_string(),
                    })
                    .map_err(display_error)?;
                continue;
            }
            let Some(turn) = completed_turn(&message, thread_id, turn_id) else {
                continue;
            };
            match turn.get("status").and_then(Value::as_str) {
                Some("completed") => {
                    if !streamed_text {
                        if let Some(text) = final_agent_message(turn) {
                            on_event
                                .send(CodexStreamEvent::Delta { text })
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

fn approval_event(message: &Value, thread_id: &str, turn_id: &str) -> Option<CodexStreamEvent> {
    let method = message.get("method")?.as_str()?;
    let title = match method {
        "item/commandExecution/requestApproval" => "Allow command?",
        "item/fileChange/requestApproval" => "Allow file changes?",
        _ => return None,
    };
    if message.pointer("/params/threadId").and_then(Value::as_str) != Some(thread_id)
        || message.pointer("/params/turnId").and_then(Value::as_str) != Some(turn_id)
    {
        return None;
    }
    let request_id = message.get("id")?;
    if !request_id.is_string() && !request_id.is_i64() && !request_id.is_u64() {
        return None;
    }

    Some(CodexStreamEvent::Approval {
        request_id: request_id.clone(),
        method: method.to_string(),
        title: title.to_string(),
        detail: approval_detail(message, method),
    })
}

fn approval_detail(message: &Value, method: &str) -> Option<String> {
    let params = message.get("params")?;
    let reason = params.get("reason").and_then(Value::as_str);
    let primary = match method {
        "item/commandExecution/requestApproval" => params.get("command").and_then(Value::as_str),
        "item/fileChange/requestApproval" => params.get("grantRoot").and_then(Value::as_str),
        _ => None,
    };

    match (primary, reason) {
        (Some(primary), Some(reason)) if primary != reason => {
            Some(format!("{primary}\n\nReason: {reason}"))
        }
        (Some(primary), _) => Some(primary.to_string()),
        (None, Some(reason)) => Some(reason.to_string()),
        (None, None) => None,
    }
}

fn agent_message_delta<'a>(
    message: &'a Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<(&'a str, &'a str)> {
    if message.get("method").and_then(Value::as_str) != Some("item/agentMessage/delta")
        || message.pointer("/params/threadId").and_then(Value::as_str) != Some(thread_id)
        || message.pointer("/params/turnId").and_then(Value::as_str) != Some(turn_id)
    {
        return None;
    }
    Some((
        message.pointer("/params/itemId").and_then(Value::as_str)?,
        message.pointer("/params/delta").and_then(Value::as_str)?,
    ))
}

fn completed_turn<'a>(message: &'a Value, thread_id: &str, turn_id: &str) -> Option<&'a Value> {
    if message.get("method").and_then(Value::as_str) != Some("turn/completed")
        || message.pointer("/params/threadId").and_then(Value::as_str) != Some(thread_id)
        || message.pointer("/params/turn/id").and_then(Value::as_str) != Some(turn_id)
    {
        return None;
    }
    message.pointer("/params/turn")
}

fn final_agent_message(turn: &Value) -> Option<String> {
    turn.get("items")?
        .as_array()?
        .iter()
        .rev()
        .find(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))?
        .get("text")?
        .as_str()
        .map(str::to_string)
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_only_the_matching_agent_delta() {
        let message = json!({
            "method": "item/agentMessage/delta",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "item-1",
                "delta": "Hello"
            }
        });

        assert_eq!(
            agent_message_delta(&message, "thread-1", "turn-1"),
            Some(("item-1", "Hello"))
        );
        assert_eq!(agent_message_delta(&message, "thread-2", "turn-1"), None);
    }

    #[test]
    fn reads_the_final_agent_message_from_a_completed_turn() {
        let turn = json!({
            "items": [
                { "type": "userMessage", "text": "Hi" },
                { "type": "agentMessage", "text": "First" },
                { "type": "agentMessage", "text": "Final" }
            ]
        });

        assert_eq!(final_agent_message(&turn).as_deref(), Some("Final"));
    }

    #[test]
    fn stream_events_use_the_frontend_contract() {
        assert_eq!(
            serde_json::to_value(CodexStreamEvent::Started {
                thread_id: "thread-1".to_string()
            })
            .unwrap(),
            json!({ "type": "started", "threadId": "thread-1" })
        );
        assert_eq!(
            serde_json::to_value(CodexStreamEvent::Delta {
                text: "Hello".to_string()
            })
            .unwrap(),
            json!({ "type": "delta", "text": "Hello" })
        );
    }

    #[test]
    fn maps_matching_approval_requests_to_stream_events() {
        let message = json!({
            "id": 42,
            "method": "item/commandExecution/requestApproval",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "item-1",
                "command": "bun test",
                "reason": "Run the project tests"
            }
        });

        let event = approval_event(&message, "thread-1", "turn-1").unwrap();
        assert_eq!(
            serde_json::to_value(event).unwrap(),
            json!({
                "type": "approval",
                "requestId": 42,
                "method": "item/commandExecution/requestApproval",
                "title": "Allow command?",
                "detail": "bun test\n\nReason: Run the project tests"
            })
        );
        assert!(approval_event(&message, "thread-2", "turn-1").is_none());
    }
}

use serde_json::Value;

use super::super::types::CodexStreamEvent;

pub(super) fn approval_event(
    message: &Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<CodexStreamEvent> {
    let method = message.get("method")?.as_str()?;
    let title = match method {
        "item/commandExecution/requestApproval" => "Allow command?",
        "item/fileChange/requestApproval" => "Allow file changes?",
        _ => return None,
    };
    if !matches_turn(message, thread_id, turn_id) {
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

pub(super) fn agent_message_delta<'a>(
    message: &'a Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<(&'a str, &'a str)> {
    if message.get("method").and_then(Value::as_str) != Some("item/agentMessage/delta")
        || !matches_turn(message, thread_id, turn_id)
    {
        return None;
    }
    Some((
        message.pointer("/params/itemId").and_then(Value::as_str)?,
        message.pointer("/params/delta").and_then(Value::as_str)?,
    ))
}

pub(super) fn reasoning_summary_delta<'a>(
    message: &'a Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<(&'a str, usize, &'a str)> {
    if message.get("method").and_then(Value::as_str) != Some("item/reasoning/summaryTextDelta")
        || !matches_turn(message, thread_id, turn_id)
    {
        return None;
    }
    Some((
        message.pointer("/params/itemId").and_then(Value::as_str)?,
        usize::try_from(
            message
                .pointer("/params/summaryIndex")
                .and_then(Value::as_u64)?,
        )
        .ok()?,
        message.pointer("/params/delta").and_then(Value::as_str)?,
    ))
}

pub(super) fn completed_turn<'a>(
    message: &'a Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<&'a Value> {
    if message.get("method").and_then(Value::as_str) != Some("turn/completed")
        || message.pointer("/params/threadId").and_then(Value::as_str) != Some(thread_id)
        || message.pointer("/params/turn/id").and_then(Value::as_str) != Some(turn_id)
    {
        return None;
    }
    message.pointer("/params/turn")
}

pub(super) fn final_agent_message(turn: &Value) -> Option<(String, String)> {
    let item = turn
        .get("items")?
        .as_array()?
        .iter()
        .rev()
        .find(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))?;
    Some((
        item.get("id")?.as_str()?.to_string(),
        item.get("text")?.as_str()?.to_string(),
    ))
}

pub(super) fn matches_turn(message: &Value, thread_id: &str, turn_id: &str) -> bool {
    message.pointer("/params/threadId").and_then(Value::as_str) == Some(thread_id)
        && message.pointer("/params/turnId").and_then(Value::as_str) == Some(turn_id)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

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
    fn extracts_only_the_matching_reasoning_summary_delta() {
        let message = json!({
            "method": "item/reasoning/summaryTextDelta",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "reasoning-1",
                "delta": "Checking the implementation",
                "summaryIndex": 1
            }
        });

        assert_eq!(
            reasoning_summary_delta(&message, "thread-1", "turn-1"),
            Some(("reasoning-1", 1, "Checking the implementation"))
        );
        assert_eq!(
            reasoning_summary_delta(&message, "thread-2", "turn-1"),
            None
        );
    }

    #[test]
    fn reads_the_final_agent_message_from_a_completed_turn() {
        let turn = json!({
            "items": [
                { "type": "userMessage", "text": "Hi" },
                { "type": "agentMessage", "id": "message-1", "text": "First" },
                { "type": "agentMessage", "id": "message-2", "text": "Final" }
            ]
        });

        assert_eq!(
            final_agent_message(&turn),
            Some(("message-2".to_string(), "Final".to_string()))
        );
    }

    #[test]
    fn extracts_only_the_requested_completed_turn() {
        let message = json!({
            "method": "turn/completed",
            "params": {
                "threadId": "thread-1",
                "turn": { "id": "turn-1", "status": "completed" }
            }
        });

        assert_eq!(
            completed_turn(&message, "thread-1", "turn-1")
                .and_then(|turn| turn.get("status"))
                .and_then(Value::as_str),
            Some("completed")
        );
        assert!(completed_turn(&message, "thread-2", "turn-1").is_none());
        assert!(completed_turn(&message, "thread-1", "turn-2").is_none());
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

        let mut invalid_id = message;
        invalid_id["id"] = json!({ "unsupported": true });
        assert!(approval_event(&invalid_id, "thread-1", "turn-1").is_none());
    }
}

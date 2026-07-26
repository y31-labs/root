mod detail;
mod item;
mod label;

use serde_json::Value;

use self::{detail::bounded_detail, item::item_activity};
use super::super::types::{CodexActivityKind, CodexActivityStatus, CodexStreamEvent};
use super::protocol::matches_turn;

pub(super) fn activity_event(
    message: &Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<CodexStreamEvent> {
    if !matches_turn(message, thread_id, turn_id) {
        return None;
    }

    match message.get("method")?.as_str()? {
        "item/started" => item_activity(message.pointer("/params/item")?, turn_id, false),
        "item/completed" => item_activity(message.pointer("/params/item")?, turn_id, true),
        "turn/plan/updated" => plan_activity(message, turn_id),
        "error" => error_activity(message, turn_id),
        _ => None,
    }
}

pub(super) fn activity_delta_event(
    message: &Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<CodexStreamEvent> {
    if !matches_turn(message, thread_id, turn_id) {
        return None;
    }

    let method = message.get("method")?.as_str()?;
    let id = match method {
        "item/plan/delta" => format!("plan-{turn_id}"),
        "item/mcpToolCall/progress" => message.pointer("/params/itemId")?.as_str()?.to_string(),
        _ => return None,
    };
    let delta = bounded_detail(
        match method {
            "item/mcpToolCall/progress" => {
                format!("{}\n", message.pointer("/params/message")?.as_str()?)
            }
            _ => message.pointer("/params/delta")?.as_str()?.to_string(),
        }
        .as_str(),
    );
    Some(CodexStreamEvent::ActivityDelta { id, delta })
}

fn plan_activity(message: &Value, turn_id: &str) -> Option<CodexStreamEvent> {
    let params = message.get("params")?;
    let plan = params.get("plan")?.as_array()?;
    let mut lines = Vec::new();
    if let Some(explanation) = params
        .get("explanation")
        .and_then(Value::as_str)
        .filter(|explanation| !explanation.is_empty())
    {
        lines.push(explanation.to_string());
    }
    lines.extend(plan.iter().filter_map(|step| {
        let text = step.get("step")?.as_str()?;
        let status = step
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("pending");
        Some(format!("[{status}] {text}"))
    }));
    let completed = !plan.is_empty()
        && plan
            .iter()
            .all(|step| step.get("status").and_then(Value::as_str) == Some("completed"));
    Some(CodexStreamEvent::Activity {
        id: format!("plan-{turn_id}"),
        kind: CodexActivityKind::Plan,
        label: "Plan".to_string(),
        detail: (!lines.is_empty()).then(|| bounded_detail(&lines.join("\n"))),
        items: None,
        status: if completed {
            CodexActivityStatus::Succeeded
        } else {
            CodexActivityStatus::Running
        },
    })
}

fn error_activity(message: &Value, turn_id: &str) -> Option<CodexStreamEvent> {
    let error = message.pointer("/params/error")?;
    let error_message = error.get("message")?.as_str()?;
    let will_retry = message
        .pointer("/params/willRetry")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if will_retry {
        return None;
    }
    Some(CodexStreamEvent::Activity {
        id: format!("error-{turn_id}"),
        kind: CodexActivityKind::Error,
        label: error_message.to_string(),
        detail: error
            .get("additionalDetails")
            .and_then(Value::as_str)
            .filter(|detail| !detail.is_empty())
            .map(bounded_detail),
        items: None,
        status: CodexActivityStatus::Failed,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn routes_item_lifecycle_notifications() {
        let started = json!({
            "method": "item/started",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "item": {
                    "type": "commandExecution",
                    "id": "command-1",
                    "command": "bun test"
                }
            }
        });
        let completed = json!({
            "method": "item/completed",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "item": {
                    "type": "commandExecution",
                    "id": "command-1",
                    "command": "bun test"
                }
            }
        });

        let started =
            serde_json::to_value(activity_event(&started, "thread-1", "turn-1").unwrap()).unwrap();
        let completed =
            serde_json::to_value(activity_event(&completed, "thread-1", "turn-1").unwrap())
                .unwrap();
        assert_eq!(started["status"], "running");
        assert_eq!(started["label"], "Running command");
        assert_eq!(completed["status"], "succeeded");
        assert_eq!(completed["label"], "Ran command");
    }

    #[test]
    fn maps_activity_deltas_for_tools_and_plans() {
        let progress = json!({
            "method": "item/mcpToolCall/progress",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "tool-1",
                "message": "Reading records"
            }
        });
        assert_eq!(
            serde_json::to_value(activity_delta_event(&progress, "thread-1", "turn-1").unwrap())
                .unwrap(),
            json!({
                "type": "activityDelta",
                "id": "tool-1",
                "delta": "Reading records\n"
            })
        );

        let plan_delta = json!({
            "method": "item/plan/delta",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "delta": "Inspect the code"
            }
        });
        assert_eq!(
            serde_json::to_value(activity_delta_event(&plan_delta, "thread-1", "turn-1").unwrap())
                .unwrap(),
            json!({
                "type": "activityDelta",
                "id": "plan-turn-1",
                "delta": "Inspect the code"
            })
        );

        let mut other_turn = progress.clone();
        other_turn["params"]["turnId"] = json!("turn-2");
        assert!(activity_delta_event(&other_turn, "thread-1", "turn-1").is_none());
    }

    #[test]
    fn ignores_unsupported_activity_deltas() {
        let command_output = json!({
            "method": "item/commandExecution/outputDelta",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "command-1",
                "delta": "Compiling\n"
            }
        });

        assert!(activity_delta_event(&command_output, "thread-1", "turn-1").is_none());
    }

    #[test]
    fn maps_plan_and_non_retrying_error_updates() {
        let plan = json!({
            "method": "turn/plan/updated",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "explanation": "Implementation plan",
                "plan": [
                    { "step": "Inspect", "status": "completed" },
                    { "step": "Implement", "status": "inProgress" }
                ]
            }
        });
        assert_eq!(
            serde_json::to_value(activity_event(&plan, "thread-1", "turn-1").unwrap()).unwrap(),
            json!({
                "type": "activity",
                "id": "plan-turn-1",
                "kind": "plan",
                "label": "Plan",
                "detail": "Implementation plan\n[completed] Inspect\n[inProgress] Implement",
                "status": "running"
            })
        );

        let error = json!({
            "method": "error",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "error": {
                    "message": "Connection lost",
                    "additionalDetails": "Socket closed"
                },
                "willRetry": false
            }
        });
        assert_eq!(
            serde_json::to_value(activity_event(&error, "thread-1", "turn-1").unwrap()).unwrap(),
            json!({
                "type": "activity",
                "id": "error-turn-1",
                "kind": "error",
                "label": "Connection lost",
                "detail": "Socket closed",
                "status": "failed"
            })
        );
        assert!(activity_event(&error, "thread-2", "turn-1").is_none());

        let mut retrying = error;
        retrying["params"]["willRetry"] = json!(true);
        assert!(activity_event(&retrying, "thread-1", "turn-1").is_none());
    }

    #[test]
    fn marks_a_fully_completed_plan_as_succeeded() {
        let plan = json!({
            "method": "turn/plan/updated",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "plan": [
                    { "step": "Inspect", "status": "completed" },
                    { "step": "Implement", "status": "completed" }
                ]
            }
        });

        let event =
            serde_json::to_value(activity_event(&plan, "thread-1", "turn-1").unwrap()).unwrap();
        assert_eq!(event["status"], "succeeded");
    }
}

use serde_json::Value;

use super::super::super::types::{CodexActivityKind, CodexActivityStatus, CodexStreamEvent};
use super::detail::{
    bounded_detail, command_detail, display_path, file_change_items, format_duration_ms,
    pretty_json, tool_detail,
};

pub(super) fn item_activity(
    item: &Value,
    turn_id: &str,
    completed: bool,
) -> Option<CodexStreamEvent> {
    let item_type = item.get("type")?.as_str()?;
    let item_id = item.get("id")?.as_str()?;
    let id = if item_type == "plan" {
        format!("plan-{turn_id}")
    } else {
        item_id.to_string()
    };
    let status = item_activity_status(item, completed);
    let items = match item_type {
        "fileChange" => file_change_items(item, item_id, completed),
        _ => None,
    };

    let (kind, label, detail) = match item_type {
        "plan" => (
            CodexActivityKind::Plan,
            "Plan".to_string(),
            item.get("text").and_then(Value::as_str).map(bounded_detail),
        ),
        "commandExecution" => (
            CodexActivityKind::Command,
            phase_label(completed, "Ran command", "Running command"),
            command_detail(item),
        ),
        "fileChange" => (
            CodexActivityKind::File,
            file_change_label(item, completed),
            None,
        ),
        "mcpToolCall" => {
            let (kind, label) = tool_activity(item, "server", completed);
            (
                kind,
                label,
                tool_detail(item, "arguments", &["result", "error"]),
            )
        }
        "dynamicToolCall" => {
            let (kind, label) = tool_activity(item, "namespace", completed);
            (
                kind,
                label,
                tool_detail(item, "arguments", &["contentItems"]),
            )
        }
        "collabToolCall" | "collabAgentToolCall" => (
            CodexActivityKind::Agent,
            collab_tool_label(item, completed),
            item.get("prompt")
                .and_then(Value::as_str)
                .map(bounded_detail),
        ),
        "subAgentActivity" => (
            CodexActivityKind::Agent,
            format!(
                "Agent {}: {}",
                item.get("kind")
                    .and_then(Value::as_str)
                    .unwrap_or("activity"),
                item.get("agentPath")
                    .and_then(Value::as_str)
                    .unwrap_or("subagent")
            ),
            None,
        ),
        "webSearch" => (
            CodexActivityKind::Web,
            format!(
                "{} the web for {}",
                if completed { "Searched" } else { "Searching" },
                item.get("query").and_then(Value::as_str).unwrap_or("query")
            ),
            pretty_json(item.get("results")),
        ),
        "imageView" => (
            CodexActivityKind::Image,
            format!(
                "{} {}",
                if completed { "Viewed" } else { "Viewing" },
                item.get("path")
                    .and_then(Value::as_str)
                    .map(display_path)
                    .unwrap_or_else(|| "image".to_string())
            ),
            None,
        ),
        "imageGeneration" => (
            CodexActivityKind::Image,
            if completed {
                "Generated an image"
            } else {
                "Generating an image"
            }
            .to_string(),
            item.get("revisedPrompt")
                .and_then(Value::as_str)
                .map(bounded_detail),
        ),
        "sleep" => (
            CodexActivityKind::Wait,
            format!(
                "{} {}",
                if completed { "Waited" } else { "Waiting" },
                format_duration_ms(item.get("durationMs").and_then(Value::as_u64).unwrap_or(0))
            ),
            None,
        ),
        "enteredReviewMode" => (
            CodexActivityKind::Tool,
            "Enter review mode".to_string(),
            item.get("review")
                .and_then(Value::as_str)
                .map(bounded_detail),
        ),
        "exitedReviewMode" => (
            CodexActivityKind::Tool,
            "Exit review mode".to_string(),
            item.get("review")
                .and_then(Value::as_str)
                .map(bounded_detail),
        ),
        "contextCompaction" => (CodexActivityKind::Tool, "Compact context".to_string(), None),
        _ => return None,
    };

    Some(CodexStreamEvent::Activity {
        id,
        kind,
        label,
        detail,
        items,
        status,
    })
}

fn item_activity_status(item: &Value, completed: bool) -> CodexActivityStatus {
    if item
        .get("exitCode")
        .and_then(Value::as_i64)
        .is_some_and(|code| code != 0)
        || item.get("success").and_then(Value::as_bool) == Some(false)
        || item.get("error").is_some_and(|error| !error.is_null())
    {
        return CodexActivityStatus::Failed;
    }
    match item.get("status").and_then(Value::as_str) {
        Some("failed" | "declined" | "errored") => CodexActivityStatus::Failed,
        Some("completed" | "succeeded") => CodexActivityStatus::Succeeded,
        _ if completed => CodexActivityStatus::Succeeded,
        _ => CodexActivityStatus::Running,
    }
}

fn tool_activity(
    item: &Value,
    namespace_key: &str,
    completed: bool,
) -> (CodexActivityKind, String) {
    let name = item
        .pointer("/appContext/appName")
        .and_then(Value::as_str)
        .or_else(|| item.get(namespace_key).and_then(Value::as_str))
        .filter(|name| !name.trim().is_empty());
    let target = name
        .map(|name| format!(" {name} tool"))
        .unwrap_or_else(|| " tool".to_string());
    (
        CodexActivityKind::Tool,
        phase_label(
            completed,
            &format!("Used{target}"),
            &format!("Using{target}"),
        ),
    )
}

fn phase_label(completed: bool, completed_label: &str, running_label: &str) -> String {
    if completed {
        completed_label
    } else {
        running_label
    }
    .to_string()
}

fn file_change_label(item: &Value, completed: bool) -> String {
    let changes = item.get("changes").and_then(Value::as_array);
    match changes {
        Some(changes) if changes.len() == 1 => {
            let change = &changes[0];
            let action = match (change.get("kind").and_then(Value::as_str), completed) {
                (Some("add"), true) => "Added",
                (Some("add"), false) => "Adding",
                (Some("delete"), true) => "Deleted",
                (Some("delete"), false) => "Deleting",
                (_, true) => "Updated",
                (_, false) => "Updating",
            };
            format!(
                "{action} {}",
                change
                    .get("path")
                    .and_then(Value::as_str)
                    .map(display_path)
                    .unwrap_or_else(|| "file".to_string())
            )
        }
        Some(changes) if !changes.is_empty() => format!(
            "{} {} files",
            if completed { "Updated" } else { "Updating" },
            changes.len()
        ),
        _ => phase_label(completed, "Updated files", "Updating files"),
    }
}

fn collab_tool_label(item: &Value, completed: bool) -> String {
    match (item.get("tool").and_then(Value::as_str), completed) {
        (Some("spawnAgent" | "spawn_agent"), true) => "Spawned an agent",
        (Some("spawnAgent" | "spawn_agent"), false) => "Spawning an agent",
        (Some("sendInput" | "send_input"), true) => "Messaged an agent",
        (Some("sendInput" | "send_input"), false) => "Messaging an agent",
        (Some("resumeAgent" | "resume_agent"), true) => "Resumed an agent",
        (Some("resumeAgent" | "resume_agent"), false) => "Resuming an agent",
        (Some("wait"), true) => "Waited for an agent",
        (Some("wait"), false) => "Waiting for an agent",
        (Some("closeAgent" | "close_agent"), true) => "Closed an agent",
        (Some("closeAgent" | "close_agent"), false) => "Closing an agent",
        (_, true) => "Used an agent tool",
        (_, false) => "Using an agent tool",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn maps_command_file_and_tool_lifecycle_items() {
        let command_started = json!({
            "type": "commandExecution",
            "id": "command-1",
            "command": "bun test",
            "status": "inProgress",
            "aggregatedOutput": null,
            "exitCode": null
        });
        assert_eq!(
            serde_json::to_value(item_activity(&command_started, "turn-1", false).unwrap())
                .unwrap(),
            json!({
                "type": "activity",
                "id": "command-1",
                "kind": "command",
                "label": "Running command",
                "detail": "Command\nbun test",
                "status": "running"
            })
        );

        let command_completed = json!({
            "type": "commandExecution",
            "id": "command-1",
            "command": "bun test",
            "status": "failed",
            "aggregatedOutput": "1 test failed",
            "exitCode": 1
        });
        assert_eq!(
            serde_json::to_value(item_activity(&command_completed, "turn-1", true).unwrap())
                .unwrap(),
            json!({
                "type": "activity",
                "id": "command-1",
                "kind": "command",
                "label": "Ran command",
                "detail": "Command\nbun test\n\nOutput\n1 test failed",
                "status": "failed"
            })
        );

        let file_completed = json!({
            "type": "fileChange",
            "id": "file-1",
            "changes": [
                {
                    "path": "src/app.tsx",
                    "kind": "update",
                    "diff": "--- a/src/app.tsx\n+++ b/src/app.tsx\n@@ -1 +1,2 @@\n-old\n+new\n+added\n"
                },
                {
                    "path": "src/app.test.tsx",
                    "kind": "add",
                    "diff": "@@ -0,0 +1 @@\n+test\n"
                }
            ],
            "status": "completed"
        });
        assert_eq!(
            serde_json::to_value(item_activity(&file_completed, "turn-1", true).unwrap()).unwrap(),
            json!({
                "type": "activity",
                "id": "file-1",
                "kind": "file",
                "label": "Updated 2 files",
                "items": [
                    {
                        "id": "file-1-change-0",
                        "label": "Edited app.tsx +2 -1",
                        "detail": "--- a/src/app.tsx\n+++ b/src/app.tsx\n@@ -1 +1,2 @@\n-old\n+new\n+added\n"
                    },
                    {
                        "id": "file-1-change-1",
                        "label": "Created app.test.tsx +1 -0",
                        "detail": "@@ -0,0 +1 @@\n+test\n"
                    }
                ],
                "status": "succeeded"
            })
        );

        let tool_completed = json!({
            "type": "mcpToolCall",
            "id": "tool-1",
            "server": "database",
            "tool": "query",
            "arguments": { "table": "users" },
            "status": "completed",
            "result": { "content": [{ "type": "text", "text": "3 rows" }] },
            "error": null
        });
        let tool =
            serde_json::to_value(item_activity(&tool_completed, "turn-1", true).unwrap()).unwrap();
        assert_eq!(tool["kind"], "tool");
        assert_eq!(tool["label"], "Used database tool");
        assert_eq!(tool["status"], "succeeded");
        assert!(tool["detail"].as_str().unwrap().contains("3 rows"));
    }

    #[test]
    fn uses_truthful_generic_command_and_connector_labels() {
        let read = json!({
            "type": "commandExecution",
            "id": "read-1",
            "command": "sed -n '1,240p' /tmp/codex-manual.md",
            "status": "completed"
        });
        let search = json!({
            "type": "commandExecution",
            "id": "search-1",
            "command": "rg -n -i 'activity|tool call' src",
            "status": "completed"
        });
        let connector = json!({
            "type": "mcpToolCall",
            "id": "tool-1",
            "server": "github",
            "tool": "_update_issue",
            "appContext": {
                "appName": "GitHub",
                "actionName": "update_issue"
            },
            "status": "completed"
        });

        let read = serde_json::to_value(item_activity(&read, "turn-1", true).unwrap()).unwrap();
        let search = serde_json::to_value(item_activity(&search, "turn-1", true).unwrap()).unwrap();
        let connector =
            serde_json::to_value(item_activity(&connector, "turn-1", true).unwrap()).unwrap();

        assert_eq!(read["kind"], "command");
        assert_eq!(read["label"], "Ran command");
        assert!(read["detail"].as_str().unwrap().contains("sed -n"));
        assert_eq!(search["kind"], "command");
        assert_eq!(search["label"], "Ran command");
        assert!(search["detail"].as_str().unwrap().contains("rg -n"));
        assert_eq!(connector["kind"], "tool");
        assert_eq!(connector["label"], "Used GitHub tool");
    }

    #[test]
    fn maps_supported_non_command_activity_items() {
        let cases = [
            (
                json!({
                    "type": "collabToolCall",
                    "id": "agent-1",
                    "tool": "spawnAgent",
                    "prompt": "Inspect tests"
                }),
                "agent",
                "Spawned an agent",
            ),
            (
                json!({
                    "type": "webSearch",
                    "id": "web-1",
                    "query": "Rust modules"
                }),
                "web",
                "Searched the web for Rust modules",
            ),
            (
                json!({
                    "type": "imageView",
                    "id": "image-1",
                    "path": "/tmp/screenshot.png"
                }),
                "image",
                "Viewed screenshot.png",
            ),
            (
                json!({
                    "type": "sleep",
                    "id": "sleep-1",
                    "durationMs": 65_000
                }),
                "wait",
                "Waited 1m 5s",
            ),
        ];

        for (item, expected_kind, expected_label) in cases {
            let event =
                serde_json::to_value(item_activity(&item, "turn-1", true).unwrap()).unwrap();
            assert_eq!(event["kind"], expected_kind);
            assert_eq!(event["label"], expected_label);
            assert_eq!(event["status"], "succeeded");
        }
    }

    #[test]
    fn rejects_unknown_item_types_and_honors_explicit_failures() {
        let unknown = json!({ "type": "futureItem", "id": "unknown-1" });
        assert!(item_activity(&unknown, "turn-1", true).is_none());

        for item in [
            json!({
                "type": "mcpToolCall",
                "id": "tool-1",
                "error": "failed"
            }),
            json!({
                "type": "dynamicToolCall",
                "id": "tool-2",
                "success": false
            }),
            json!({
                "type": "commandExecution",
                "id": "command-1",
                "exitCode": 1
            }),
        ] {
            let event =
                serde_json::to_value(item_activity(&item, "turn-1", true).unwrap()).unwrap();
            assert_eq!(event["status"], "failed");
        }
    }
}

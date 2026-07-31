use serde_json::Value;

use super::super::super::types::{CodexActivityKind, CodexActivityStatus};
use super::detail::display_path;

pub(super) fn item_activity_status(item: &Value, completed: bool) -> CodexActivityStatus {
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

pub(super) fn tool_activity(
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

pub(super) fn phase_label(completed: bool, completed_label: &str, running_label: &str) -> String {
    if completed {
        completed_label
    } else {
        running_label
    }
    .to_string()
}

pub(super) fn file_change_label(item: &Value, completed: bool) -> String {
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

pub(super) fn collab_tool_label(item: &Value, completed: bool) -> String {
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

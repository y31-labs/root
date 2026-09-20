use serde_json::json;

use super::*;

mod attachments;
mod persistence;
mod recovery;

fn temporary_directory(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "y31-chat-history-{}-{name}-{unique}",
        std::process::id()
    ))
}

fn chat(id: &str, title: &str, updated_at_ms: u64) -> ChatRecord {
    ChatRecord {
        id: id.to_string(),
        title: title.to_string(),
        created_at_ms: 10,
        updated_at_ms,
        archived_at_ms: None,
        codex_thread_id: Some(format!("thread-{id}")),
        working_directory: Some("/workspace/project".to_string()),
        messages: json!([{ "id": "message-1", "role": "user", "text": title }]),
    }
}

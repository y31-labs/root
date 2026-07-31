use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::attachment_data::attachment_storage_keys;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatRecord {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) created_at_ms: u64,
    pub(super) updated_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) archived_at_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) codex_thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) working_directory: Option<String>,
    pub(super) messages: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatSummary {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) created_at_ms: u64,
    pub(super) updated_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatSaveResult {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) created_at_ms: u64,
    pub(super) updated_at_ms: u64,
    pub(super) attachment_storage_keys: HashMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatHistoryStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) warning: Option<String>,
}

impl From<&ChatRecord> for ChatSummary {
    fn from(chat: &ChatRecord) -> Self {
        Self {
            id: chat.id.clone(),
            title: chat.title.clone(),
            created_at_ms: chat.created_at_ms,
            updated_at_ms: chat.updated_at_ms,
        }
    }
}

impl From<&ChatRecord> for ChatSaveResult {
    fn from(chat: &ChatRecord) -> Self {
        Self {
            id: chat.id.clone(),
            title: chat.title.clone(),
            created_at_ms: chat.created_at_ms,
            updated_at_ms: chat.updated_at_ms,
            attachment_storage_keys: attachment_storage_keys(&chat.messages),
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChatHistoryFile {
    pub(super) version: u32,
    pub(super) chats: Vec<ChatRecord>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StoredChatFile {
    pub(super) version: u32,
    pub(super) chat: ChatRecord,
}

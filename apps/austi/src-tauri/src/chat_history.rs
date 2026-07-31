mod attachment_data;
mod attachments;
mod loading;
mod store;
mod types;

use std::{
    fs,
    path::{Path, PathBuf},
    sync::MutexGuard,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::State;

pub(crate) use self::store::ChatHistoryStore;
use self::types::{
    ChatHistoryFile, ChatHistoryStatus, ChatRecord, ChatSaveResult, ChatSummary, StoredChatFile,
};
use crate::AppState;

const CHAT_ATTACHMENT_DIRECTORY: &str = "chat-history-attachments";
const CHAT_HISTORY_DIRECTORY: &str = "chat-history";
const CHAT_HISTORY_FILE: &str = "chat-history.json";
const CHAT_HISTORY_VERSION: u32 = 1;

#[tauri::command]
pub(crate) fn archive_chat(state: State<'_, AppState>, chat_id: String) -> Result<(), String> {
    lock_store(&state)?.archive(&chat_id)
}

#[tauri::command]
pub(crate) fn chat_history_status(state: State<'_, AppState>) -> Result<ChatHistoryStatus, String> {
    Ok(ChatHistoryStatus {
        warning: lock_store(&state)?.recovery_warning.clone(),
    })
}

#[tauri::command]
pub(crate) fn list_chats(state: State<'_, AppState>) -> Result<Vec<ChatSummary>, String> {
    Ok(lock_store(&state)?.summaries())
}

#[tauri::command]
pub(crate) fn get_chat(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Option<ChatRecord>, String> {
    lock_store(&state)?.chat(&chat_id)
}

#[tauri::command]
pub(crate) fn save_chat(
    state: State<'_, AppState>,
    chat: ChatRecord,
) -> Result<ChatSaveResult, String> {
    lock_store(&state)?.save(chat)
}

#[tauri::command]
pub(crate) fn rename_chat(
    state: State<'_, AppState>,
    chat_id: String,
    title: String,
) -> Result<(), String> {
    lock_store(&state)?.rename(&chat_id, title)
}

fn lock_store(state: &AppState) -> Result<MutexGuard<'_, ChatHistoryStore>, String> {
    state
        .chat_history
        .lock()
        .map_err(|_| "Chat history is unavailable".to_string())
}

fn validate_chat(chat: &ChatRecord) -> Result<(), String> {
    if chat.id.trim().is_empty() || chat.id.len() > 120 {
        return Err("Chat id is invalid".to_string());
    }
    validate_chat_title(&chat.title)?;
    if chat.updated_at_ms < chat.created_at_ms {
        return Err("Chat timestamps are invalid".to_string());
    }
    if let Some(directory) = &chat.working_directory {
        if directory.len() > 4096 || !Path::new(directory).is_absolute() {
            return Err("Chat working directory is invalid".to_string());
        }
    }
    if !chat.messages.is_array() {
        return Err("Chat messages are invalid".to_string());
    }
    Ok(())
}

fn validate_chat_title(title: &str) -> Result<(), String> {
    if title.trim().is_empty() || title.chars().count() > 200 {
        return Err("Chat title is invalid".to_string());
    }
    Ok(())
}

fn validate_version(version: u32) -> Result<(), String> {
    if version == CHAT_HISTORY_VERSION {
        return Ok(());
    }
    Err(format!("Unsupported chat history version: {version}"))
}

fn current_time_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(display_error)?
        .as_millis()
        .try_into()
        .map_err(display_error)
}

fn archive_file(path: &Path, reason: &str) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(display_error)?
        .as_millis();
    let filename = path
        .file_name()
        .and_then(|filename| filename.to_str())
        .unwrap_or(CHAT_HISTORY_FILE);
    let archive_path = path.with_file_name(format!("{filename}.{reason}-{timestamp}"));
    fs::rename(path, &archive_path).map_err(display_error)?;
    Ok(archive_path)
}

fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, bytes).map_err(display_error)?;
    if let Err(error) = fs::rename(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(display_error(error));
    }
    Ok(())
}

fn remove_files(paths: &[PathBuf]) {
    for path in paths {
        let _ = fs::remove_file(path);
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests;

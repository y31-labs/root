use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::MutexGuard,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{
    engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD},
    Engine,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::State;

use crate::AppState;

const CHAT_ATTACHMENT_DIRECTORY: &str = "chat-history-attachments";
const CHAT_HISTORY_DIRECTORY: &str = "chat-history";
const CHAT_HISTORY_FILE: &str = "chat-history.json";
const CHAT_HISTORY_VERSION: u32 = 1;
const MAX_ATTACHMENT_DATA_URL_LENGTH: usize = 14_000_000;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatRecord {
    id: String,
    title: String,
    created_at_ms: u64,
    updated_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    archived_at_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    codex_thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    working_directory: Option<String>,
    messages: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatSummary {
    id: String,
    title: String,
    created_at_ms: u64,
    updated_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatSaveResult {
    id: String,
    title: String,
    created_at_ms: u64,
    updated_at_ms: u64,
    attachment_storage_keys: HashMap<String, String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatHistoryStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    warning: Option<String>,
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
struct ChatHistoryFile {
    version: u32,
    chats: Vec<ChatRecord>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredChatFile {
    version: u32,
    chat: ChatRecord,
}

pub(crate) struct ChatHistoryStore {
    attachment_directory: PathBuf,
    archived_chat_ids: HashSet<String>,
    chats: Vec<ChatRecord>,
    history_directory: PathBuf,
    legacy_path: PathBuf,
    recovery_warning: Option<String>,
    write_blocker: Option<String>,
}

impl ChatHistoryStore {
    pub(crate) fn load(data_dir: &Path) -> Self {
        let mut store = Self::empty(data_dir);
        let mut warnings = Vec::new();
        let legacy_chats = store.migrate_legacy_history(&mut warnings);
        store.load_chat_records(&mut warnings);
        for chat in legacy_chats {
            store.merge_loaded_chat(chat);
        }
        store.recovery_warning = (!warnings.is_empty()).then(|| warnings.join(" "));
        store
    }

    pub(crate) fn recovery_warning(&self) -> Option<&str> {
        self.recovery_warning.as_deref()
    }

    fn empty(data_dir: &Path) -> Self {
        Self {
            attachment_directory: data_dir.join(CHAT_ATTACHMENT_DIRECTORY),
            archived_chat_ids: HashSet::new(),
            chats: Vec::new(),
            history_directory: data_dir.join(CHAT_HISTORY_DIRECTORY),
            legacy_path: data_dir.join(CHAT_HISTORY_FILE),
            recovery_warning: None,
            write_blocker: None,
        }
    }

    fn migrate_legacy_history(&mut self, warnings: &mut Vec<String>) -> Vec<ChatRecord> {
        if !self.legacy_path.exists() {
            return Vec::new();
        }

        let history = fs::read(&self.legacy_path)
            .map_err(display_error)
            .and_then(|bytes| {
                serde_json::from_slice::<ChatHistoryFile>(&bytes).map_err(display_error)
            })
            .and_then(|history| {
                validate_version(history.version)?;
                for chat in &history.chats {
                    validate_chat(chat)?;
                }
                Ok(history)
            });
        let history = match history {
            Ok(history) => history,
            Err(error) => {
                self.recover_file(&self.legacy_path.clone(), error, warnings);
                return Vec::new();
            }
        };

        let mut chats = Vec::with_capacity(history.chats.len());
        let mut migration_error = None;
        for mut chat in history.chats {
            let result = self.externalize_attachments(&mut chat).and_then(|written| {
                if let Err(error) = self.persist_chat_record(&chat) {
                    remove_files(&written);
                    return Err(error);
                }
                Ok(())
            });
            if let Err(error) = result {
                migration_error = Some(error);
            }
            chats.push(chat);
        }
        if let Some(error) = migration_error {
            let warning = format!("Chat history migration is incomplete ({error}).");
            self.write_blocker = Some(warning.clone());
            warnings.push(warning);
            return chats;
        }

        match fs::remove_file(&self.legacy_path) {
            Ok(()) => warnings.push("Chat history was migrated to per-chat storage.".to_string()),
            Err(error) => {
                let warning =
                    format!("Chat history was migrated but the previous file could not be removed ({error}).");
                self.write_blocker = Some(warning.clone());
                warnings.push(warning);
            }
        }
        chats
    }

    fn load_chat_records(&mut self, warnings: &mut Vec<String>) {
        let entries = match fs::read_dir(&self.history_directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(error) => {
                warnings.push(format!(
                    "Chat history records could not be listed ({error})."
                ));
                return;
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            let stored = fs::read(&path)
                .map_err(display_error)
                .and_then(|bytes| {
                    serde_json::from_slice::<StoredChatFile>(&bytes).map_err(display_error)
                })
                .and_then(|stored| {
                    validate_version(stored.version)?;
                    validate_chat(&stored.chat)?;
                    Ok(stored)
                });
            match stored {
                Ok(stored) if path == self.chat_record_path(&stored.chat.id) => {
                    self.merge_loaded_chat(stored.chat);
                }
                Ok(_) => self.recover_file(
                    &path,
                    "A chat history record filename is invalid".to_string(),
                    warnings,
                ),
                Err(error) => self.recover_file(&path, error, warnings),
            }
        }
    }

    fn recover_file(&mut self, path: &Path, error: String, warnings: &mut Vec<String>) {
        match archive_file(path, "invalid") {
            Ok(quarantine_path) => warnings.push(format!(
                "Chat history could not be loaded ({error}). The invalid file was moved to {}.",
                quarantine_path.display()
            )),
            Err(quarantine_error) => {
                let warning = format!(
                    "Chat history could not be loaded ({error}) and could not be moved aside ({quarantine_error})."
                );
                self.write_blocker = Some(warning.clone());
                warnings.push(warning);
            }
        }
    }

    fn merge_loaded_chat(&mut self, chat: ChatRecord) {
        match self.chats.iter().position(|current| current.id == chat.id) {
            Some(index) if self.chats[index].updated_at_ms < chat.updated_at_ms => {
                self.chats[index] = chat;
            }
            Some(_) => {}
            None => self.chats.push(chat),
        }
    }

    fn summaries(&self) -> Vec<ChatSummary> {
        let mut summaries = self
            .chats
            .iter()
            .filter(|chat| chat.archived_at_ms.is_none())
            .map(ChatSummary::from)
            .collect::<Vec<_>>();
        summaries.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
        summaries
    }

    fn chat(&self, id: &str) -> Result<Option<ChatRecord>, String> {
        let Some(mut chat) = self.chats.iter().find(|chat| chat.id == id).cloned() else {
            return Ok(None);
        };
        self.materialize_attachments(&mut chat)?;
        Ok(Some(chat))
    }

    fn save(&mut self, mut chat: ChatRecord) -> Result<ChatSaveResult, String> {
        self.ensure_writable()?;
        validate_chat(&chat)?;
        if self.archived_chat_ids.contains(&chat.id) {
            return Err("Chat was archived".to_string());
        }
        if let Some(index) = self.chats.iter().position(|current| current.id == chat.id) {
            if self.chats[index].archived_at_ms.is_some() {
                return Err("Chat was archived".to_string());
            }
            if self.chats[index].updated_at_ms > chat.updated_at_ms {
                return Ok(ChatSaveResult::from(&self.chats[index]));
            }
        }

        let written_attachments = self.externalize_attachments(&mut chat)?;
        let result = ChatSaveResult::from(&chat);
        if let Err(error) = self.persist_chat_record(&chat) {
            remove_files(&written_attachments);
            return Err(error);
        }

        match self.chats.iter().position(|current| current.id == chat.id) {
            Some(index) => self.chats[index] = chat,
            None => self.chats.push(chat),
        }
        self.cleanup_unreferenced_attachments(&result.id);
        Ok(result)
    }

    fn rename(&mut self, id: &str, title: String) -> Result<(), String> {
        self.ensure_writable()?;
        validate_chat_title(&title)?;
        let Some(index) = self.chats.iter().position(|chat| chat.id == id) else {
            return Err("Chat was not found".to_string());
        };
        if self.chats[index].archived_at_ms.is_some() {
            return Err("Chat was archived".to_string());
        }
        let mut renamed_chat = self.chats[index].clone();
        renamed_chat.title = title;
        self.persist_chat_record(&renamed_chat)?;
        self.chats[index] = renamed_chat;
        Ok(())
    }

    fn archive(&mut self, id: &str) -> Result<(), String> {
        self.ensure_writable()?;
        let Some(index) = self.chats.iter().position(|chat| chat.id == id) else {
            self.archived_chat_ids.insert(id.to_string());
            return Ok(());
        };
        if self.chats[index].archived_at_ms.is_some() {
            self.archived_chat_ids.insert(id.to_string());
            return Ok(());
        }

        let mut archived_chat = self.chats[index].clone();
        archived_chat.archived_at_ms = Some(current_time_ms()?);
        self.persist_chat_record(&archived_chat)?;
        self.chats[index] = archived_chat;
        self.archived_chat_ids.insert(id.to_string());
        Ok(())
    }

    fn ensure_writable(&self) -> Result<(), String> {
        if let Some(error) = &self.write_blocker {
            return Err(error.clone());
        }
        Ok(())
    }

    fn persist_chat_record(&self, chat: &ChatRecord) -> Result<(), String> {
        fs::create_dir_all(&self.history_directory).map_err(display_error)?;
        let stored = StoredChatFile {
            version: CHAT_HISTORY_VERSION,
            chat: chat.clone(),
        };
        let bytes = serde_json::to_vec(&stored).map_err(display_error)?;
        write_atomically(&self.chat_record_path(&chat.id), &bytes)
    }

    fn externalize_attachments(&self, chat: &mut ChatRecord) -> Result<Vec<PathBuf>, String> {
        let mut written = Vec::new();
        let chat_id = chat.id.clone();
        let result = visit_attachments(&mut chat.messages, |attachment| {
            let attachment_id = attachment
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "A chat attachment id is invalid".to_string())?;
            if attachment_id.len() > 120 {
                return Err("A chat attachment id is invalid".to_string());
            }
            let storage_key = attachment_storage_key(&chat_id, attachment_id);
            let storage_path = self.attachment_path(&storage_key)?;
            let stored = attachment.get("storageKey").and_then(Value::as_str)
                == Some(storage_key.as_str())
                && storage_path.exists();

            if !stored {
                let Some(data_url) = attachment.get("url").and_then(Value::as_str) else {
                    attachment.remove("storageKey");
                    return Ok(());
                };
                if !data_url.starts_with("data:") {
                    attachment.remove("url");
                    attachment.remove("storageKey");
                    return Ok(());
                }
                let media_type = attachment
                    .get("mediaType")
                    .and_then(Value::as_str)
                    .unwrap_or("application/octet-stream");
                let bytes = decode_attachment(data_url, media_type)?;
                if let Some(parent) = storage_path.parent() {
                    fs::create_dir_all(parent).map_err(display_error)?;
                }
                if !storage_path.exists() {
                    write_atomically(&storage_path, &bytes)?;
                    written.push(storage_path);
                }
            }

            attachment.insert("storageKey".to_string(), Value::String(storage_key));
            attachment.remove("url");
            Ok(())
        });
        if let Err(error) = result {
            remove_files(&written);
            return Err(error);
        }
        Ok(written)
    }

    fn materialize_attachments(&self, chat: &mut ChatRecord) -> Result<(), String> {
        let chat_id = chat.id.clone();
        visit_attachments(&mut chat.messages, |attachment| {
            if attachment.get("url").and_then(Value::as_str).is_some() {
                return Ok(());
            }
            let attachment_id = attachment
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "A chat attachment id is invalid".to_string())?;
            let expected_key = attachment_storage_key(&chat_id, attachment_id);
            let Some(storage_key) = attachment.get("storageKey").and_then(Value::as_str) else {
                return Ok(());
            };
            if storage_key != expected_key {
                return Err("A chat attachment storage key is invalid".to_string());
            }
            let path = self.attachment_path(storage_key)?;
            let bytes = match fs::read(&path) {
                Ok(bytes) => bytes,
                Err(error) => {
                    eprintln!("failed to read chat attachment {}: {error}", path.display());
                    return Ok(());
                }
            };
            let media_type = attachment
                .get("mediaType")
                .and_then(Value::as_str)
                .unwrap_or("application/octet-stream");
            let data_url = format!("data:{media_type};base64,{}", BASE64.encode(bytes));
            attachment.insert("url".to_string(), Value::String(data_url));
            Ok(())
        })
    }

    fn cleanup_unreferenced_attachments(&self, chat_id: &str) {
        let Some(chat) = self.chats.iter().find(|chat| chat.id == chat_id) else {
            return;
        };
        let mut referenced = HashSet::new();
        collect_storage_keys(&chat.messages, &mut referenced);
        let directory = self.chat_attachment_directory(chat_id);
        let Ok(entries) = fs::read_dir(&directory) else {
            return;
        };
        for entry in entries.flatten() {
            if entry.file_type().is_ok_and(|file_type| file_type.is_file())
                && !referenced.contains(entry.file_name().to_string_lossy().as_ref())
            {
                let _ = fs::remove_file(entry.path());
            }
        }
        if referenced.is_empty() {
            let _ = fs::remove_dir(directory);
        }
    }

    fn attachment_path(&self, storage_key: &str) -> Result<PathBuf, String> {
        let Some((directory, filename)) = storage_key.split_once('/') else {
            return Err("A chat attachment storage key is invalid".to_string());
        };
        if directory.is_empty()
            || filename.is_empty()
            || filename.contains('/')
            || !directory.chars().chain(filename.chars()).all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err("A chat attachment storage key is invalid".to_string());
        }
        Ok(self.attachment_directory.join(directory).join(filename))
    }

    fn chat_attachment_directory(&self, chat_id: &str) -> PathBuf {
        self.attachment_directory
            .join(URL_SAFE_NO_PAD.encode(chat_id.as_bytes()))
    }

    fn chat_record_path(&self, chat_id: &str) -> PathBuf {
        self.history_directory.join(format!(
            "{}.json",
            URL_SAFE_NO_PAD.encode(chat_id.as_bytes())
        ))
    }
}

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

fn visit_attachments(
    messages: &mut Value,
    mut visit: impl FnMut(&mut Map<String, Value>) -> Result<(), String>,
) -> Result<(), String> {
    let messages = messages
        .as_array_mut()
        .ok_or_else(|| "Chat messages are invalid".to_string())?;
    for message in messages {
        let Some(attachments) = message.get_mut("attachments") else {
            continue;
        };
        let attachments = attachments
            .as_array_mut()
            .ok_or_else(|| "Chat attachments are invalid".to_string())?;
        if attachments.len() > 4 {
            return Err("Chat attachments are invalid".to_string());
        }
        for attachment in attachments {
            let attachment = attachment
                .as_object_mut()
                .ok_or_else(|| "A chat attachment is invalid".to_string())?;
            visit(attachment)?;
        }
    }
    Ok(())
}

fn collect_storage_keys(messages: &Value, storage_keys: &mut HashSet<String>) {
    let Some(messages) = messages.as_array() else {
        return;
    };
    for message in messages {
        let Some(attachments) = message.get("attachments").and_then(Value::as_array) else {
            continue;
        };
        for attachment in attachments {
            let Some(storage_key) = attachment.get("storageKey").and_then(Value::as_str) else {
                continue;
            };
            let Some((_directory, filename)) = storage_key.split_once('/') else {
                continue;
            };
            storage_keys.insert(filename.to_string());
        }
    }
}

fn attachment_storage_keys(messages: &Value) -> HashMap<String, String> {
    let mut storage_keys = HashMap::new();
    let Some(messages) = messages.as_array() else {
        return storage_keys;
    };
    for message in messages {
        let Some(attachments) = message.get("attachments").and_then(Value::as_array) else {
            continue;
        };
        for attachment in attachments {
            let Some(id) = attachment.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some(storage_key) = attachment.get("storageKey").and_then(Value::as_str) else {
                continue;
            };
            storage_keys.insert(id.to_string(), storage_key.to_string());
        }
    }
    storage_keys
}

fn attachment_storage_key(chat_id: &str, attachment_id: &str) -> String {
    format!(
        "{}/{}",
        URL_SAFE_NO_PAD.encode(chat_id.as_bytes()),
        URL_SAFE_NO_PAD.encode(attachment_id.as_bytes())
    )
}

fn decode_attachment(data_url: &str, media_type: &str) -> Result<Vec<u8>, String> {
    if data_url.len() > MAX_ATTACHMENT_DATA_URL_LENGTH {
        return Err("Each attachment must be 10 MB or smaller".to_string());
    }
    let prefix = format!("data:{media_type};base64,");
    let encoded = data_url
        .strip_prefix(&prefix)
        .ok_or_else(|| "A chat attachment has an invalid data URL".to_string())?;
    BASE64
        .decode(encoded)
        .map_err(|_| "A chat attachment could not be decoded".to_string())
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
mod tests {
    use serde_json::json;

    use super::*;

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

    #[test]
    fn saves_loads_and_orders_chat_history() {
        let directory = temporary_directory("save-load");
        fs::create_dir_all(&directory).unwrap();
        let mut store = ChatHistoryStore::load(&directory);

        store.save(chat("one", "First chat", 20)).unwrap();
        store.save(chat("two", "Second chat", 30)).unwrap();
        store.save(chat("one", "Updated first chat", 40)).unwrap();
        store.save(chat("one", "Stale first chat", 35)).unwrap();

        let loaded = ChatHistoryStore::load(&directory);
        assert_eq!(loaded.chats.len(), 2);
        assert_eq!(
            loaded.chat("one").unwrap().unwrap().title,
            "Updated first chat"
        );
        assert_eq!(
            loaded
                .summaries()
                .into_iter()
                .map(|summary| summary.id)
                .collect::<Vec<_>>(),
            vec!["one", "two"]
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_invalid_chat_records() {
        let directory = temporary_directory("invalid");
        fs::create_dir_all(&directory).unwrap();
        let mut store = ChatHistoryStore::load(&directory);
        let mut invalid = chat("one", "First chat", 20);
        invalid.messages = json!({ "not": "an array" });

        assert_eq!(
            store.save(invalid).unwrap_err(),
            "Chat messages are invalid"
        );
        assert!(!directory.join(CHAT_HISTORY_DIRECTORY).exists());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn renames_a_chat_without_changing_its_order() {
        let directory = temporary_directory("rename");
        fs::create_dir_all(&directory).unwrap();
        let mut store = ChatHistoryStore::load(&directory);
        store.save(chat("one", "Original title", 20)).unwrap();
        store.save(chat("two", "Other chat", 30)).unwrap();

        store.rename("one", "Generated title".to_string()).unwrap();

        assert_eq!(store.chat("one").unwrap().unwrap().title, "Generated title");
        assert_eq!(
            store
                .summaries()
                .into_iter()
                .map(|summary| summary.id)
                .collect::<Vec<_>>(),
            vec!["two", "one"]
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn quarantines_invalid_history_and_starts_empty() {
        let directory = temporary_directory("recovery");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join(CHAT_HISTORY_FILE), b"not-json").unwrap();

        let store = ChatHistoryStore::load(&directory);

        assert!(store.chats.is_empty());
        assert!(store.recovery_warning().is_some());
        assert!(!directory.join(CHAT_HISTORY_FILE).exists());
        assert!(fs::read_dir(&directory)
            .unwrap()
            .flatten()
            .any(|entry| entry
                .file_name()
                .to_string_lossy()
                .starts_with("chat-history.json.invalid-")));

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn quarantines_unsupported_history_versions() {
        let directory = temporary_directory("unsupported-version");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join(CHAT_HISTORY_FILE),
            serde_json::to_vec(&json!({ "version": CHAT_HISTORY_VERSION + 1, "chats": [] }))
                .unwrap(),
        )
        .unwrap();

        let store = ChatHistoryStore::load(&directory);

        assert!(store.chats.is_empty());
        assert!(store
            .recovery_warning()
            .unwrap()
            .contains("Unsupported chat history version"));
        assert!(!directory.join(CHAT_HISTORY_FILE).exists());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn migrates_legacy_history_to_individual_chat_records() {
        let directory = temporary_directory("legacy-migration");
        fs::create_dir_all(&directory).unwrap();
        let legacy = ChatHistoryFile {
            version: CHAT_HISTORY_VERSION,
            chats: vec![chat("one", "Legacy chat", 20)],
        };
        fs::write(
            directory.join(CHAT_HISTORY_FILE),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();

        let store = ChatHistoryStore::load(&directory);

        assert_eq!(store.chat("one").unwrap().unwrap().title, "Legacy chat");
        assert!(store.chat_record_path("one").exists());
        assert!(store.recovery_warning().unwrap().contains("was migrated"));
        assert!(!directory.join(CHAT_HISTORY_FILE).exists());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn externalizes_materializes_and_preserves_archived_attachments() {
        let directory = temporary_directory("attachments");
        fs::create_dir_all(&directory).unwrap();
        let mut store = ChatHistoryStore::load(&directory);
        let mut attached = chat("one", "Attachment chat", 20);
        attached.messages = json!([{
            "id": "message-1",
            "role": "user",
            "text": "See attachment",
            "attachments": [{
                "id": "message-1-file-0",
                "filename": "note.txt",
                "mediaType": "text/plain",
                "url": "data:text/plain;base64,aGVsbG8="
            }]
        }]);

        let result = store.save(attached).unwrap();

        let history = fs::read_to_string(store.chat_record_path("one")).unwrap();
        assert!(!history.contains("aGVsbG8="));
        assert!(history.contains("storageKey"));
        assert_eq!(
            result.attachment_storage_keys.get("message-1-file-0"),
            Some(&attachment_storage_key("one", "message-1-file-0"))
        );
        let loaded = store.chat("one").unwrap().unwrap();
        assert_eq!(
            loaded.messages.pointer("/0/attachments/0/url"),
            Some(&json!("data:text/plain;base64,aGVsbG8="))
        );

        let attachment_directory = store.chat_attachment_directory("one");
        let record_path = store.chat_record_path("one");
        assert!(attachment_directory.exists());
        store.archive("one").unwrap();
        assert!(attachment_directory.exists());
        assert!(record_path.exists());
        assert!(store.summaries().is_empty());
        assert!(store.chat("one").unwrap().unwrap().archived_at_ms.is_some());
        assert_eq!(
            store.save(chat("one", "Recreated chat", 30)).unwrap_err(),
            "Chat was archived"
        );

        let reloaded = ChatHistoryStore::load(&directory);
        assert!(reloaded.summaries().is_empty());
        assert!(reloaded
            .chat("one")
            .unwrap()
            .unwrap()
            .archived_at_ms
            .is_some());
        assert!(attachment_directory.exists());

        store.archive("not-yet-saved").unwrap();
        assert_eq!(
            store
                .save(chat("not-yet-saved", "Late save", 40))
                .unwrap_err(),
            "Chat was archived"
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_persistence_does_not_commit_memory_or_new_attachments() {
        let directory = temporary_directory("transaction");
        fs::create_dir_all(&directory).unwrap();
        let mut store = ChatHistoryStore::load(&directory);
        store.save(chat("one", "Original", 20)).unwrap();
        store.history_directory = directory.join("not-a-directory");
        fs::write(&store.history_directory, b"blocked").unwrap();
        let mut updated = chat("one", "Updated", 30);
        updated.messages = json!([{
            "id": "message-1",
            "role": "user",
            "text": "See attachment",
            "attachments": [{
                "id": "message-1-file-0",
                "filename": "note.txt",
                "mediaType": "text/plain",
                "url": "data:text/plain;base64,aGVsbG8="
            }]
        }]);

        assert!(store.save(updated).is_err());
        assert_eq!(store.chat("one").unwrap().unwrap().title, "Original");
        assert!(!store
            .chat_attachment_directory("one")
            .join(URL_SAFE_NO_PAD.encode(b"message-1-file-0"))
            .exists());

        fs::remove_dir_all(directory).unwrap();
    }
}

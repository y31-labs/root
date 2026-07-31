use std::{collections::HashSet, fs, path::PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

use super::{
    current_time_ms, display_error, remove_files, validate_chat, validate_chat_title,
    write_atomically, ChatRecord, ChatSaveResult, ChatSummary, StoredChatFile,
    CHAT_HISTORY_VERSION,
};

pub(crate) struct ChatHistoryStore {
    pub(super) attachment_directory: PathBuf,
    pub(super) archived_chat_ids: HashSet<String>,
    pub(super) chats: Vec<ChatRecord>,
    pub(super) history_directory: PathBuf,
    pub(super) legacy_path: PathBuf,
    pub(super) recovery_warning: Option<String>,
    pub(super) write_blocker: Option<String>,
}

impl ChatHistoryStore {
    pub(super) fn summaries(&self) -> Vec<ChatSummary> {
        let mut summaries = self
            .chats
            .iter()
            .filter(|chat| chat.archived_at_ms.is_none())
            .map(ChatSummary::from)
            .collect::<Vec<_>>();
        summaries.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
        summaries
    }

    pub(super) fn chat(&self, id: &str) -> Result<Option<ChatRecord>, String> {
        let Some(mut chat) = self.chats.iter().find(|chat| chat.id == id).cloned() else {
            return Ok(None);
        };
        self.materialize_attachments(&mut chat)?;
        Ok(Some(chat))
    }

    pub(super) fn save(&mut self, mut chat: ChatRecord) -> Result<ChatSaveResult, String> {
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

    pub(super) fn rename(&mut self, id: &str, title: String) -> Result<(), String> {
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

    pub(super) fn archive(&mut self, id: &str) -> Result<(), String> {
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

    pub(super) fn persist_chat_record(&self, chat: &ChatRecord) -> Result<(), String> {
        fs::create_dir_all(&self.history_directory).map_err(display_error)?;
        let stored = StoredChatFile {
            version: CHAT_HISTORY_VERSION,
            chat: chat.clone(),
        };
        let bytes = serde_json::to_vec(&stored).map_err(display_error)?;
        write_atomically(&self.chat_record_path(&chat.id), &bytes)
    }

    pub(super) fn chat_record_path(&self, chat_id: &str) -> PathBuf {
        self.history_directory.join(format!(
            "{}.json",
            URL_SAFE_NO_PAD.encode(chat_id.as_bytes())
        ))
    }

    fn ensure_writable(&self) -> Result<(), String> {
        if let Some(error) = &self.write_blocker {
            return Err(error.clone());
        }
        Ok(())
    }
}

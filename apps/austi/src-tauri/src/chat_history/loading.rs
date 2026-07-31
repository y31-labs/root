use std::fs;

use super::{
    archive_file, display_error, remove_files, validate_chat, validate_version, ChatHistoryFile,
    ChatHistoryStore, ChatRecord, StoredChatFile, CHAT_ATTACHMENT_DIRECTORY,
    CHAT_HISTORY_DIRECTORY, CHAT_HISTORY_FILE,
};

impl ChatHistoryStore {
    pub(crate) fn load(data_dir: &std::path::Path) -> Self {
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

    fn empty(data_dir: &std::path::Path) -> Self {
        Self {
            attachment_directory: data_dir.join(CHAT_ATTACHMENT_DIRECTORY),
            archived_chat_ids: std::collections::HashSet::new(),
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

    fn recover_file(&mut self, path: &std::path::Path, error: String, warnings: &mut Vec<String>) {
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
}

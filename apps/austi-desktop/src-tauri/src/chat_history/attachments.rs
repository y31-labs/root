use std::{collections::HashSet, fs, path::PathBuf};

use base64::{
    engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD},
    Engine,
};
use serde_json::Value;

use super::{
    attachment_data::{
        attachment_storage_key, collect_storage_keys, decode_attachment, visit_attachments,
    },
    display_error, remove_files, write_atomically, ChatHistoryStore, ChatRecord,
};

impl ChatHistoryStore {
    pub(super) fn externalize_attachments(
        &self,
        chat: &mut ChatRecord,
    ) -> Result<Vec<PathBuf>, String> {
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

    pub(super) fn materialize_attachments(&self, chat: &mut ChatRecord) -> Result<(), String> {
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

    pub(super) fn cleanup_unreferenced_attachments(&self, chat_id: &str) {
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

    pub(super) fn chat_attachment_directory(&self, chat_id: &str) -> PathBuf {
        self.attachment_directory
            .join(URL_SAFE_NO_PAD.encode(chat_id.as_bytes()))
    }
}

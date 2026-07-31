use std::collections::{HashMap, HashSet};

use base64::{
    engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD},
    Engine,
};
use serde_json::{Map, Value};

const MAX_ATTACHMENT_DATA_URL_LENGTH: usize = 14_000_000;

pub(super) fn visit_attachments(
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

pub(super) fn collect_storage_keys(messages: &Value, storage_keys: &mut HashSet<String>) {
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

pub(super) fn attachment_storage_keys(messages: &Value) -> HashMap<String, String> {
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

pub(super) fn attachment_storage_key(chat_id: &str, attachment_id: &str) -> String {
    format!(
        "{}/{}",
        URL_SAFE_NO_PAD.encode(chat_id.as_bytes()),
        URL_SAFE_NO_PAD.encode(attachment_id.as_bytes())
    )
}

pub(super) fn decode_attachment(data_url: &str, media_type: &str) -> Result<Vec<u8>, String> {
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

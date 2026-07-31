use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde_json::{json, Value};

use super::types::CodexAttachmentInput;

pub(super) const MAX_ATTACHMENTS: usize = 4;
const MAX_ATTACHMENT_DATA_URL_LENGTH: usize = 14_000_000;

pub(super) struct PreparedTurnInput {
    pub(super) input: Vec<Value>,
    pub(super) attachment_dir: Option<PathBuf>,
}

pub(super) fn validate_attachments(attachments: &[CodexAttachmentInput]) -> Result<(), String> {
    if attachments.len() > MAX_ATTACHMENTS {
        return Err(format!("Attach no more than {MAX_ATTACHMENTS} files."));
    }

    for attachment in attachments {
        if attachment.data_url.len() > MAX_ATTACHMENT_DATA_URL_LENGTH {
            return Err("Each attachment must be 10 MB or smaller.".to_string());
        }
        let prefix = format!("data:{};base64,", attachment.media_type);
        if !attachment.data_url.starts_with(&prefix) {
            return Err("An attachment has an invalid data URL.".to_string());
        }
    }
    Ok(())
}

pub(super) fn prepare_turn_input(
    prompt: &str,
    attachments: &[CodexAttachmentInput],
    data_dir: &Path,
) -> Result<PreparedTurnInput, String> {
    validate_attachments(attachments)?;
    let mut turn_input =
        Vec::with_capacity(usize::from(!prompt.is_empty()) + attachments.len() + 1);
    if !prompt.is_empty() {
        turn_input.push(json!({ "type": "text", "text": prompt }));
    }

    let mut decoded_files = Vec::new();
    for attachment in attachments {
        if supports_image_input(&attachment.media_type) {
            turn_input.push(json!({ "type": "image", "url": attachment.data_url }));
            continue;
        }
        if attachment.media_type.starts_with("audio/") {
            turn_input.push(json!({ "type": "audio", "url": attachment.data_url }));
            continue;
        }

        let prefix = format!("data:{};base64,", attachment.media_type);
        let encoded = attachment
            .data_url
            .strip_prefix(&prefix)
            .ok_or_else(|| "An attachment has an invalid data URL.".to_string())?;
        let bytes = BASE64
            .decode(encoded)
            .map_err(|_| "An attachment could not be decoded.".to_string())?;
        decoded_files.push((sanitize_filename(&attachment.filename), bytes));
    }

    if decoded_files.is_empty() {
        return Ok(PreparedTurnInput {
            input: turn_input,
            attachment_dir: None,
        });
    }

    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(display_error)?
        .as_nanos();
    let attachment_dir = data_dir
        .join("attachments")
        .join(format!("{}-{unique}", std::process::id()));
    std::fs::create_dir_all(&attachment_dir).map_err(display_error)?;

    let write_result = decoded_files
        .into_iter()
        .enumerate()
        .map(|(index, (filename, bytes))| {
            let path = attachment_dir.join(format!("{index}-{filename}"));
            std::fs::write(&path, bytes).map_err(display_error)?;
            Ok(path)
        })
        .collect::<Result<Vec<_>, String>>();
    let paths = match write_result {
        Ok(paths) => paths,
        Err(error) => {
            cleanup_attachment_dir(Some(&attachment_dir));
            return Err(error);
        }
    };
    let attached_files = paths
        .iter()
        .map(|path| format!("- {}", path.display()))
        .collect::<Vec<_>>()
        .join("\n");
    turn_input.push(json!({
        "type": "text",
        "text": format!("Files attached by the user:\n{attached_files}")
    }));

    Ok(PreparedTurnInput {
        input: turn_input,
        attachment_dir: Some(attachment_dir),
    })
}

pub(super) fn cleanup_attachment_dir(attachment_dir: Option<&Path>) {
    let Some(attachment_dir) = attachment_dir else {
        return;
    };
    if let Err(error) = std::fs::remove_dir_all(attachment_dir) {
        tracing::warn!(path = %attachment_dir.display(), error = %error, "failed to clean up attachments");
    }
}

fn supports_image_input(media_type: &str) -> bool {
    matches!(
        media_type,
        "image/gif" | "image/jpeg" | "image/png" | "image/webp"
    )
}

fn sanitize_filename(filename: &str) -> String {
    let sanitized = filename
        .chars()
        .take(120)
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.trim_matches('.').is_empty() {
        "attachment".to_string()
    } else {
        sanitized
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests;

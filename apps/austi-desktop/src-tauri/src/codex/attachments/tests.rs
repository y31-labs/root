use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::json;

use super::*;

fn attachment(filename: &str, media_type: &str, data_url: &str) -> CodexAttachmentInput {
    CodexAttachmentInput {
        data_url: data_url.to_string(),
        filename: filename.to_string(),
        media_type: media_type.to_string(),
    }
}

#[test]
fn builds_multimodal_turn_input() {
    let prepared = prepare_turn_input(
        "Match this layout",
        &[attachment(
            "layout.png",
            "image/png",
            "data:image/png;base64,aW1hZ2U=",
        )],
        Path::new("unused"),
    )
    .unwrap();

    assert_eq!(
        prepared.input,
        vec![
            json!({ "type": "text", "text": "Match this layout" }),
            json!({ "type": "image", "url": "data:image/png;base64,aW1hZ2U=" }),
        ]
    );
}

#[test]
fn supports_image_only_turns() {
    assert_eq!(
        prepare_turn_input(
            "",
            &[attachment(
                "reference.jpg",
                "image/jpeg",
                "data:image/jpeg;base64,aW1hZ2U="
            )],
            Path::new("unused")
        )
        .unwrap()
        .input,
        vec![json!({
            "type": "image",
            "url": "data:image/jpeg;base64,aW1hZ2U="
        })]
    );
}

#[test]
fn stages_non_image_files_for_analysis() {
    let test_dir = std::env::temp_dir().join(format!(
        "y31-attachment-test-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let prepared = prepare_turn_input(
        "Summarize this file",
        &[attachment(
            "brief.pdf",
            "application/pdf",
            "data:application/pdf;base64,ZmlsZQ==",
        )],
        &test_dir,
    )
    .unwrap();
    let attachment_dir = prepared.attachment_dir.as_ref().unwrap();
    let staged_file = std::fs::read_dir(attachment_dir)
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();

    assert_eq!(std::fs::read(&staged_file).unwrap(), b"file");
    assert!(prepared.input[1]["text"]
        .as_str()
        .unwrap()
        .contains(staged_file.to_string_lossy().as_ref()));

    cleanup_attachment_dir(Some(attachment_dir));
    let _ = std::fs::remove_dir_all(test_dir);
}

#[test]
fn rejects_invalid_attachment_data_urls() {
    let result = validate_attachments(&[attachment(
        "brief.pdf",
        "application/pdf",
        "https://example.com/brief.pdf",
    )]);

    assert_eq!(
        result,
        Err("An attachment has an invalid data URL.".to_string())
    );
}

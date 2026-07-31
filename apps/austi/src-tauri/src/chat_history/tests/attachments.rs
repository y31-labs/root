use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

use super::*;
use crate::chat_history::attachment_data::attachment_storage_key;

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

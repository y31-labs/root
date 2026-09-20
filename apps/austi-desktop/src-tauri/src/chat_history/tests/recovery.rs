use super::*;

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
        serde_json::to_vec(&json!({ "version": CHAT_HISTORY_VERSION + 1, "chats": [] })).unwrap(),
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

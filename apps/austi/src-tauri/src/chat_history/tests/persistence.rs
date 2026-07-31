use super::*;

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

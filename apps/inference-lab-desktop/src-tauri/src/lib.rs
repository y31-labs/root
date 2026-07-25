mod chat_history;
mod codex;
mod logging;

use std::{path::PathBuf, sync::Mutex};

use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

struct AppState {
    data_dir: PathBuf,
    chat_history: Mutex<chat_history::ChatHistoryStore>,
    codex: AsyncMutex<Option<codex::CodexClient>>,
    _logging_guard: Option<logging::LoggingGuard>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let chat_history = chat_history::ChatHistoryStore::load(&data_dir);
            let chat_history_warning = chat_history.recovery_warning().map(str::to_string);
            let attachment_dir = data_dir.join("attachments");
            if attachment_dir.exists() {
                if let Err(error) = std::fs::remove_dir_all(&attachment_dir) {
                    eprintln!("failed to clean up stale attachments: {error}");
                }
            }
            let logging_guard = match logging::initialize(&data_dir.join("logs"), Vec::new()) {
                Ok(guard) => Some(guard),
                Err(error) => {
                    eprintln!("failed to initialize file logging: {error}");
                    None
                }
            };

            tracing::info!(
                target: logging::EXTERNAL_EVENT_TARGET,
                event = "application_started",
                application = "y31-desktop",
                version = env!("CARGO_PKG_VERSION")
            );
            if let Some(warning) = chat_history_warning {
                tracing::warn!(warning, "chat history was recovered");
            }
            app.manage(AppState {
                data_dir,
                chat_history: Mutex::new(chat_history),
                codex: AsyncMutex::new(None),
                _logging_guard: logging_guard,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            chat_history::chat_history_status,
            chat_history::archive_chat,
            chat_history::get_chat,
            chat_history::list_chats,
            chat_history::rename_chat,
            chat_history::save_chat,
            codex::codex_integration_status,
            codex::connect_codex,
            codex::generate_chat_title,
            codex::interrupt_codex_turn,
            codex::list_codex_models,
            codex::resolve_codex_approval,
            codex::stream_codex_text
        ])
        .run(tauri::generate_context!())
        .expect("failed to run y31 desktop");
}

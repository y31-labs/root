mod chat_history;
mod codex;
mod logging;

use std::{path::PathBuf, sync::Mutex};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use tokio::sync::Mutex as AsyncMutex;

struct AppState {
    data_dir: PathBuf,
    chat_history: Mutex<chat_history::ChatHistoryStore>,
    codex: AsyncMutex<Option<codex::CodexClient>>,
    codex_runs: codex::runs::CodexRuns,
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
                codex_runs: codex::runs::CodexRuns::default(),
                _logging_guard: logging_guard,
            });
            let show = MenuItem::with_id(app, "show", "Show y31", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit and stop agents", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .ok_or_else(|| std::io::Error::other("Missing application icon"))?,
                )
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.codex_runs.has_active() {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
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
            codex::get_codex_run,
            codex::list_codex_models,
            codex::resolve_codex_approval,
            codex::start_codex_text,
            codex::stream_codex_run
        ])
        .run(tauri::generate_context!())
        .expect("failed to run y31 desktop");
}

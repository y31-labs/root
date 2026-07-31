mod chat_history;
mod codex;
mod generated_apps;
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
    app_tools: generated_apps::AppToolRuntime,
    _logging_guard: Option<logging::LoggingGuard>,
}

#[tauri::command]
fn open_logs_folder(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let log_directory = state.data_dir.join("logs");
    std::fs::create_dir_all(&log_directory).map_err(|error| error.to_string())?;
    std::process::Command::new("open")
        .arg(log_directory)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
                application = "austi-desktop",
                version = env!("CARGO_PKG_VERSION")
            );
            if let Some(warning) = chat_history_warning {
                tracing::warn!(warning, "chat history was recovered");
            }
            let app_tools =
                generated_apps::AppToolRuntime::new(data_dir.clone(), app.handle().clone());
            app.manage(AppState {
                data_dir,
                chat_history: Mutex::new(chat_history),
                codex: AsyncMutex::new(None),
                codex_runs: codex::runs::CodexRuns::default(),
                app_tools,
                _logging_guard: logging_guard,
            });
            let show = MenuItem::with_id(app, "show", "Show Austi", true, None::<&str>)?;
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
            codex::integration::codex_integration_status,
            codex::integration::connect_codex,
            codex::run_commands::active_codex_task_count,
            codex::title::generate_chat_title,
            codex::run_commands::interrupt_codex_turn,
            codex::run_commands::get_codex_run,
            codex::integration::list_codex_models,
            codex::mcp::connect_mcp_server,
            codex::mcp::list_mcp_servers,
            generated_apps::store::get_generated_app,
            generated_apps::store::get_generated_app_state,
            generated_apps::capabilities::invoke_generated_app_capability,
            generated_apps::store::list_generated_apps,
            generated_apps::store::save_generated_app_state,
            open_logs_folder,
            codex::run_commands::resolve_codex_approval,
            codex::run_commands::stop_active_codex_tasks,
            codex::turn::start_codex_text,
            codex::run_commands::stream_codex_run
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Austi desktop");
}

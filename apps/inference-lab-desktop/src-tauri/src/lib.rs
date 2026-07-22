mod codex;
mod logging;

use std::path::PathBuf;

use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;

struct AppState {
    data_dir: PathBuf,
    codex: AsyncMutex<Option<codex::CodexClient>>,
    _logging_guard: Option<logging::LoggingGuard>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
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
            app.manage(AppState {
                data_dir,
                codex: AsyncMutex::new(None),
                _logging_guard: logging_guard,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            codex::codex_integration_status,
            codex::connect_codex,
            codex::stream_codex_text
        ])
        .run(tauri::generate_context!())
        .expect("failed to run y31 desktop");
}

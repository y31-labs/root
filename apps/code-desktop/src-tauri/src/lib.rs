use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env,
    ffi::OsStr,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex as AsyncMutex},
    time::timeout,
};
use walkdir::WalkDir;

mod build_metadata;
#[cfg(test)]
#[allow(dead_code)]
#[path = "../build_provenance.rs"]
mod build_provenance_test_support;
mod local_sessions;
mod mvp_smoke;
mod runtime_readiness;
mod session_engine;

use session_engine::{CodexImplementationEngine, ImplementationEngine};

const VERIFICATION_IMAGE: &str = "code-agent-verifier:1";
const CODEX_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

struct AppState {
    data_dir: PathBuf,
    cancelled: Arc<Mutex<HashSet<String>>>,
    active: Arc<Mutex<HashSet<String>>>,
    codex: AsyncMutex<Option<CodexClient>>,
    browsers: Arc<AsyncMutex<HashMap<String, local_sessions::BrowserController>>>,
    implementation_engine: Arc<dyn ImplementationEngine>,
    smoke_auto_approve: bool,
}

struct CodexClient {
    _child: Child,
    stdin: Arc<AsyncMutex<ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineHealth {
    available: bool,
    version: Option<String>,
    authenticated: bool,
    git_available: bool,
    docker_available: bool,
    app_server_available: bool,
    browser_tools_available: bool,
    detail: Option<String>,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
enum PostHogLogLevel {
    Info,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PostHogLogEvent {
    level: PostHogLogLevel,
    message: &'static str,
    attributes: BTreeMap<String, Value>,
}

#[tauri::command]
async fn engine_health() -> EngineHealth {
    let codex = codex_executable();
    let version = match &codex {
        Ok(codex) => command_text(codex, &["--version"]).await.ok(),
        Err(_) => None,
    };
    let login = match &codex {
        Ok(codex) => command_text(codex, &["login", "status"]).await,
        Err(error) => Err(error.clone()),
    };
    let git_available = command_ok(Path::new("git"), &["--version"]).await;
    let app_server_available = match &codex {
        Ok(codex) => runtime_readiness::probe_codex_protocol(codex).await.is_ok(),
        Err(_) => false,
    };
    let verifier = runtime_readiness::probe_verifier_image(VERIFICATION_IMAGE).await;
    let docker_available = verifier.is_ok();
    let authenticated = login.as_ref().is_ok_and(|text| {
        let text = text.to_ascii_lowercase();
        text.contains("logged in") && text.contains("chatgpt")
    });
    let detail = if !git_available {
        Some("Install Git before opening a repository.".to_string())
    } else if version.is_none() {
        Some("Install the official Codex CLI before starting a session.".to_string())
    } else if !authenticated {
        Some("Run `codex login` and authenticate with ChatGPT.".to_string())
    } else if !app_server_available {
        Some("Update Codex to a version with app-server support.".to_string())
    } else if let Err(error) = verifier {
        Some(error)
    } else {
        None
    };
    EngineHealth {
        available: git_available
            && version.is_some()
            && authenticated
            && docker_available
            && app_server_available,
        version,
        authenticated,
        git_available,
        docker_available,
        app_server_available,
        browser_tools_available: app_server_available && docker_available,
        detail,
    }
}

#[tauri::command]
fn start_codex_login() -> Result<(), String> {
    std::process::Command::new(codex_executable()?)
        .arg("login")
        .spawn()
        .map_err(display_error)?;
    Ok(())
}

#[tauri::command]
async fn install_verifier_runtime(app: AppHandle) -> Result<(), String> {
    app.emit(
        "runtime-install-progress",
        json!({ "stage": "building", "message": "Building the pinned verifier image" }),
    )
    .map_err(display_error)?;
    let context = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "Verifier build context is unavailable".to_string())?;
    let dockerfile = context.join("verification.Dockerfile");
    let result =
        runtime_readiness::install_verifier_image(VERIFICATION_IMAGE, &dockerfile, context).await;
    let (stage, message) = match &result {
        Ok(()) => ("complete", "Pinned verifier image is ready".to_string()),
        Err(error) => ("failed", error.clone()),
    };
    let _ = app.emit(
        "runtime-install-progress",
        json!({ "stage": stage, "message": message }),
    );
    result
}

#[tauri::command]
async fn read_artifact(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let path = confined_artifact_path(&state.data_dir, &path)?;
    let metadata = fs::metadata(&path).await.map_err(display_error)?;
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        if metadata.len() > 10 * 1024 * 1024 {
            return Err("Image artifact is too large to preview; reveal it in Finder".to_string());
        }
        let media_type = if extension == "jpg" {
            "jpeg"
        } else {
            extension.as_str()
        };
        let bytes = fs::read(path).await.map_err(display_error)?;
        return Ok(format!(
            "data:image/{media_type};base64,{}",
            BASE64.encode(bytes)
        ));
    }
    if metadata.len() > 512 * 1024 {
        return Err("Text artifact is too large to preview; reveal it in Finder".to_string());
    }
    let bytes = fs::read(path).await.map_err(display_error)?;
    String::from_utf8(bytes)
        .map_err(|_| "Binary artifact cannot be previewed; reveal it in Finder".to_string())
}

#[tauri::command]
fn reveal_artifact(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path = confined_artifact_path(&state.data_dir, &path)?;
    std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map_err(display_error)?;
    Ok(())
}

#[tauri::command]
fn quit_application(app: AppHandle, state: State<'_, AppState>, force: bool) -> Result<(), String> {
    if !force && !state.active.lock().map_err(display_error)?.is_empty() {
        return Err("A change session is still active".to_string());
    }
    app.exit(0);
    Ok(())
}

async fn codex_request(
    app: &AppHandle,
    state: &AppState,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let mut guard = state.codex.lock().await;
    if guard.is_none() {
        *guard = Some(start_codex_client(app).await?);
    }
    let client = guard.as_mut().expect("Codex client initialized");
    match client.request(method, params).await {
        Ok(value) => Ok(value),
        Err(error) => {
            emit_posthog_log(
                app,
                PostHogLogLevel::Error,
                "codex request failed",
                [
                    ("operation", json!(method)),
                    ("errorCategory", json!(error_category(&error))),
                ],
            );
            if codex_error_requires_restart(&error) {
                *guard = None;
            }
            Err(error)
        }
    }
}

async fn codex_respond(
    app: &AppHandle,
    state: &AppState,
    request_id: Value,
    result: Value,
) -> Result<(), String> {
    let mut guard = state.codex.lock().await;
    if guard.is_none() {
        *guard = Some(start_codex_client(app).await?);
    }
    let result = guard
        .as_mut()
        .expect("Codex client initialized")
        .write(&json!({ "id": request_id, "result": result }))
        .await;
    if result.is_err() {
        *guard = None;
    }
    result
}

async fn start_codex_client(app: &AppHandle) -> Result<CodexClient, String> {
    let mut child = Command::new(codex_executable()?)
        .args(["app-server", "--listen", "stdio://"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(display_error)?;
    let stdin =
        Arc::new(AsyncMutex::new(child.stdin.take().ok_or_else(|| {
            "Codex app-server stdin unavailable".to_string()
        })?));
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app-server stdout unavailable".to_string())?;
    let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let reader_pending = pending.clone();
    let reader_app = app.clone();
    let reader_stdin = stdin.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let response_id = message.get("id").and_then(Value::as_u64);
            let is_response = message.get("result").is_some() || message.get("error").is_some();
            if is_response {
                if let Some(sender) = response_id.and_then(|id| {
                    reader_pending
                        .lock()
                        .ok()
                        .and_then(|mut pending| pending.remove(&id))
                }) {
                    let result = if let Some(error) = message.get("error") {
                        Err(error
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("Codex request failed")
                            .to_string())
                    } else {
                        Ok(message.get("result").cloned().unwrap_or(Value::Null))
                    };
                    let _ = sender.send(result);
                    continue;
                }
            }
            if message.get("method").and_then(Value::as_str) == Some("item/tool/call") {
                if let Some(request_id) = message.get("id").cloned() {
                    let engine = reader_app.state::<AppState>().implementation_engine.clone();
                    let result = match engine.dynamic_tool_call(message.clone()).await {
                        Ok(result) => json!({ "id": request_id, "result": result }),
                        Err(error) => json!({
                            "id": request_id,
                            "result": {
                                "success": false,
                                "contentItems": [{ "type": "inputText", "text": error }]
                            }
                        }),
                    };
                    let mut stdin = reader_stdin.lock().await;
                    let _ = stdin.write_all(format!("{result}\n").as_bytes()).await;
                    let _ = stdin.flush().await;
                    continue;
                }
            }
            if message
                .get("method")
                .and_then(Value::as_str)
                .is_some_and(|method| method.contains("requestApproval"))
            {
                let state = reader_app.state::<AppState>();
                if state.smoke_auto_approve {
                    local_sessions::record_codex_notification(&reader_app, &message);
                    if let (Some(request_id), Some(method)) = (
                        message.get("id").cloned(),
                        message.get("method").and_then(Value::as_str),
                    ) {
                        let decision = if method == "item/fileChange/requestApproval" {
                            "accept"
                        } else {
                            "decline"
                        };
                        if let Ok(result) = local_sessions::approval_result(method, decision) {
                            let response = json!({ "id": request_id, "result": result });
                            let mut stdin = reader_stdin.lock().await;
                            let _ = stdin.write_all(format!("{response}\n").as_bytes()).await;
                            let _ = stdin.flush().await;
                            continue;
                        }
                        let response = json!({
                            "id": request_id,
                            "error": {
                                "code": -32601,
                                "message": format!("Unsupported approval request: {method}")
                            }
                        });
                        let mut stdin = reader_stdin.lock().await;
                        let _ = stdin.write_all(format!("{response}\n").as_bytes()).await;
                        let _ = stdin.flush().await;
                        continue;
                    }
                }
            }
            local_sessions::record_codex_notification(&reader_app, &message);
        }
        if let Ok(mut pending) = reader_pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err("Codex app-server stopped".to_string()));
            }
        }
        emit_posthog_log(
            &reader_app,
            PostHogLogLevel::Error,
            "codex app server stopped",
            [
                ("operation", json!("read-loop")),
                ("status", json!("stopped")),
            ],
        );
    });
    let mut client = CodexClient {
        _child: child,
        stdin,
        pending,
        next_id: 1,
    };
    client
        .request(
            "initialize",
            json!({
                "clientInfo": {
                    "name": "code_desktop",
                    "title": "Code Desktop",
                    "version": env!("CARGO_PKG_VERSION")
                },
                "capabilities": { "experimentalApi": true }
            }),
        )
        .await?;
    client
        .write(&json!({ "method": "initialized", "params": {} }))
        .await?;
    emit_posthog_log(
        app,
        PostHogLogLevel::Info,
        "codex app server started",
        [
            ("operation", json!("initialize")),
            ("status", json!("ready")),
        ],
    );
    Ok(client)
}

impl CodexClient {
    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .map_err(display_error)?
            .insert(id, sender);
        if let Err(error) = self
            .write(&json!({ "method": method, "id": id, "params": params }))
            .await
        {
            if let Ok(mut pending) = self.pending.lock() {
                pending.remove(&id);
            }
            return Err(error);
        }
        let result = await_codex_response(receiver, method, CODEX_REQUEST_TIMEOUT).await;
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&id);
        }
        result
    }

    async fn write(&mut self, message: &Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(format!("{message}\n").as_bytes())
            .await
            .map_err(display_error)?;
        stdin.flush().await.map_err(display_error)
    }
}

async fn await_codex_response(
    receiver: oneshot::Receiver<Result<Value, String>>,
    method: &str,
    request_timeout: Duration,
) -> Result<Value, String> {
    timeout(request_timeout, receiver)
        .await
        .map_err(|_| {
            format!(
                "Codex request `{method}` timed out after {} seconds",
                request_timeout.as_secs()
            )
        })?
        .map_err(|_| "Codex response channel closed".to_string())?
}

fn database(data_dir: &Path) -> Result<Connection, String> {
    let connection =
        Connection::open(data_dir.join("code-desktop.sqlite")).map_err(display_error)?;
    connection
        .execute_batch("PRAGMA journal_mode = WAL;")
        .map_err(display_error)?;
    Ok(connection)
}

fn confined_artifact_path(data_dir: &Path, raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path);
    let canonical_path = path.canonicalize().map_err(display_error)?;
    let allowed = ["sessions"].into_iter().any(|directory| {
        data_dir
            .join(directory)
            .canonicalize()
            .is_ok_and(|root| canonical_path.starts_with(root))
    });
    if !allowed {
        return Err("Artifact path is outside app-managed storage".to_string());
    }
    Ok(canonical_path)
}

fn codex_executable() -> Result<PathBuf, String> {
    resolve_codex_executable(env::var_os("PATH").as_deref(), env::var_os("HOME").as_deref())
        .ok_or_else(|| {
            "Codex executable was not found. Install the Codex CLI or the OpenAI Codex editor extension."
                .to_string()
        })
}

fn resolve_codex_executable(path: Option<&OsStr>, home: Option<&OsStr>) -> Option<PathBuf> {
    if let Some(path) = path {
        for directory in env::split_paths(path) {
            let candidate = directory.join("codex");
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    let home = home.map(PathBuf::from)?;
    for relative in [".local/bin/codex", ".bun/bin/codex"] {
        let candidate = home.join(relative);
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }
    let mut candidates = Vec::new();
    for relative in [
        ".cursor/extensions",
        ".vscode/extensions",
        ".vscode-insiders/extensions",
    ] {
        let root = home.join(relative);
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(root)
            .min_depth(1)
            .max_depth(6)
            .into_iter()
            .filter_map(Result::ok)
        {
            let candidate = entry.path();
            if candidate.file_name() == Some(OsStr::new("codex"))
                && candidate.components().any(|component| {
                    component
                        .as_os_str()
                        .to_string_lossy()
                        .starts_with("openai.chatgpt-")
                })
                && is_executable(candidate)
            {
                candidates.push(candidate.to_path_buf());
            }
        }
    }
    candidates.sort();
    candidates.pop()
}

fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

async fn command_text(program: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .await
        .map_err(display_error)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(successful_command_text(&output.stdout, &output.stderr))
}

fn successful_command_text(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = String::from_utf8_lossy(stdout);
    let stdout = stdout.trim();
    if !stdout.is_empty() {
        return stdout.to_string();
    }
    String::from_utf8_lossy(stderr).trim().to_string()
}

async fn command_ok(program: &Path, args: &[&str]) -> bool {
    command_text(program, args).await.is_ok()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn error_category(error: &str) -> &'static str {
    let error = error.to_ascii_lowercase();
    if error.contains("timed out") || error.contains("timeout") {
        "timeout"
    } else if error.contains("cancel") {
        "cancelled"
    } else if error.contains("auth") || error.contains("token") {
        "authentication"
    } else if error.contains("not found") {
        "not_found"
    } else if error.contains("unavailable") || error.contains("stopped") {
        "unavailable"
    } else {
        "operation_failed"
    }
}

fn codex_error_requires_restart(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    [
        "app-server stopped",
        "broken pipe",
        "stdin unavailable",
        "stdout unavailable",
        "timed out",
        "timeout",
    ]
    .into_iter()
    .any(|failure| error.contains(failure))
}

fn emit_posthog_log<const N: usize>(
    app: &AppHandle,
    level: PostHogLogLevel,
    message: &'static str,
    attributes: [(&str, Value); N],
) {
    let event = posthog_log_event(level, message, attributes);
    let _ = app.emit("posthog-log", event);
}

fn posthog_log_event<const N: usize>(
    level: PostHogLogLevel,
    message: &'static str,
    attributes: [(&str, Value); N],
) -> PostHogLogEvent {
    const ALLOWED_ATTRIBUTES: [&str; 6] = [
        "errorCategory",
        "operation",
        "runId",
        "sessionId",
        "status",
        "version",
    ];
    let attributes = attributes
        .into_iter()
        .filter(|(key, value)| ALLOWED_ATTRIBUTES.contains(key) && !value.is_null())
        .map(|(key, value)| (key.to_string(), value))
        .collect();
    PostHogLogEvent {
        level,
        message,
        attributes,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    run_application(None);
}

fn run_application(smoke: Option<mvp_smoke::SmokeOptions>) {
    let setup_smoke = smoke.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let data_dir = setup_smoke
                .as_ref()
                .map(mvp_smoke::SmokeOptions::data_directory)
                .map(Ok)
                .unwrap_or_else(|| app.path().app_data_dir())?;
            if setup_smoke
                .as_ref()
                .is_some_and(|options| !options.is_cleanup())
                && data_dir.exists()
            {
                local_sessions::mark_interrupted(&data_dir).map_err(std::io::Error::other)?;
                std::fs::remove_dir_all(&data_dir)?;
            }
            std::fs::create_dir_all(data_dir.join("sessions"))?;
            std::fs::create_dir_all(data_dir.join("worktrees"))?;
            local_sessions::mark_interrupted(&data_dir).map_err(std::io::Error::other)?;
            app.manage(AppState {
                data_dir,
                cancelled: Arc::new(Mutex::new(HashSet::new())),
                active: Arc::new(Mutex::new(HashSet::new())),
                codex: AsyncMutex::new(None),
                browsers: Arc::new(AsyncMutex::new(HashMap::new())),
                implementation_engine: Arc::new(CodexImplementationEngine::new(
                    app.handle().clone(),
                )),
                smoke_auto_approve: setup_smoke.is_some(),
            });
            if let Some(options) = setup_smoke.clone() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let result = mvp_smoke::execute(&app_handle, &options).await;
                    let exit_code = match result {
                        Ok(()) => 0,
                        Err(error) => {
                            eprintln!("{error}");
                            1
                        }
                    };
                    app_handle.exit(exit_code);
                });
                return Ok(());
            }
            let show = MenuItem::with_id(app, "show", "Show Code", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
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
                    "quit" => {
                        let state = app.state::<AppState>();
                        let active = state
                            .active
                            .lock()
                            .map(|sessions| !sessions.is_empty())
                            .unwrap_or(true);
                        if active {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            let _ = app.emit("quit-confirmation-required", ());
                        } else {
                            app.exit(0);
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let active = state
                    .active
                    .lock()
                    .map(|sessions| !sessions.is_empty())
                    .unwrap_or(true);
                if active {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            engine_health,
            start_codex_login,
            install_verifier_runtime,
            local_sessions::list_repositories,
            local_sessions::register_repository,
            local_sessions::refresh_repository,
            local_sessions::list_repository_targets,
            local_sessions::scan_repository_targets,
            local_sessions::save_repository_targets,
            local_sessions::propose_repository_policy,
            local_sessions::approve_repository_policy,
            local_sessions::list_change_sessions,
            local_sessions::get_change_session,
            local_sessions::start_change_session,
            local_sessions::continue_change_session,
            local_sessions::verify_change_session,
            local_sessions::cancel_change_session,
            local_sessions::accept_change_session,
            local_sessions::export_evidence_report,
            local_sessions::discard_change_session,
            local_sessions::resolve_session_approval,
            read_artifact,
            reveal_artifact,
            quit_application
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Code desktop");
}

pub fn run_mvp_smoke(arguments: &[String]) {
    let options = match mvp_smoke::SmokeOptions::parse(arguments) {
        Ok(options) => options,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    };
    run_application(Some(options));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("code-desktop-test-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn telemetry_payloads_only_include_allowlisted_metadata() {
        let event = posthog_log_event(
            PostHogLogLevel::Error,
            "codex request failed",
            [
                ("operation", json!("turn/start")),
                ("errorCategory", json!("timeout")),
                ("prompt", json!("private prompt")),
                ("path", json!("/private/repository")),
                ("output", json!("private command output")),
            ],
        );
        let value = serde_json::to_value(event).unwrap();

        assert_eq!(value["attributes"]["operation"], "turn/start");
        assert_eq!(value["attributes"]["errorCategory"], "timeout");
        assert!(value["attributes"].get("prompt").is_none());
        assert!(value["attributes"].get("path").is_none());
        assert!(value["attributes"].get("output").is_none());
    }

    #[test]
    fn codex_client_only_restarts_for_transport_failures() {
        assert!(codex_error_requires_restart("Codex app-server stopped"));
        assert!(codex_error_requires_restart("thread/read timed out"));
        assert!(codex_error_requires_restart("broken pipe"));
        assert!(!codex_error_requires_restart(
            "rollout at /tmp/thread.jsonl is empty"
        ));
        assert!(!codex_error_requires_restart("approval declined"));
    }

    #[test]
    fn artifact_paths_are_confined_to_session_storage() {
        let data_dir = temporary_data_dir();
        let session_dir = data_dir.join("sessions/session-1");
        std::fs::create_dir_all(&session_dir).unwrap();
        let artifact = session_dir.join("change.patch");
        std::fs::write(&artifact, "diff").unwrap();
        let outside = data_dir.join("outside.txt");
        std::fs::write(&outside, "private").unwrap();

        assert_eq!(
            confined_artifact_path(&data_dir, artifact.to_str().unwrap()).unwrap(),
            artifact.canonicalize().unwrap()
        );
        assert!(confined_artifact_path(&data_dir, outside.to_str().unwrap()).is_err());
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn stalled_codex_requests_time_out() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let (_sender, receiver) = oneshot::channel();
        let error = runtime
            .block_on(await_codex_response(
                receiver,
                "thread/start",
                Duration::from_millis(1),
            ))
            .unwrap_err();

        assert_eq!(
            error,
            "Codex request `thread/start` timed out after 0 seconds"
        );
    }

    #[cfg(unix)]
    #[test]
    fn codex_executable_falls_back_to_editor_extensions() {
        let home = temporary_data_dir();
        let codex = home.join(".cursor/extensions/openai.chatgpt-1.2.3/bin/macos-aarch64/codex");
        std::fs::create_dir_all(codex.parent().unwrap()).unwrap();
        std::fs::write(&codex, "").unwrap();
        let mut permissions = std::fs::metadata(&codex).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&codex, permissions).unwrap();

        assert_eq!(
            resolve_codex_executable(Some(OsStr::new("")), Some(home.as_os_str())),
            Some(codex)
        );
        std::fs::remove_dir_all(home).unwrap();
    }
}

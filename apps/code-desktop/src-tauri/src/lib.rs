use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env,
    ffi::OsStr,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex as AsyncMutex},
    time::{sleep, timeout},
};
use uuid::Uuid;
use walkdir::WalkDir;

const KEYCHAIN_SERVICE: &str = "dev.root.code";
const KEYCHAIN_ACCOUNT: &str = "workos-refresh-token";
const REFRESH_TOKEN_FILE: &str = "workos-refresh-token";
const VERIFICATION_IMAGE: &str = "code-agent-verifier:1";
const MAX_ATTEMPTS: u32 = 5;
const MAX_RUN_TIME: Duration = Duration::from_secs(30 * 60);
const CODEX_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

struct AppState {
    data_dir: PathBuf,
    access_token: Mutex<Option<CachedToken>>,
    refresh_token: Mutex<Option<String>>,
    cancelled: Mutex<HashSet<String>>,
    active: Mutex<HashSet<String>>,
    codex: AsyncMutex<Option<CodexClient>>,
}

struct CodexClient {
    _child: Child,
    stdin: ChildStdin,
    pending: std::sync::Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    next_id: u64,
}

struct CachedToken {
    value: String,
    expires_at: Instant,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineHealth {
    available: bool,
    version: Option<String>,
    authenticated: bool,
    docker_available: bool,
    detail: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StartLocalRunInput {
    run_id: String,
    task: String,
    base_commit_sha: String,
    manifest: VerificationManifest,
    repo: CloneSource,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CloneSource {
    clone_url: String,
    token: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VerificationManifest {
    version: u8,
    runtime: Value,
    gates: BTreeMap<String, VerificationCommand>,
    app_server: Option<AppServerConfig>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VerificationCommand {
    command: String,
    args: Vec<String>,
    timeout_ms: u64,
    required: bool,
    env: Option<BTreeMap<String, String>>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppServerConfig {
    command: String,
    args: Vec<String>,
    timeout_ms: u64,
    health_url: String,
    health_timeout_ms: u64,
    env: Option<BTreeMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceAuthorization {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Deserialize)]
struct WorkosDeviceAuthorization {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: String,
    expires_in: u64,
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct WorkosTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct LocalArtifactIndex {
    run_id: String,
    patch_path: Option<String>,
    logs: Vec<String>,
    screenshots: Vec<String>,
    trace_paths: Vec<String>,
    assertions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalEvent {
    id: i64,
    kind: String,
    message: String,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalRunRecord {
    run_id: String,
    status: String,
    base_commit_sha: String,
    codex_thread_id: Option<String>,
    terminal_reason: Option<String>,
    artifacts: LocalArtifactIndex,
    events: Vec<LocalEvent>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum SyncEvent {
    Transition {
        run_id: String,
        status: String,
        attempt: Option<u32>,
    },
    Gate {
        run_id: String,
        kind: String,
        status: String,
        required: bool,
        attempt: u32,
        duration_ms: u64,
        exit_code: Option<i32>,
    },
    Completed {
        run_id: String,
        status: String,
        changed_file_count: usize,
        has_local_patch: bool,
        terminal_reason: Option<String>,
    },
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
enum PostHogLogLevel {
    Info,
    Warn,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PostHogLogEvent {
    level: PostHogLogLevel,
    message: &'static str,
    attributes: BTreeMap<String, Value>,
}

struct ProcessResult {
    exit_code: Option<i32>,
    output: String,
    timed_out: bool,
    cancelled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatThread {
    id: String,
    provider: String,
    provider_thread_id: String,
    cwd: String,
    title: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateChatThreadInput {
    provider: String,
    cwd: String,
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
    let docker = command_ok(Path::new("docker"), &["info"]).await
        && command_ok(
            Path::new("docker"),
            &["image", "inspect", VERIFICATION_IMAGE],
        )
        .await;
    let authenticated = login.as_ref().is_ok_and(|text| {
        let text = text.to_ascii_lowercase();
        text.contains("logged in") && text.contains("chatgpt")
    });
    let detail = if version.is_none() {
        Some("Install the official Codex CLI before starting a run.".to_string())
    } else if !authenticated {
        Some("Run `codex login` and authenticate with ChatGPT.".to_string())
    } else if !docker {
        Some(format!(
            "Start Docker Desktop and build the pinned `{VERIFICATION_IMAGE}` image."
        ))
    } else {
        None
    };
    EngineHealth {
        available: version.is_some() && authenticated && docker,
        version,
        authenticated,
        docker_available: docker,
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
async fn begin_auth() -> Result<DeviceAuthorization, String> {
    let client_id = workos_client_id()?;
    let response = reqwest::Client::new()
        .post("https://api.workos.com/user_management/authorize/device")
        .form(&[("client_id", client_id)])
        .send()
        .await
        .map_err(display_error)?
        .error_for_status()
        .map_err(display_error)?
        .json::<WorkosDeviceAuthorization>()
        .await
        .map_err(display_error)?;
    Ok(DeviceAuthorization {
        device_code: response.device_code,
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        verification_uri_complete: response.verification_uri_complete,
        expires_in: response.expires_in,
        interval: response.interval.unwrap_or(5),
    })
}

#[tauri::command]
async fn poll_auth(
    app: AppHandle,
    state: State<'_, AppState>,
    device_code: String,
    interval: u64,
    expires_in: u64,
) -> Result<(), String> {
    let client_id = workos_client_id()?;
    let deadline = Instant::now() + Duration::from_secs(expires_in);
    while Instant::now() < deadline {
        let response = reqwest::Client::new()
            .post("https://api.workos.com/user_management/authenticate")
            .form(&[
                ("client_id", client_id.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("device_code", device_code.as_str()),
            ])
            .send()
            .await
            .map_err(display_error)?;
        if response.status().is_success() {
            let token = response
                .json::<WorkosTokenResponse>()
                .await
                .map_err(display_error)?;
            store_token(&state, token)?;
            app.emit("auth-changed", true).map_err(display_error)?;
            return Ok(());
        }
        if response.status().as_u16() != 400 {
            return Err(format!(
                "WorkOS authentication failed: {}",
                response.status()
            ));
        }
        sleep(Duration::from_secs(interval.max(1))).await;
    }
    Err("WorkOS device authorization expired".to_string())
}

#[tauri::command]
async fn get_access_token(
    state: State<'_, AppState>,
    force_refresh: bool,
) -> Result<String, String> {
    if !force_refresh {
        if let Some(token) = state.access_token.lock().map_err(display_error)?.as_ref() {
            if token.expires_at > Instant::now() + Duration::from_secs(30) {
                return Ok(token.value.clone());
            }
        }
    }
    let refresh_token = restore_refresh_token(&state.data_dir, &state.refresh_token)?;
    let token = reqwest::Client::new()
        .post("https://api.workos.com/user_management/authenticate")
        .form(&[
            ("client_id", workos_client_id()?),
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(display_error)?
        .error_for_status()
        .map_err(display_error)?
        .json::<WorkosTokenResponse>()
        .await
        .map_err(display_error)?;
    let access = token.access_token.clone();
    store_token(&state, token)?;
    Ok(access)
}

#[tauri::command]
fn logout(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    delete_refresh_token(&state.data_dir)?;
    *state.access_token.lock().map_err(display_error)? = None;
    *state.refresh_token.lock().map_err(display_error)? = None;
    app.emit("auth-changed", false).map_err(display_error)
}

#[tauri::command]
async fn installation_id(state: State<'_, AppState>) -> Result<String, String> {
    let path = state.data_dir.join("installation-id");
    if let Ok(value) = fs::read_to_string(&path).await {
        return Ok(value.trim().to_string());
    }
    let value = Uuid::new_v4().to_string();
    fs::write(path, &value).await.map_err(display_error)?;
    Ok(value)
}

#[tauri::command]
async fn start_local_run(
    app: AppHandle,
    state: State<'_, AppState>,
    input: StartLocalRunInput,
) -> Result<(), String> {
    if state
        .active
        .lock()
        .map_err(display_error)?
        .contains(&input.run_id)
    {
        return Err("Run is already active".to_string());
    }
    initialize_run(&state.data_dir, &input)?;
    state
        .active
        .lock()
        .map_err(display_error)?
        .insert(input.run_id.clone());
    let data_dir = state.data_dir.clone();
    let run_id = input.run_id.clone();
    emit_posthog_log(
        &app,
        PostHogLogLevel::Info,
        "local run started",
        [
            ("operation", json!("start")),
            ("runId", json!(input.run_id)),
            ("status", json!("queued")),
        ],
    );
    tauri::async_runtime::spawn(async move {
        let started = Instant::now();
        if let Err(error) = execute_run(&app, &data_dir, &input).await {
            let cancelled = is_cancelled(&app, &run_id);
            let status = if cancelled { "cancelled" } else { "failed" };
            emit_posthog_log(
                &app,
                if cancelled {
                    PostHogLogLevel::Warn
                } else {
                    PostHogLogLevel::Error
                },
                "local run completed",
                [
                    ("runId", json!(run_id)),
                    ("status", json!(status)),
                    ("durationMs", json!(started.elapsed().as_millis() as u64)),
                    ("errorCategory", json!(error_category(&error))),
                ],
            );
            let _ = update_run(&data_dir, &run_id, status, Some(&error), None);
            let _ = app.emit(
                "local-run-sync",
                SyncEvent::Completed {
                    run_id: run_id.clone(),
                    status: status.to_string(),
                    changed_file_count: 0,
                    has_local_patch: false,
                    terminal_reason: Some(error),
                },
            );
        }
        let state = app.state::<AppState>();
        if let Ok(mut active) = state.active.lock() {
            active.remove(&run_id);
        }
        if let Ok(mut cancelled) = state.cancelled.lock() {
            cancelled.remove(&run_id);
        };
    });
    Ok(())
}

#[tauri::command]
fn cancel_local_run(
    app: AppHandle,
    state: State<'_, AppState>,
    run_id: String,
) -> Result<(), String> {
    emit_posthog_log(
        &app,
        PostHogLogLevel::Warn,
        "local run cancellation requested",
        [("operation", json!("cancel")), ("runId", json!(run_id))],
    );
    state
        .cancelled
        .lock()
        .map_err(display_error)?
        .insert(run_id);
    Ok(())
}

#[tauri::command]
fn get_local_run(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<Option<LocalRunRecord>, String> {
    load_run(&state.data_dir, &run_id)
}

#[tauri::command]
async fn read_artifact(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let path = confined_artifact_path(&state.data_dir, &path)?;
    fs::read_to_string(path).await.map_err(display_error)
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
        return Err("A local run is still active".to_string());
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn list_chat_threads(state: State<'_, AppState>) -> Result<Vec<ChatThread>, String> {
    load_chat_threads(&state.data_dir)
}

#[tauri::command]
async fn create_chat_thread(
    app: AppHandle,
    state: State<'_, AppState>,
    input: CreateChatThreadInput,
) -> Result<ChatThread, String> {
    if input.provider != "codex" {
        return Err(format!("Unsupported chat provider: {}", input.provider));
    }
    let cwd = PathBuf::from(&input.cwd)
        .canonicalize()
        .map_err(display_error)?;
    if !cwd.is_dir() {
        return Err("Chat workspace must be a directory".to_string());
    }
    let response = codex_request(
        &app,
        &state,
        "thread/start",
        json!({
            "cwd": cwd,
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "sandbox": "workspace-write",
            "serviceName": "code-desktop",
            "threadSource": "user"
        }),
    )
    .await?;
    let provider_thread_id = response
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex did not return a thread id".to_string())?
        .to_string();
    let now = now_ms();
    let thread = ChatThread {
        id: Uuid::new_v4().to_string(),
        provider: input.provider,
        provider_thread_id,
        cwd: cwd.to_string_lossy().into_owned(),
        title: "New chat".to_string(),
        created_at: now,
        updated_at: now,
    };
    insert_chat_thread(&state.data_dir, &thread)?;
    Ok(thread)
}

#[tauri::command]
async fn read_chat_thread(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Value, String> {
    let thread = load_chat_thread(&state.data_dir, &thread_id)?
        .ok_or_else(|| "Chat thread not found".to_string())?;
    codex_request(
        &app,
        &state,
        "thread/resume",
        json!({
            "threadId": thread.provider_thread_id,
            "cwd": thread.cwd,
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "sandbox": "workspace-write"
        }),
    )
    .await?;
    codex_request(
        &app,
        &state,
        "thread/read",
        json!({ "threadId": thread.provider_thread_id, "includeTurns": true }),
    )
    .await
}

#[tauri::command]
async fn send_chat_message(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    text: String,
) -> Result<Value, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("Message cannot be empty".to_string());
    }
    let mut thread = load_chat_thread(&state.data_dir, &thread_id)?
        .ok_or_else(|| "Chat thread not found".to_string())?;
    if thread.title == "New chat" {
        thread.title = chat_title(text);
        update_chat_thread_title(&state.data_dir, &thread.id, &thread.title)?;
        let _ = codex_request(
            &app,
            &state,
            "thread/name/set",
            json!({ "threadId": thread.provider_thread_id, "name": thread.title }),
        )
        .await;
    } else {
        touch_chat_thread(&state.data_dir, &thread.id)?;
    }
    codex_request(
        &app,
        &state,
        "turn/start",
        json!({
            "threadId": thread.provider_thread_id,
            "input": [{ "type": "text", "text": text, "text_elements": [] }],
            "cwd": thread.cwd,
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user"
        }),
    )
    .await
}

#[tauri::command]
async fn interrupt_chat_turn(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    turn_id: String,
) -> Result<(), String> {
    let thread = load_chat_thread(&state.data_dir, &thread_id)?
        .ok_or_else(|| "Chat thread not found".to_string())?;
    codex_request(
        &app,
        &state,
        "turn/interrupt",
        json!({ "threadId": thread.provider_thread_id, "turnId": turn_id }),
    )
    .await?;
    Ok(())
}

#[tauri::command]
async fn resolve_chat_approval(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: Value,
    method: String,
    decision: String,
) -> Result<(), String> {
    let result = match method.as_str() {
        "item/commandExecution/requestApproval" => json!({ "decision": decision }),
        "item/fileChange/requestApproval" => json!({ "decision": decision }),
        _ => return Err(format!("Unsupported approval request: {method}")),
    };
    codex_respond(&app, &state, request_id, result).await
}

#[tauri::command]
async fn archive_chat_thread(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<(), String> {
    let thread = load_chat_thread(&state.data_dir, &thread_id)?
        .ok_or_else(|| "Chat thread not found".to_string())?;
    codex_request(
        &app,
        &state,
        "thread/archive",
        json!({ "threadId": thread.provider_thread_id }),
    )
    .await?;
    database(&state.data_dir)?
        .execute("DELETE FROM chat_threads WHERE id = ?1", [&thread_id])
        .map_err(display_error)?;
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
            *guard = None;
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
        emit_posthog_log(
            app,
            PostHogLogLevel::Error,
            "codex request failed",
            [
                ("operation", json!("approval-response")),
                ("errorCategory", json!("operation_failed")),
            ],
        );
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
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex app-server stdin unavailable".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app-server stdout unavailable".to_string())?;
    let pending: std::sync::Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>> =
        std::sync::Arc::new(Mutex::new(HashMap::new()));
    let reader_pending = pending.clone();
    let reader_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let response_id = message.get("id").and_then(Value::as_u64);
            let is_response = message.get("result").is_some() || message.get("error").is_some();
            if is_response {
                if let Some(id) = response_id {
                    let sender = reader_pending
                        .lock()
                        .ok()
                        .and_then(|mut pending| pending.remove(&id));
                    if let Some(sender) = sender {
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
            }
            let _ = reader_app.emit("chat-event", message);
        }
        if let Ok(mut pending) = reader_pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err("Codex app-server stopped".to_string()));
            }
        }
        let _ = reader_app.emit(
            "chat-event",
            json!({ "method": "error", "params": { "message": "Codex app-server stopped" } }),
        );
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
                }
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
        self.stdin
            .write_all(format!("{message}\n").as_bytes())
            .await
            .map_err(display_error)?;
        self.stdin.flush().await.map_err(display_error)
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

async fn execute_run(
    app: &AppHandle,
    data_dir: &Path,
    input: &StartLocalRunInput,
) -> Result<(), String> {
    let started = Instant::now();
    transition(app, data_dir, &input.run_id, "preparing", None)?;
    let run_dir = data_dir.join("runs").join(&input.run_id);
    let checkout = run_dir.join("checkout");
    clone_checkout(app, input, &checkout).await?;
    write_manifest(&checkout, &input.manifest).await?;

    transition(app, data_dir, &input.run_id, "implementing", Some(1))?;
    run_codex(app, data_dir, input, &checkout, &input.task, started).await?;

    let mut last_failure = String::new();
    let mut verified = false;
    for attempt in 1..=MAX_ATTEMPTS {
        if started.elapsed() >= MAX_RUN_TIME {
            return Err("Run exceeded the 30 minute wall-time limit".to_string());
        }
        transition(app, data_dir, &input.run_id, "verifying", Some(attempt))?;
        let failures = run_gates(app, data_dir, input, &checkout, attempt, started).await?;
        if failures.is_empty() {
            verified = true;
            break;
        }
        last_failure = failures.join("\n\n");
        if attempt == MAX_ATTEMPTS {
            break;
        }
        transition(app, data_dir, &input.run_id, "repairing", Some(attempt + 1))?;
        let repair_prompt = format!(
            "The authoritative Docker verification gates failed. Repair the implementation without weakening or skipping tests.\n\n{}",
            last_failure
        );
        run_codex(app, data_dir, input, &checkout, &repair_prompt, started).await?;
    }

    let (patch_path, changed_file_count) =
        generate_patch(app, data_dir, &input.run_id, &checkout, started).await?;
    collect_evidence(data_dir, &input.run_id, &checkout)?;
    let has_patch = patch_path.is_some();
    let (status, reason) = if verified && has_patch {
        ("verified", None)
    } else if verified {
        (
            "failed",
            Some("Codex produced no repository changes".to_string()),
        )
    } else {
        ("failed", Some(last_failure))
    };
    update_run(data_dir, &input.run_id, status, reason.as_deref(), None)?;
    app.emit(
        "local-run-sync",
        SyncEvent::Completed {
            run_id: input.run_id.clone(),
            status: status.to_string(),
            changed_file_count,
            has_local_patch: has_patch,
            terminal_reason: reason,
        },
    )
    .map_err(display_error)?;
    emit_posthog_log(
        app,
        if status == "verified" {
            PostHogLogLevel::Info
        } else {
            PostHogLogLevel::Warn
        },
        "local run completed",
        [
            ("runId", json!(input.run_id)),
            ("status", json!(status)),
            ("durationMs", json!(started.elapsed().as_millis() as u64)),
            ("changedFileCount", json!(changed_file_count)),
            ("hasLocalPatch", json!(has_patch)),
        ],
    );
    Ok(())
}

async fn clone_checkout(
    app: &AppHandle,
    input: &StartLocalRunInput,
    checkout: &Path,
) -> Result<(), String> {
    if checkout.exists() {
        fs::remove_dir_all(checkout).await.map_err(display_error)?;
    }
    let mut args = vec!["clone".to_string(), "--no-checkout".to_string()];
    if let Some(token) = &input.repo.token {
        args.push("-c".to_string());
        args.push(format!("http.extraHeader=Authorization: Bearer {}", token));
    }
    args.push(input.repo.clone_url.clone());
    args.push(checkout.to_string_lossy().into_owned());
    let clone = run_process(
        app,
        &input.run_id,
        "git",
        &args,
        None,
        None,
        Duration::from_secs(180),
    )
    .await?;
    ensure_success("Repository clone", &clone)?;
    let checkout_result = run_process(
        app,
        &input.run_id,
        "git",
        &[
            "checkout".to_string(),
            "--detach".to_string(),
            input.base_commit_sha.clone(),
        ],
        Some(checkout),
        None,
        Duration::from_secs(60),
    )
    .await?;
    ensure_success("Exact-SHA checkout", &checkout_result)?;
    Ok(())
}

async fn run_codex(
    app: &AppHandle,
    data_dir: &Path,
    input: &StartLocalRunInput,
    checkout: &Path,
    prompt: &str,
    started: Instant,
) -> Result<(), String> {
    let remaining = MAX_RUN_TIME
        .checked_sub(started.elapsed())
        .ok_or_else(|| "Run exceeded the wall-time limit".to_string())?;
    let mut child = Command::new(codex_executable()?);
    child
        .args([
            "exec",
            "--json",
            "--ephemeral",
            "--sandbox",
            "workspace-write",
            prompt,
        ])
        .current_dir(checkout)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = child.spawn().map_err(display_error)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Codex stderr unavailable".to_string())?;
    let app_for_stdout = app.clone();
    let data_for_stdout = data_dir.to_path_buf();
    let run_for_stdout = input.run_id.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let message = codex_event_message(&line);
            let _ = append_event(&data_for_stdout, &run_for_stdout, "codex", &message);
            let _ = app_for_stdout.emit("local-run-event", json!({ "runId": run_for_stdout }));
        }
    });
    let stderr_task = tokio::spawn(async move {
        let mut text = String::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_string(&mut text).await;
        text
    });

    let deadline = Instant::now() + remaining;
    let status = loop {
        if is_cancelled(app, &input.run_id) {
            let _ = child.kill().await;
            return Err("Run cancelled".to_string());
        }
        if Instant::now() >= deadline {
            let _ = child.kill().await;
            return Err("Codex turn exceeded the run wall-time limit".to_string());
        }
        if let Some(status) = child.try_wait().map_err(display_error)? {
            break status;
        }
        sleep(Duration::from_millis(200)).await;
    };
    let _ = stdout_task.await;
    let stderr = stderr_task.await.unwrap_or_default();
    if !status.success() {
        return Err(format!("Codex failed: {}", trim_output(&stderr)));
    }
    Ok(())
}

async fn run_gates(
    app: &AppHandle,
    data_dir: &Path,
    input: &StartLocalRunInput,
    checkout: &Path,
    attempt: u32,
    started: Instant,
) -> Result<Vec<String>, String> {
    const GATE_ORDER: [&str; 8] = [
        "install",
        "typecheck",
        "lint",
        "build",
        "unit",
        "integration",
        "authSetup",
        "browser",
    ];
    let mut failures = Vec::new();
    for kind in GATE_ORDER {
        let Some(gate) = input.manifest.gates.get(kind) else {
            continue;
        };
        if is_cancelled(app, &input.run_id) {
            return Err("Run cancelled".to_string());
        }
        let remaining = MAX_RUN_TIME
            .checked_sub(started.elapsed())
            .ok_or_else(|| "Run exceeded the wall-time limit".to_string())?;
        let gate_timeout = Duration::from_millis(gate.timeout_ms).min(remaining);
        let log_path = data_dir
            .join("runs")
            .join(&input.run_id)
            .join("logs")
            .join(format!("attempt-{attempt}-{kind}.log"));
        let mut args = restricted_docker_args(checkout);
        for (name, value) in gate.env.as_ref().into_iter().flatten() {
            args.extend(["-e".to_string(), format!("{name}={value}")]);
        }
        args.push(VERIFICATION_IMAGE.to_string());
        args.push(gate.command.clone());
        args.extend(gate.args.clone());
        let gate_started = Instant::now();
        let result = if kind == "browser" {
            if let Some(server) = &input.manifest.app_server {
                run_browser_gate(
                    app,
                    &input.run_id,
                    checkout,
                    attempt,
                    server,
                    gate,
                    gate_timeout,
                )
                .await?
            } else {
                run_process(
                    app,
                    &input.run_id,
                    "docker",
                    &args,
                    None,
                    None,
                    gate_timeout,
                )
                .await?
            }
        } else {
            run_process(
                app,
                &input.run_id,
                "docker",
                &args,
                None,
                None,
                gate_timeout,
            )
            .await?
        };
        fs::write(&log_path, &result.output)
            .await
            .map_err(display_error)?;
        let passed = result.exit_code == Some(0) && !result.timed_out && !result.cancelled;
        let status = if passed { "passed" } else { "failed" };
        let duration_ms = gate_started.elapsed().as_millis() as u64;
        emit_posthog_log(
            app,
            if passed {
                PostHogLogLevel::Info
            } else {
                PostHogLogLevel::Warn
            },
            "local run gate completed",
            [
                ("runId", json!(input.run_id)),
                ("gate", json!(kind)),
                ("status", json!(status)),
                ("required", json!(gate.required)),
                ("attempt", json!(attempt)),
                ("durationMs", json!(duration_ms)),
                ("exitCode", json!(result.exit_code)),
            ],
        );
        append_event(
            data_dir,
            &input.run_id,
            "gate",
            &format!("{kind} {status} on attempt {attempt}"),
        )?;
        app.emit(
            "local-run-sync",
            SyncEvent::Gate {
                run_id: input.run_id.clone(),
                kind: kind.to_string(),
                status: status.to_string(),
                required: gate.required,
                attempt,
                duration_ms,
                exit_code: result.exit_code,
            },
        )
        .map_err(display_error)?;
        app.emit("local-run-event", json!({ "runId": input.run_id }))
            .map_err(display_error)?;
        if gate.required && !passed {
            failures.push(format!(
                "Gate `{kind}` failed (exit {:?}).\n{}",
                result.exit_code,
                trim_output(&result.output)
            ));
        }
    }
    Ok(failures)
}

async fn run_browser_gate(
    app: &AppHandle,
    run_id: &str,
    checkout: &Path,
    attempt: u32,
    server: &AppServerConfig,
    gate: &VerificationCommand,
    gate_timeout: Duration,
) -> Result<ProcessResult, String> {
    let name = format!(
        "code-{}-{attempt}-server",
        run_id
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .take(24)
            .collect::<String>()
    );
    let mut start_args = restricted_docker_args(checkout);
    start_args.extend(["-d".to_string(), "--name".to_string(), name.clone()]);
    for (key, value) in server.env.as_ref().into_iter().flatten() {
        start_args.extend(["-e".to_string(), format!("{key}={value}")]);
    }
    start_args.push(VERIFICATION_IMAGE.to_string());
    start_args.push(server.command.clone());
    start_args.extend(server.args.clone());
    let start = run_process(
        app,
        run_id,
        "docker",
        &start_args,
        None,
        None,
        Duration::from_secs(30),
    )
    .await?;
    ensure_success("Application server start", &start)?;

    let health_deadline =
        Instant::now() + Duration::from_millis(server.health_timeout_ms.min(server.timeout_ms));
    let health_error = loop {
        let health = run_process(
            app,
            run_id,
            "docker",
            &[
                "exec".to_string(),
                name.clone(),
                "curl".to_string(),
                "-fsS".to_string(),
                server.health_url.clone(),
            ],
            None,
            None,
            Duration::from_secs(10),
        )
        .await?;
        if health.exit_code == Some(0) {
            break None;
        }
        if health.cancelled || Instant::now() >= health_deadline {
            break Some(format!(
                "Application health check failed: {}",
                trim_output(&health.output)
            ));
        }
        sleep(Duration::from_millis(500)).await;
    };

    let mut result = if let Some(error) = health_error {
        ProcessResult {
            exit_code: None,
            output: error,
            timed_out: false,
            cancelled: is_cancelled(app, run_id),
        }
    } else {
        let mut args = vec!["exec".to_string()];
        for (key, value) in gate.env.as_ref().into_iter().flatten() {
            args.extend(["-e".to_string(), format!("{key}={value}")]);
        }
        args.push(name.clone());
        args.push(gate.command.clone());
        args.extend(gate.args.clone());
        run_process(app, run_id, "docker", &args, None, None, gate_timeout).await?
    };
    let cleanup_run_id = format!("{run_id}-cleanup");
    if let Ok(logs) = run_process(
        app,
        &cleanup_run_id,
        "docker",
        &["logs".to_string(), name.clone()],
        None,
        None,
        Duration::from_secs(10),
    )
    .await
    {
        result.output.push_str("\n\nApplication server:\n");
        result.output.push_str(&logs.output);
    }
    let _ = run_process(
        app,
        &cleanup_run_id,
        "docker",
        &["rm".to_string(), "-f".to_string(), name],
        None,
        None,
        Duration::from_secs(15),
    )
    .await;
    Ok(result)
}

fn restricted_docker_args(checkout: &Path) -> Vec<String> {
    vec![
        "run".to_string(),
        "--rm".to_string(),
        "--init".to_string(),
        "--cpus".to_string(),
        "4".to_string(),
        "--memory".to_string(),
        "8g".to_string(),
        "--pids-limit".to_string(),
        "512".to_string(),
        "--security-opt".to_string(),
        "no-new-privileges".to_string(),
        "--user".to_string(),
        "1000:1000".to_string(),
        "-e".to_string(),
        "HOME=/tmp".to_string(),
        "-v".to_string(),
        format!("{}:/workspace", checkout.display()),
        "-w".to_string(),
        "/workspace".to_string(),
    ]
}

async fn write_manifest(checkout: &Path, manifest: &VerificationManifest) -> Result<(), String> {
    let directory = checkout.join(".code-agent");
    fs::create_dir_all(&directory)
        .await
        .map_err(display_error)?;
    let contents = serde_json::to_string_pretty(manifest).map_err(display_error)?;
    fs::write(directory.join("verify.json"), format!("{contents}\n"))
        .await
        .map_err(display_error)
}

async fn generate_patch(
    app: &AppHandle,
    data_dir: &Path,
    run_id: &str,
    checkout: &Path,
    started: Instant,
) -> Result<(Option<PathBuf>, usize), String> {
    let add = run_process(
        app,
        run_id,
        "git",
        &["add".to_string(), "-N".to_string(), ".".to_string()],
        Some(checkout),
        None,
        Duration::from_secs(30),
    )
    .await?;
    ensure_success("Patch preparation", &add)?;
    let patch = run_process(
        app,
        run_id,
        "git",
        &[
            "diff".to_string(),
            "--binary".to_string(),
            "HEAD".to_string(),
        ],
        Some(checkout),
        None,
        MAX_RUN_TIME
            .checked_sub(started.elapsed())
            .unwrap_or(Duration::from_secs(1)),
    )
    .await?;
    ensure_success("Patch generation", &patch)?;
    let names = run_process(
        app,
        run_id,
        "git",
        &[
            "diff".to_string(),
            "--name-only".to_string(),
            "HEAD".to_string(),
        ],
        Some(checkout),
        None,
        Duration::from_secs(30),
    )
    .await?;
    ensure_success("Changed-file summary", &names)?;
    let changed = names
        .output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();
    if patch.output.trim().is_empty() {
        return Ok((None, changed));
    }
    let path = data_dir.join("runs").join(run_id).join("change.patch");
    fs::write(&path, patch.output)
        .await
        .map_err(display_error)?;
    update_run(data_dir, run_id, "verifying", None, Some(&path))?;
    Ok((Some(path), changed))
}

async fn run_process(
    app: &AppHandle,
    run_id: &str,
    program: &str,
    args: &[String],
    cwd: Option<&Path>,
    env: Option<&BTreeMap<String, String>>,
    duration: Duration,
) -> Result<ProcessResult, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    if let Some(env) = env {
        command.envs(env);
    }
    let mut child = command.spawn().map_err(display_error)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Process stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Process stderr unavailable".to_string())?;
    let stdout_task = tokio::spawn(read_stream(stdout));
    let stderr_task = tokio::spawn(read_stream(stderr));
    let deadline = Instant::now() + duration;
    let (exit_code, timed_out, cancelled) = loop {
        if is_cancelled(app, run_id) {
            let _ = child.kill().await;
            break (None, false, true);
        }
        if Instant::now() >= deadline {
            let _ = child.kill().await;
            break (None, true, false);
        }
        if let Some(status) = child.try_wait().map_err(display_error)? {
            break (status.code(), false, false);
        }
        sleep(Duration::from_millis(200)).await;
    };
    let stdout = stdout_task.await.unwrap_or_default();
    let stderr = stderr_task.await.unwrap_or_default();
    let mut output = format!("{stdout}{stderr}");
    if timed_out {
        output.push_str("\nProcess timed out and was terminated");
    } else if cancelled {
        output.push_str("\nProcess was cancelled and terminated");
    }
    Ok(ProcessResult {
        exit_code,
        output,
        timed_out,
        cancelled,
    })
}

async fn read_stream<R>(mut reader: R) -> String
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut output = String::new();
    let _ = reader.read_to_string(&mut output).await;
    output
}

fn initialize_run(data_dir: &Path, input: &StartLocalRunInput) -> Result<(), String> {
    let run_dir = data_dir.join("runs").join(&input.run_id);
    std::fs::create_dir_all(run_dir.join("logs")).map_err(display_error)?;
    let connection = database(data_dir)?;
    connection
        .execute(
            "INSERT INTO local_runs
             (run_id, status, base_commit_sha, started_at)
             VALUES (?1, 'queued', ?2, ?3)",
            params![input.run_id, input.base_commit_sha, now_ms()],
        )
        .map_err(display_error)?;
    append_event(data_dir, &input.run_id, "lifecycle", "Run queued locally")
}

fn transition(
    app: &AppHandle,
    data_dir: &Path,
    run_id: &str,
    status: &str,
    attempt: Option<u32>,
) -> Result<(), String> {
    emit_posthog_log(
        app,
        PostHogLogLevel::Info,
        "local run transitioned",
        [
            ("runId", json!(run_id)),
            ("status", json!(status)),
            ("attempt", json!(attempt)),
        ],
    );
    update_run(data_dir, run_id, status, None, None)?;
    append_event(
        data_dir,
        run_id,
        "lifecycle",
        &format!("Run entered {status}"),
    )?;
    app.emit(
        "local-run-sync",
        SyncEvent::Transition {
            run_id: run_id.to_string(),
            status: status.to_string(),
            attempt,
        },
    )
    .map_err(display_error)?;
    app.emit("local-run-event", json!({ "runId": run_id }))
        .map_err(display_error)
}

fn update_run(
    data_dir: &Path,
    run_id: &str,
    status: &str,
    terminal_reason: Option<&str>,
    patch_path: Option<&Path>,
) -> Result<(), String> {
    let connection = database(data_dir)?;
    connection
        .execute(
            "UPDATE local_runs SET
               status = ?2,
               terminal_reason = COALESCE(?3, terminal_reason),
               patch_path = COALESCE(?4, patch_path),
               finished_at = CASE WHEN ?2 IN ('verified','failed','cancelled','needs_input')
                 THEN ?5 ELSE finished_at END
             WHERE run_id = ?1",
            params![
                run_id,
                status,
                terminal_reason,
                patch_path.map(|path| path.to_string_lossy().into_owned()),
                now_ms()
            ],
        )
        .map_err(display_error)?;
    Ok(())
}

fn append_event(data_dir: &Path, run_id: &str, kind: &str, message: &str) -> Result<(), String> {
    database(data_dir)?
        .execute(
            "INSERT INTO local_events (run_id, kind, message, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![run_id, kind, message, now_ms()],
        )
        .map_err(display_error)?;
    Ok(())
}

fn load_run(data_dir: &Path, run_id: &str) -> Result<Option<LocalRunRecord>, String> {
    let connection = database(data_dir)?;
    let run = connection
        .query_row(
            "SELECT status, base_commit_sha, codex_thread_id, terminal_reason, patch_path
             FROM local_runs WHERE run_id = ?1",
            [run_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(display_error)?;
    let Some((status, base_commit_sha, codex_thread_id, terminal_reason, patch_path)) = run else {
        return Ok(None);
    };
    let mut statement = connection
        .prepare(
            "SELECT id, kind, message, created_at FROM local_events
             WHERE run_id = ?1 ORDER BY id ASC",
        )
        .map_err(display_error)?;
    let events = statement
        .query_map([run_id], |row| {
            Ok(LocalEvent {
                id: row.get(0)?,
                kind: row.get(1)?,
                message: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    let artifacts = artifact_index(data_dir, run_id, patch_path.map(PathBuf::from));
    Ok(Some(LocalRunRecord {
        run_id: run_id.to_string(),
        status,
        base_commit_sha,
        codex_thread_id,
        terminal_reason,
        artifacts,
        events,
    }))
}

fn artifact_index(
    data_dir: &Path,
    run_id: &str,
    patch_path: Option<PathBuf>,
) -> LocalArtifactIndex {
    let root = data_dir.join("runs").join(run_id);
    let mut index = LocalArtifactIndex {
        run_id: run_id.to_string(),
        patch_path: patch_path.map(|path| path.to_string_lossy().into_owned()),
        ..Default::default()
    };
    for entry in WalkDir::new(&root).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path().to_string_lossy().into_owned();
        match entry.path().extension().and_then(|value| value.to_str()) {
            Some("log") => index.logs.push(path),
            Some("png") | Some("jpg") | Some("jpeg") => index.screenshots.push(path),
            Some("zip") => index.trace_paths.push(path),
            Some("json") if path.contains("assert") => index.assertions.push(path),
            _ => {}
        }
    }
    index
}

fn collect_evidence(data_dir: &Path, run_id: &str, checkout: &Path) -> Result<(), String> {
    let destination = data_dir.join("runs").join(run_id).join("evidence");
    std::fs::create_dir_all(&destination).map_err(display_error)?;
    for entry in WalkDir::new(checkout).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let extension = entry.path().extension().and_then(|value| value.to_str());
        if !matches!(extension, Some("png" | "jpg" | "jpeg" | "zip")) {
            continue;
        }
        let relative = entry.path().strip_prefix(checkout).map_err(display_error)?;
        let target = destination.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(display_error)?;
        }
        std::fs::copy(entry.path(), target).map_err(display_error)?;
    }
    Ok(())
}

fn database(data_dir: &Path) -> Result<Connection, String> {
    let connection =
        Connection::open(data_dir.join("code-desktop.sqlite")).map_err(display_error)?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS local_runs (
               run_id TEXT PRIMARY KEY,
               status TEXT NOT NULL,
               base_commit_sha TEXT NOT NULL,
               codex_thread_id TEXT,
               terminal_reason TEXT,
               patch_path TEXT,
               started_at INTEGER NOT NULL,
               finished_at INTEGER
             );
             CREATE TABLE IF NOT EXISTS local_events (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               run_id TEXT NOT NULL,
               kind TEXT NOT NULL,
               message TEXT NOT NULL,
               created_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS local_events_by_run
               ON local_events(run_id, id);
             CREATE TABLE IF NOT EXISTS chat_threads (
               id TEXT PRIMARY KEY,
               provider TEXT NOT NULL,
               provider_thread_id TEXT NOT NULL UNIQUE,
               cwd TEXT NOT NULL,
               title TEXT NOT NULL,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS chat_threads_by_updated
               ON chat_threads(updated_at DESC);",
        )
        .map_err(display_error)?;
    Ok(connection)
}

fn insert_chat_thread(data_dir: &Path, thread: &ChatThread) -> Result<(), String> {
    database(data_dir)?
        .execute(
            "INSERT INTO chat_threads
             (id, provider, provider_thread_id, cwd, title, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                thread.id,
                thread.provider,
                thread.provider_thread_id,
                thread.cwd,
                thread.title,
                thread.created_at,
                thread.updated_at
            ],
        )
        .map_err(display_error)?;
    Ok(())
}

fn load_chat_threads(data_dir: &Path) -> Result<Vec<ChatThread>, String> {
    let connection = database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT id, provider, provider_thread_id, cwd, title, created_at, updated_at
             FROM chat_threads ORDER BY updated_at DESC",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok(ChatThread {
                id: row.get(0)?,
                provider: row.get(1)?,
                provider_thread_id: row.get(2)?,
                cwd: row.get(3)?,
                title: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(display_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(display_error)
}

fn load_chat_thread(data_dir: &Path, id: &str) -> Result<Option<ChatThread>, String> {
    database(data_dir)?
        .query_row(
            "SELECT id, provider, provider_thread_id, cwd, title, created_at, updated_at
             FROM chat_threads WHERE id = ?1",
            [id],
            |row| {
                Ok(ChatThread {
                    id: row.get(0)?,
                    provider: row.get(1)?,
                    provider_thread_id: row.get(2)?,
                    cwd: row.get(3)?,
                    title: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(display_error)
}

fn update_chat_thread_title(data_dir: &Path, id: &str, title: &str) -> Result<(), String> {
    database(data_dir)?
        .execute(
            "UPDATE chat_threads SET title = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, title, now_ms()],
        )
        .map_err(display_error)?;
    Ok(())
}

fn touch_chat_thread(data_dir: &Path, id: &str) -> Result<(), String> {
    database(data_dir)?
        .execute(
            "UPDATE chat_threads SET updated_at = ?2 WHERE id = ?1",
            params![id, now_ms()],
        )
        .map_err(display_error)?;
    Ok(())
}

fn chat_title(text: &str) -> String {
    const LIMIT: usize = 60;
    let mut title = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.chars().count() > LIMIT {
        title = title.chars().take(LIMIT - 3).collect::<String>() + "...";
    }
    title
}

fn mark_interrupted(data_dir: &Path) -> Result<(), String> {
    database(data_dir)?
        .execute(
            "UPDATE local_runs SET status = 'needs_input',
             terminal_reason = 'Desktop process stopped before the run completed',
             finished_at = ?1
             WHERE status IN ('queued','preparing','implementing','verifying','repairing')",
            [now_ms()],
        )
        .map_err(display_error)?;
    Ok(())
}

fn confined_artifact_path(data_dir: &Path, raw_path: &str) -> Result<PathBuf, String> {
    let artifact_root = data_dir.join("runs");
    let path = PathBuf::from(raw_path);
    let canonical_root = artifact_root.canonicalize().map_err(display_error)?;
    let canonical_path = path.canonicalize().map_err(display_error)?;
    if !canonical_path.starts_with(canonical_root) {
        return Err("Artifact path is outside app-managed storage".to_string());
    }
    Ok(canonical_path)
}

fn store_token(state: &AppState, token: WorkosTokenResponse) -> Result<(), String> {
    if let Some(refresh_token) = token.refresh_token {
        persist_refresh_token(&state.data_dir, &refresh_token)?;
        *state.refresh_token.lock().map_err(display_error)? = Some(refresh_token);
    }
    *state.access_token.lock().map_err(display_error)? = Some(CachedToken {
        value: token.access_token,
        expires_at: Instant::now() + Duration::from_secs(token.expires_in.unwrap_or(900)),
    });
    Ok(())
}

fn keychain() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(display_error)
}

fn load_refresh_token(data_dir: &Path) -> Result<String, String> {
    if keychain_enabled() {
        return keychain()?.get_password().map_err(display_error);
    }
    std::fs::read_to_string(data_dir.join(REFRESH_TOKEN_FILE)).map_err(display_error)
}

fn restore_refresh_token(
    data_dir: &Path,
    refresh_token: &Mutex<Option<String>>,
) -> Result<String, String> {
    let cached = {
        let guard = refresh_token.lock().map_err(display_error)?;
        guard.clone()
    };
    if let Some(token) = cached {
        return Ok(token);
    }

    let token = load_refresh_token(data_dir)?;
    *refresh_token.lock().map_err(display_error)? = Some(token.clone());
    Ok(token)
}

fn persist_refresh_token(data_dir: &Path, refresh_token: &str) -> Result<(), String> {
    if keychain_enabled() {
        return keychain()?
            .set_password(refresh_token)
            .map_err(display_error);
    }

    let path = data_dir.join(REFRESH_TOKEN_FILE);
    let temporary_path = data_dir.join(format!("{REFRESH_TOKEN_FILE}.tmp"));
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(&temporary_path).map_err(display_error)?;
    #[cfg(unix)]
    file.set_permissions(std::fs::Permissions::from_mode(0o600))
        .map_err(display_error)?;
    file.write_all(refresh_token.as_bytes())
        .map_err(display_error)?;
    file.sync_all().map_err(display_error)?;
    std::fs::rename(temporary_path, path).map_err(display_error)
}

fn delete_refresh_token(data_dir: &Path) -> Result<(), String> {
    if keychain_enabled() {
        return match keychain()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(display_error(error)),
        };
    }

    match std::fs::remove_file(data_dir.join(REFRESH_TOKEN_FILE)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(display_error(error)),
    }
}

fn keychain_enabled() -> bool {
    option_env!("CODE_DESKTOP_KEYCHAIN") == Some("1")
}

fn workos_client_id() -> Result<String, String> {
    resolve_workos_client_id(
        std::env::var("WORKOS_CLIENT_ID").ok(),
        std::env::var("VITE_WORKOS_CLIENT_ID").ok(),
        option_env!("WORKOS_CLIENT_ID"),
    )
}

fn resolve_workos_client_id(
    workos_client_id: Option<String>,
    vite_workos_client_id: Option<String>,
    compiled_client_id: Option<&str>,
) -> Result<String, String> {
    [workos_client_id, vite_workos_client_id]
        .into_iter()
        .flatten()
        .chain(compiled_client_id.map(str::to_owned))
        .find(|value| !value.trim().is_empty())
        .ok_or_else(|| "WORKOS_CLIENT_ID is not configured for the desktop app".to_string())
}

fn is_cancelled(app: &AppHandle, run_id: &str) -> bool {
    app.state::<AppState>()
        .cancelled
        .lock()
        .map(|runs| runs.contains(run_id))
        .unwrap_or(true)
}

fn ensure_success(label: &str, result: &ProcessResult) -> Result<(), String> {
    if result.exit_code == Some(0) && !result.timed_out && !result.cancelled {
        Ok(())
    } else {
        Err(format!("{label} failed: {}", trim_output(&result.output)))
    }
}

fn codex_event_message(line: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return line.to_string();
    };
    value
        .pointer("/item/text")
        .or_else(|| value.get("message"))
        .or_else(|| value.get("type"))
        .and_then(Value::as_str)
        .unwrap_or(line)
        .to_string()
}

fn trim_output(value: &str) -> String {
    const LIMIT: usize = 8_000;
    let text = value.trim();
    let start = text
        .char_indices()
        .rev()
        .nth(LIMIT - 1)
        .map_or(0, |(index, _)| index);
    text[start..].to_string()
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

    let mut extension_candidates = Vec::new();
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
                extension_candidates.push(candidate.to_path_buf());
            }
        }
    }
    extension_candidates.sort();
    extension_candidates.pop()
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
    const ALLOWED_ATTRIBUTES: [&str; 11] = [
        "attempt",
        "changedFileCount",
        "durationMs",
        "errorCategory",
        "exitCode",
        "gate",
        "hasLocalPatch",
        "operation",
        "required",
        "runId",
        "status",
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(data_dir.join("runs"))?;
            mark_interrupted(&data_dir).map_err(std::io::Error::other)?;
            app.manage(AppState {
                data_dir,
                access_token: Mutex::new(None),
                refresh_token: Mutex::new(None),
                cancelled: Mutex::new(HashSet::new()),
                active: Mutex::new(HashSet::new()),
                codex: AsyncMutex::new(None),
            });
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
                            .map(|runs| !runs.is_empty())
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
                    .map(|runs| !runs.is_empty())
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
            begin_auth,
            poll_auth,
            get_access_token,
            logout,
            installation_id,
            start_local_run,
            cancel_local_run,
            get_local_run,
            list_chat_threads,
            create_chat_thread,
            read_chat_thread,
            send_chat_message,
            interrupt_chat_turn,
            resolve_chat_approval,
            archive_chat_thread,
            read_artifact,
            reveal_artifact,
            quit_application
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Code desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("code-desktop-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn posthog_log_payloads_only_include_allowlisted_metadata() {
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

        assert_eq!(value["message"], "codex request failed");
        assert_eq!(value["attributes"]["operation"], "turn/start");
        assert_eq!(value["attributes"]["errorCategory"], "timeout");
        assert!(value["attributes"].get("prompt").is_none());
        assert!(value["attributes"].get("path").is_none());
        assert!(value["attributes"].get("output").is_none());
    }

    #[test]
    fn chat_threads_are_app_owned_and_sorted_by_recent_activity() {
        let data_dir = temporary_data_dir();
        std::fs::create_dir_all(&data_dir).unwrap();
        let first = ChatThread {
            id: "chat-1".to_string(),
            provider: "codex".to_string(),
            provider_thread_id: "provider-1".to_string(),
            cwd: "/tmp/one".to_string(),
            title: "First".to_string(),
            created_at: 1,
            updated_at: 1,
        };
        let second = ChatThread {
            id: "chat-2".to_string(),
            provider: "codex".to_string(),
            provider_thread_id: "provider-2".to_string(),
            cwd: "/tmp/two".to_string(),
            title: "Second".to_string(),
            created_at: 2,
            updated_at: 2,
        };
        insert_chat_thread(&data_dir, &first).unwrap();
        insert_chat_thread(&data_dir, &second).unwrap();

        let threads = load_chat_threads(&data_dir).unwrap();
        assert_eq!(threads[0].id, "chat-2");
        assert_eq!(threads[1].id, "chat-1");
        assert!(load_chat_thread(&data_dir, "missing").unwrap().is_none());
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn chat_titles_are_compact() {
        let title = chat_title(
            "Please inspect the repository and explain every important architectural decision in detail",
        );
        assert!(title.chars().count() <= 60);
        assert!(title.ends_with("..."));
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

    #[test]
    fn successful_command_text_falls_back_to_stderr() {
        assert_eq!(
            successful_command_text(b"", b"Logged in using ChatGPT\n"),
            "Logged in using ChatGPT"
        );
        assert_eq!(
            successful_command_text(b"codex-cli 0.136.0\n", b"warning\n"),
            "codex-cli 0.136.0"
        );
    }

    #[test]
    fn interrupted_runs_are_recoverable_instead_of_resumed() {
        let data_dir = temporary_data_dir();
        std::fs::create_dir_all(&data_dir).unwrap();
        let connection = database(&data_dir).unwrap();
        connection
            .execute(
                "INSERT INTO local_runs
                 (run_id, status, base_commit_sha, started_at)
                 VALUES ('run-1', 'implementing', 'abc123', 1)",
                [],
            )
            .unwrap();
        drop(connection);

        mark_interrupted(&data_dir).unwrap();
        let run = load_run(&data_dir, "run-1").unwrap().unwrap();

        assert_eq!(run.status, "needs_input");
        assert!(run.terminal_reason.unwrap().contains("stopped"));
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn codex_jsonl_events_prefer_human_readable_content() {
        assert_eq!(
            codex_event_message(r#"{"type":"item.completed","item":{"text":"Done"}}"#),
            "Done"
        );
        assert_eq!(
            codex_event_message(r#"{"type":"turn.started"}"#),
            "turn.started"
        );
    }

    #[test]
    fn long_output_is_trimmed_on_utf8_boundaries() {
        let output = "ø".repeat(9_000);
        let trimmed = trim_output(&output);
        assert!(trimmed.chars().count() <= 8_000);
        assert!(trimmed.is_char_boundary(0));
    }

    #[test]
    fn workos_client_id_prefers_runtime_configuration() {
        assert_eq!(
            resolve_workos_client_id(
                Some("runtime".to_string()),
                Some("vite".to_string()),
                Some("compiled"),
            ),
            Ok("runtime".to_string())
        );
        assert_eq!(
            resolve_workos_client_id(None, Some("vite".to_string()), Some("compiled")),
            Ok("vite".to_string())
        );
        assert_eq!(
            resolve_workos_client_id(None, None, Some("compiled")),
            Ok("compiled".to_string())
        );
        assert_eq!(
            resolve_workos_client_id(Some(String::new()), None, Some("compiled")),
            Ok("compiled".to_string())
        );
    }

    #[test]
    fn workos_client_id_reports_missing_configuration() {
        assert_eq!(
            resolve_workos_client_id(None, None, None),
            Err("WORKOS_CLIENT_ID is not configured for the desktop app".to_string())
        );
    }

    #[test]
    fn refresh_token_file_round_trips_without_keychain() {
        if keychain_enabled() {
            return;
        }

        let data_dir = temporary_data_dir();
        std::fs::create_dir_all(&data_dir).unwrap();

        persist_refresh_token(&data_dir, "refresh-token").unwrap();

        assert_eq!(
            load_refresh_token(&data_dir),
            Ok("refresh-token".to_string())
        );
        delete_refresh_token(&data_dir).unwrap();
        assert!(!data_dir.join(REFRESH_TOKEN_FILE).exists());
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn refresh_token_restoration_populates_an_empty_memory_cache() {
        if keychain_enabled() {
            return;
        }

        let data_dir = temporary_data_dir();
        std::fs::create_dir_all(&data_dir).unwrap();
        persist_refresh_token(&data_dir, "persisted-token").unwrap();
        let cached_token = Mutex::new(None);

        assert_eq!(
            restore_refresh_token(&data_dir, &cached_token),
            Ok("persisted-token".to_string())
        );
        assert_eq!(
            cached_token.lock().unwrap().as_deref(),
            Some("persisted-token")
        );
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refresh_token_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        if keychain_enabled() {
            return;
        }

        let data_dir = temporary_data_dir();
        std::fs::create_dir_all(&data_dir).unwrap();

        persist_refresh_token(&data_dir, "refresh-token").unwrap();

        let mode = std::fs::metadata(data_dir.join(REFRESH_TOKEN_FILE))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
        std::fs::remove_dir_all(data_dir).unwrap();
    }
}

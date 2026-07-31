use std::{
    collections::HashMap,
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};

use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{broadcast, oneshot, Mutex as AsyncMutex},
    time::timeout,
};

use super::{compatibility, discovery};
use crate::generated_apps::AppToolRuntime;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

type PendingResponse = oneshot::Sender<Result<Value, String>>;
type PendingRequests = Arc<Mutex<HashMap<u64, PendingResponse>>>;

pub(crate) struct CodexClient {
    _child: Child,
    stdin: Arc<AsyncMutex<ChildStdin>>,
    pending: PendingRequests,
    notifications: broadcast::Sender<Value>,
    next_id: u64,
}

impl CodexClient {
    pub(super) async fn start(app_tools: AppToolRuntime) -> Result<Self, String> {
        let executable = discovery::executable()?;
        compatibility::verify(&executable).await?;
        let mut child = Command::new(executable)
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
        let pending: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
        let reader_pending = pending.clone();
        let (notifications, _) = broadcast::channel(256);
        let reader_notifications = notifications.clone();
        let reader_stdin = stdin.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    tracing::debug!("ignored a non-JSON Codex app-server message");
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
                        let result = match app_tools.handle_tool_call(&message) {
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
                let _ = reader_notifications.send(message);
            }
            if let Ok(mut pending) = reader_pending.lock() {
                for (_, sender) in pending.drain() {
                    let _ = sender.send(Err("Codex app-server stopped".to_string()));
                }
            }
            let _ = reader_notifications.send(json!({ "method": "server/stopped" }));
            tracing::warn!(
                target: crate::logging::EXTERNAL_EVENT_TARGET,
                event = "codex_app_server_stopped"
            );
        });

        let mut client = Self {
            _child: child,
            stdin,
            pending,
            notifications,
            next_id: 1,
        };
        client
            .request(
                "initialize",
                json!({
                    "clientInfo": {
                        "name": "austi_desktop",
                        "title": "Austi Desktop",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "capabilities": { "experimentalApi": true }
                }),
            )
            .await?;
        client
            .write(&json!({ "method": "initialized", "params": {} }))
            .await?;
        tracing::info!(
            target: crate::logging::EXTERNAL_EVENT_TARGET,
            event = "codex_app_server_started"
        );
        Ok(client)
    }

    pub(super) fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.notifications.subscribe()
    }

    pub(super) async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
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
        let result = timeout(REQUEST_TIMEOUT, receiver)
            .await
            .map_err(|_| format!("Codex request `{method}` timed out"))?
            .map_err(|_| "Codex response channel closed".to_string())?;
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&id);
        }
        result
    }

    pub(super) async fn respond(&self, id: Value, result: Value) -> Result<(), String> {
        self.write(&json!({ "id": id, "result": result })).await
    }

    async fn write(&self, message: &Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(format!("{message}\n").as_bytes())
            .await
            .map_err(display_error)?;
        stdin.flush().await.map_err(display_error)
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

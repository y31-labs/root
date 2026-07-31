use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::{process::Command, time::timeout};

use super::discovery;

const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Deserialize)]
struct RawMcpServer {
    name: String,
    enabled: bool,
    auth_status: String,
    transport: RawMcpTransport,
}

#[derive(Deserialize)]
struct RawMcpTransport {
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct McpServerSummary {
    name: String,
    enabled: bool,
    authentication: &'static str,
    transport: String,
}

#[tauri::command]
pub(crate) async fn list_mcp_servers() -> Result<Vec<McpServerSummary>, String> {
    let output = Command::new(discovery::executable()?)
        .args(["mcp", "list", "--json"])
        .kill_on_drop(true)
        .output()
        .await
        .map_err(display_error)?;
    if !output.status.success() {
        return Err(command_error(
            &output.stderr,
            "Codex could not list MCP integrations.",
        ));
    }
    let servers: Vec<RawMcpServer> =
        serde_json::from_slice(&output.stdout).map_err(display_error)?;
    Ok(servers
        .into_iter()
        .map(|server| McpServerSummary {
            name: server.name,
            enabled: server.enabled,
            authentication: if server.auth_status == "o_auth" {
                "oauth"
            } else {
                "none"
            },
            transport: server.transport.kind,
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn connect_mcp_server(
    state: tauri::State<'_, crate::AppState>,
    name: String,
) -> Result<(), String> {
    let name = name.trim();
    let server = list_mcp_servers()
        .await?
        .into_iter()
        .find(|server| server.name == name)
        .ok_or_else(|| "The requested MCP integration is not configured in Codex.".to_string())?;
    if !server.enabled {
        return Err("Enable this MCP integration in Codex before connecting it.".to_string());
    }
    if server.authentication != "oauth" {
        return Err("This MCP integration does not support Codex OAuth login.".to_string());
    }

    let output = timeout(
        LOGIN_TIMEOUT,
        Command::new(discovery::executable()?)
            .args(["mcp", "login", name])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| "MCP authentication timed out after five minutes.".to_string())?
    .map_err(display_error)?;
    if !output.status.success() {
        return Err(command_error(
            &output.stderr,
            "Codex could not authenticate the MCP integration.",
        ));
    }
    super::session::request(&state, "config/mcpServer/reload", json!({})).await?;
    Ok(())
}

pub(crate) async fn call_mcp_tool(
    state: &crate::AppState,
    thread_id: &str,
    server: &str,
    tool: &str,
    arguments: Value,
) -> Result<Value, String> {
    let response = super::session::request(
        state,
        "mcpServer/tool/call",
        json!({
            "threadId": thread_id,
            "server": server,
            "tool": tool,
            "arguments": arguments
        }),
    )
    .await?;
    if response.get("isError").and_then(Value::as_bool) == Some(true) {
        let detail = response
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(if detail.is_empty() {
            "The MCP tool returned an error.".to_string()
        } else {
            detail
        });
    }
    Ok(response)
}

fn command_error(stderr: &[u8], fallback: &str) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    if message.is_empty() {
        fallback.to_string()
    } else {
        message
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

use serde_json::{json, Value};
use tauri::State;

use super::{
    discovery,
    session::{request, require_chatgpt_account},
    types::{CodexIntegrationStatus, Model},
};
use crate::AppState;

#[tauri::command]
pub(crate) async fn codex_integration_status(
    state: State<'_, AppState>,
) -> Result<CodexIntegrationStatus, String> {
    let executable = match discovery::executable() {
        Ok(executable) => executable,
        Err(error) => return Ok(unavailable_status(false, None, error)),
    };
    let version = match discovery::command_text(&executable, &["--version"]).await {
        Ok(version) => version,
        Err(error) => {
            return Ok(unavailable_status(
                true,
                None,
                format!("Codex version could not be read: {error}"),
            ));
        }
    };
    let account = match request(&state, "account/read", json!({})).await {
        Ok(response) => response.get("account").cloned().unwrap_or(Value::Null),
        Err(error) => {
            tracing::warn!(error = %error, "Codex integration status request failed");
            return Ok(unavailable_status(
                true,
                Some(version),
                format!("Codex app-server is unavailable: {error}"),
            ));
        }
    };
    let account_type = account.get("type").and_then(Value::as_str);
    let authenticated = account_type == Some("chatgpt");
    let detail = match account_type {
        Some("chatgpt") => None,
        Some("apiKey") => Some(
            "Codex is using an API key. Connect with ChatGPT to use your Codex plan.".to_string(),
        ),
        _ => Some("Connect Codex with ChatGPT to start a local text session.".to_string()),
    };

    Ok(CodexIntegrationStatus {
        installed: true,
        authenticated,
        app_server_available: true,
        connected: authenticated,
        version: Some(version),
        account_email: account
            .get("email")
            .and_then(Value::as_str)
            .map(str::to_string),
        plan_type: account
            .get("planType")
            .and_then(Value::as_str)
            .map(str::to_string),
        detail,
    })
}

fn unavailable_status(
    installed: bool,
    version: Option<String>,
    detail: String,
) -> CodexIntegrationStatus {
    CodexIntegrationStatus {
        installed,
        authenticated: false,
        app_server_available: false,
        connected: false,
        version,
        account_email: None,
        plan_type: None,
        detail: Some(detail),
    }
}

#[tauri::command]
pub(crate) async fn connect_codex(state: State<'_, AppState>) -> Result<(), String> {
    let response = request(&state, "account/login/start", json!({ "type": "chatgpt" })).await?;
    let auth_url = response
        .get("authUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex did not return a ChatGPT sign-in URL".to_string())?;
    discovery::open_url(auth_url)?;
    tracing::info!(
        target: crate::logging::EXTERNAL_EVENT_TARGET,
        event = "codex_login_started"
    );
    Ok(())
}

#[tauri::command]
pub(crate) async fn list_codex_models(state: State<'_, AppState>) -> Result<Vec<Model>, String> {
    require_chatgpt_account(&state).await?;
    let mut models = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let response = request(
            &state,
            "model/list",
            json!({ "cursor": cursor, "includeHidden": false }),
        )
        .await?;
        let page = response
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| "Provider returned an invalid model catalog".to_string())?;
        models.extend(
            page.iter()
                .cloned()
                .map(serde_json::from_value)
                .collect::<Result<Vec<Model>, _>>()
                .map_err(display_error)?,
        );
        cursor = response
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string);
        if cursor.is_none() {
            return Ok(models);
        }
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

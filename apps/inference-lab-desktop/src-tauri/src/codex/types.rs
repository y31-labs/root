use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexIntegrationStatus {
    pub(super) installed: bool,
    pub(super) authenticated: bool,
    pub(super) app_server_available: bool,
    pub(super) connected: bool,
    pub(super) version: Option<String>,
    pub(super) account_email: Option<String>,
    pub(super) plan_type: Option<String>,
    pub(super) detail: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexTextInput {
    pub(super) prompt: String,
    pub(super) thread_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum CodexStreamEvent {
    Started {
        #[serde(rename = "threadId")]
        thread_id: String,
    },
    Delta {
        text: String,
    },
    Completed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexTextResult {
    pub(super) thread_id: String,
}

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
pub(crate) struct CodexAttachmentInput {
    pub(super) data_url: String,
    pub(super) filename: String,
    pub(super) media_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexTextInput {
    pub(super) prompt: String,
    #[serde(default)]
    pub(super) attachments: Vec<CodexAttachmentInput>,
    pub(super) working_directory: Option<String>,
    pub(super) thread_id: Option<String>,
    pub(super) settings: Option<ModelSettings>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelSettings {
    pub(super) model: String,
    pub(super) effort: String,
    pub(super) service_tier: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReasoningEffort {
    pub(super) reasoning_effort: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServiceTier {
    pub(super) id: String,
    pub(super) name: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Model {
    pub(super) model: String,
    pub(super) display_name: String,
    pub(super) supported_reasoning_efforts: Vec<ReasoningEffort>,
    pub(super) default_reasoning_effort: String,
    pub(super) service_tiers: Vec<ServiceTier>,
    pub(super) default_service_tier: Option<String>,
    pub(super) is_default: bool,
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

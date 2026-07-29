use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalAppPermission {
    pub(super) capability_id: String,
    pub(super) effects: Vec<String>,
    pub(super) approval: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeneratedAppRecord {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) revision: u64,
    pub(crate) authoring_chat_id: String,
    pub(crate) authoring_thread_id: String,
    pub(crate) updated_at_ms: u64,
    pub(crate) source: String,
    pub(crate) bundle: String,
    pub(crate) permissions: Vec<LocalAppPermission>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeneratedAppSummary {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) description: String,
    pub(super) revision: u64,
    pub(super) authoring_chat_id: String,
    pub(super) updated_at_ms: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PublishAppInput {
    pub(super) app_id: String,
    pub(super) title: String,
    pub(super) description: String,
    pub(super) expected_revision: u64,
    pub(super) source: String,
    pub(super) permissions: Vec<LocalAppPermission>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InvokeCapabilityInput {
    pub(super) app_id: String,
    pub(super) revision: u64,
    pub(super) capability_id: String,
    pub(super) input: Value,
    pub(super) approved: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveGeneratedAppStateInput {
    pub(super) app_id: String,
    pub(super) revision: u64,
    pub(super) state: serde_json::Map<String, Value>,
}

use serde::{Deserialize, Deserializer, Serialize};

fn normalize_model_display_name(display_name: String) -> String {
    display_name
        .strip_prefix("GPT-")
        .unwrap_or(&display_name)
        .replace('-', " ")
}

fn deserialize_model_display_name<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    String::deserialize(deserializer).map(normalize_model_display_name)
}

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
    pub(super) speed: ModelSpeed,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum ModelSpeed {
    Standard,
    Fast,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EffortOption {
    #[serde(rename(deserialize = "reasoningEffort"))]
    pub(super) effort: String,
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
    #[serde(deserialize_with = "deserialize_model_display_name")]
    pub(super) display_name: String,
    #[serde(rename(deserialize = "supportedReasoningEfforts"))]
    pub(super) supported_efforts: Vec<EffortOption>,
    #[serde(rename(deserialize = "defaultReasoningEffort"))]
    pub(super) default_effort: String,
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

#[cfg(test)]
mod tests {
    use super::normalize_model_display_name;

    #[test]
    fn normalizes_model_display_names() {
        assert_eq!(
            normalize_model_display_name("GPT-5.6-Sol".to_string()),
            "5.6 Sol"
        );
        assert_eq!(
            normalize_model_display_name("Custom-Model".to_string()),
            "Custom Model"
        );
    }
}

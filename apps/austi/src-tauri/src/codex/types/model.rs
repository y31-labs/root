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

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelSettings {
    pub(in crate::codex) model: String,
    pub(in crate::codex) effort: String,
    pub(in crate::codex) speed: ModelSpeed,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ModelSpeed {
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

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

    #[test]
    fn rejects_unknown_model_speeds() {
        let settings = serde_json::from_value::<ModelSettings>(json!({
            "model": "gpt-5.6-terra",
            "effort": "medium",
            "speed": "turbo"
        }));

        assert!(settings.is_err());
    }

    #[test]
    fn reads_the_model_catalog_contract() {
        let model: Model = serde_json::from_value(json!({
            "id": "gpt-5.6-terra",
            "model": "gpt-5.6-terra",
            "displayName": "GPT-5.6 Terra",
            "supportedReasoningEfforts": [{
                "reasoningEffort": "medium"
            }],
            "defaultReasoningEffort": "medium",
            "serviceTiers": [{
                "id": "priority",
                "name": "Fast"
            }],
            "defaultServiceTier": null,
            "isDefault": true
        }))
        .unwrap();

        assert_eq!(model.model, "gpt-5.6-terra");
        assert_eq!(model.display_name, "5.6 Terra");
        assert_eq!(model.supported_efforts[0].effort, "medium");
        assert_eq!(model.default_effort, "medium");
        let serialized = serde_json::to_value(&model).unwrap();
        assert_eq!(
            serialized["supportedEfforts"],
            json!([{ "effort": "medium" }])
        );
        assert_eq!(serialized["defaultEffort"], "medium");
        assert_eq!(model.service_tiers[0].id, "priority");
        assert!(model.is_default);
    }
}

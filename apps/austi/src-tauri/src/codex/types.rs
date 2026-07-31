mod model;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(super) use model::ModelSpeed;
pub(crate) use model::{Model, ModelSettings};

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
    pub(super) chat_id: String,
    pub(super) assistant_message_id: String,
    pub(super) prompt: String,
    #[serde(default)]
    pub(super) attachments: Vec<CodexAttachmentInput>,
    pub(super) working_directory: Option<String>,
    pub(super) thread_id: Option<String>,
    pub(super) settings: Option<ModelSettings>,
    #[serde(default)]
    pub(super) permission_mode: PermissionMode,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexTitleInput {
    pub(super) first_prompt: String,
    #[serde(default)]
    pub(super) filenames: Vec<String>,
    pub(super) settings: Option<ModelSettings>,
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(super) enum PermissionMode {
    #[default]
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
}

impl PermissionMode {
    pub(super) fn approval_policy(self) -> &'static str {
        match self {
            Self::WorkspaceWrite => "on-request",
            Self::ReadOnly | Self::DangerFullAccess => "never",
        }
    }

    pub(super) fn sandbox(self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::WorkspaceWrite => "workspace-write",
            Self::DangerFullAccess => "danger-full-access",
        }
    }

    pub(super) fn requires_working_directory(self) -> bool {
        !matches!(self, Self::ReadOnly)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CodexApprovalDecision {
    Accept,
    AcceptForSession,
    Decline,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexActivityItem {
    pub(super) id: String,
    pub(super) label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) detail: Option<String>,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CodexActivityKind {
    Agent,
    Command,
    Error,
    File,
    Image,
    Plan,
    Tool,
    Wait,
    Web,
}

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CodexActivityStatus {
    Running,
    Succeeded,
    Failed,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum CodexStreamEvent {
    Started {
        #[serde(rename = "threadId")]
        thread_id: String,
        #[serde(rename = "turnId")]
        turn_id: String,
    },
    MessageDelta {
        id: String,
        text: String,
    },
    ReasoningDelta {
        id: String,
        #[serde(rename = "summaryIndex")]
        summary_index: usize,
        text: String,
    },
    Activity {
        id: String,
        kind: CodexActivityKind,
        label: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        items: Option<Vec<CodexActivityItem>>,
        status: CodexActivityStatus,
    },
    ActivityDelta {
        id: String,
        delta: String,
    },
    Approval {
        #[serde(rename = "requestId")]
        request_id: Value,
        method: String,
        title: String,
        detail: Option<String>,
    },
    Completed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexTextResult {
    pub(super) thread_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexRunInfo {
    pub(super) run_id: String,
    pub(super) chat_id: String,
    pub(super) thread_id: String,
    pub(super) turn_id: String,
    pub(super) assistant_message_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) model: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexRunStatus {
    #[serde(flatten)]
    pub(super) info: CodexRunInfo,
    pub(super) active: bool,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn stream_events_use_the_frontend_contract() {
        assert_eq!(
            serde_json::to_value(CodexStreamEvent::Started {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string()
            })
            .unwrap(),
            json!({ "type": "started", "threadId": "thread-1", "turnId": "turn-1" })
        );
        assert_eq!(
            serde_json::to_value(CodexStreamEvent::MessageDelta {
                id: "message-1".to_string(),
                text: "Hello".to_string()
            })
            .unwrap(),
            json!({ "type": "messageDelta", "id": "message-1", "text": "Hello" })
        );
        assert_eq!(
            serde_json::to_value(CodexStreamEvent::ReasoningDelta {
                id: "reasoning-1".to_string(),
                summary_index: 0,
                text: "Inspecting".to_string()
            })
            .unwrap(),
            json!({
                "type": "reasoningDelta",
                "id": "reasoning-1",
                "summaryIndex": 0,
                "text": "Inspecting"
            })
        );
        assert_eq!(
            serde_json::to_value(CodexStreamEvent::Activity {
                id: "command-1".to_string(),
                kind: CodexActivityKind::Command,
                label: "bun test".to_string(),
                detail: Some("12 tests passed".to_string()),
                items: None,
                status: CodexActivityStatus::Succeeded,
            })
            .unwrap(),
            json!({
                "type": "activity",
                "id": "command-1",
                "kind": "command",
                "label": "bun test",
                "detail": "12 tests passed",
                "status": "succeeded"
            })
        );
        assert_eq!(
            serde_json::to_value(CodexStreamEvent::Completed).unwrap(),
            json!({ "type": "completed" })
        );
    }
}

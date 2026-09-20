use serde_json::json;

use super::*;
use crate::codex::types::PermissionMode;

#[test]
fn applies_selected_model_settings_to_the_turn() {
    let settings = serde_json::from_value(json!({
        "model": "gpt-5.6-terra",
        "effort": "medium",
        "speed": "standard"
    }))
    .unwrap();

    assert_eq!(
        turn_start_params(
            "thread-1",
            vec![json!({ "type": "text", "text": "Hello" })],
            "/project",
            Some(settings),
            PermissionMode::ReadOnly,
        ),
        json!({
            "threadId": "thread-1",
            "input": [{ "type": "text", "text": "Hello" }],
            "cwd": "/project",
            "runtimeWorkspaceRoots": ["/project"],
            "approvalPolicy": "never",
            "approvalsReviewer": "user",
            "summary": "auto",
            "model": "gpt-5.6-terra",
            "effort": "medium",
            "serviceTier": null
        })
    );
}

#[test]
fn maps_fast_model_speed_to_the_priority_service_tier() {
    let settings = serde_json::from_value(json!({
        "model": "gpt-5.6-terra",
        "effort": "high",
        "speed": "fast"
    }))
    .unwrap();

    let params = turn_start_params(
        "thread-1",
        Vec::new(),
        "/project",
        Some(settings),
        PermissionMode::ReadOnly,
    );

    assert_eq!(params["effort"], "high");
    assert_eq!(params["serviceTier"], "priority");
}

#[test]
fn maps_permission_modes_to_sandbox_and_approval_policies() {
    assert_eq!(PermissionMode::ReadOnly.sandbox(), "read-only");
    assert_eq!(PermissionMode::ReadOnly.approval_policy(), "never");
    assert!(!PermissionMode::ReadOnly.requires_working_directory());
    assert_eq!(PermissionMode::WorkspaceWrite.sandbox(), "workspace-write");
    assert_eq!(
        PermissionMode::WorkspaceWrite.approval_policy(),
        "on-request"
    );
    assert!(PermissionMode::WorkspaceWrite.requires_working_directory());
    assert_eq!(
        PermissionMode::DangerFullAccess.sandbox(),
        "danger-full-access"
    );
    assert_eq!(PermissionMode::DangerFullAccess.approval_policy(), "never");

    let params = turn_start_params(
        "thread-1",
        Vec::new(),
        "/project",
        None,
        PermissionMode::WorkspaceWrite,
    );
    assert_eq!(params["approvalPolicy"], "on-request");
    assert_eq!(params["approvalsReviewer"], "user");
}

#[test]
fn resolves_an_absolute_working_directory() {
    let current_dir = std::env::current_dir().unwrap();

    assert_eq!(
        resolve_working_directory(current_dir.to_str(), &current_dir).unwrap(),
        current_dir.canonicalize().unwrap().to_string_lossy()
    );
}

#[test]
fn rejects_a_relative_working_directory() {
    let current_dir = std::env::current_dir().unwrap();

    assert_eq!(
        resolve_working_directory(Some("relative/project"), &current_dir),
        Err("Select an absolute working folder.".to_string())
    );
}

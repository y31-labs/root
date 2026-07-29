use std::fs;

use serde_json::json;

use super::{
    capabilities::validate_permissions,
    catalog::dynamic_tool_specs,
    now_ms,
    publishing::{compile_source, publish_app, validate_source},
    types::{LocalAppPermission, PublishAppInput},
};

fn valid_source() -> String {
    r#"import { usePersistentState } from '@y31/local-app';
import { Page, SliderField } from '@y31/local-app/ui';

export default function App() {
  const [value, setValue] = usePersistentState('value', 50);
  return <Page title="Playground"><SliderField label="Value" min={0} max={100} value={value} onChange={setValue} /></Page>;
}"#
        .to_string()
}

fn publish_input(expected_revision: u64) -> PublishAppInput {
    PublishAppInput {
        app_id: "playground".to_string(),
        title: "Playground".to_string(),
        description: "A local interactive playground.".to_string(),
        expected_revision,
        source: valid_source(),
        permissions: Vec::new(),
    }
}

#[test]
fn validates_source_imports_and_browser_boundaries() {
    assert!(validate_source(&valid_source()).is_ok());
    assert!(validate_source("import x from 'remote'; export default function App() {}").is_err());
    assert!(validate_source("export default function App() { fetch('/secret'); }").is_err());

    let directory = std::env::temp_dir().join(format!(
        "y31-source-import-test-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let invalid_export = "import { Card } from '@y31/local-app/ui'; export default function App() { return <Card />; }";
    assert!(compile_source(&directory, "invalid-import", invalid_export).is_err());
    let _ = fs::remove_dir_all(directory);
}

#[test]
fn publishes_a_flat_dynamic_tool_schema() {
    let publish_tool = dynamic_tool_specs()
        .into_iter()
        .find(|tool| tool.get("name") == Some(&json!("local_app_publish")))
        .unwrap();
    let schema = publish_tool.get("inputSchema").unwrap();
    assert!(schema["properties"]["source"].is_object());
    assert!(schema["properties"].get("properties").is_none());
}

#[test]
fn requires_user_approval_and_network_effects_for_mcp_tools() {
    let mut permission = LocalAppPermission {
        capability_id: "mcp.atlassian.search_issues".to_string(),
        effects: vec!["read".to_string(), "network".to_string()],
        approval: "first-use".to_string(),
    };
    assert!(validate_permissions(std::slice::from_ref(&permission)).is_ok());

    permission.approval = "never".to_string();
    assert!(validate_permissions(std::slice::from_ref(&permission)).is_err());
    permission.approval = "always".to_string();
    permission.effects = vec!["read".to_string()];
    assert!(validate_permissions(std::slice::from_ref(&permission)).is_err());
}

#[test]
fn publishes_compiled_immutable_revisions_owned_by_a_chat() {
    let directory = std::env::temp_dir().join(format!(
        "y31-source-app-test-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let first = publish_app(&directory, "chat-1", "thread-1", publish_input(0)).unwrap();
    assert_eq!(first.revision, 1);
    assert!(first.bundle.contains("React.createElement"));
    assert!(publish_app(&directory, "chat-2", "thread-2", publish_input(1)).is_err());
    assert!(publish_app(&directory, "chat-1", "thread-1", publish_input(0)).is_err());
    let second = publish_app(&directory, "chat-1", "thread-1", publish_input(1)).unwrap();
    assert_eq!(second.revision, 2);
    assert!(directory.join("apps/playground/versions/1.json").exists());
    assert!(directory.join("apps/playground/versions/2.json").exists());
    let _ = fs::remove_dir_all(directory);
}

use std::{
    env,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::Value;
use tokio::process::Command;

const REQUIRED_SCHEMAS: [(&str, &[&str]); 4] = [
    (
        "ClientRequest.json",
        &["config/mcpServer/reload", "mcpServer/tool/call"],
    ),
    ("ServerRequest.json", &["item/tool/call"]),
    (
        "DynamicToolCallResponse.json",
        &["contentItems", "success", "inputText"],
    ),
    (
        "v2/ThreadStartParams.json",
        &[
            "dynamicTools",
            "DynamicToolSpec",
            "name",
            "description",
            "inputSchema",
        ],
    ),
];

pub(super) async fn verify(program: &Path) -> Result<(), String> {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(display_error)?
        .as_nanos();
    let directory = env::temp_dir().join(format!(
        "austi-codex-schema-{}-{unique}",
        std::process::id()
    ));
    let output = Command::new(program)
        .args([
            "app-server",
            "generate-json-schema",
            "--experimental",
            "--out",
        ])
        .arg(&directory)
        .output()
        .await
        .map_err(display_error)?;

    let result = if output.status.success() {
        validate_schemas(&directory)
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if detail.is_empty() {
            "Codex could not generate app-server compatibility schemas.".to_string()
        } else {
            format!("Codex could not generate app-server compatibility schemas: {detail}")
        })
    };
    let _ = std::fs::remove_dir_all(directory);
    result
}

fn validate_schemas(directory: &Path) -> Result<(), String> {
    for (relative, required) in REQUIRED_SCHEMAS {
        let contents = std::fs::read_to_string(directory.join(relative))
            .map_err(|_| format!("Codex app-server schema `{relative}` is missing."))?;
        let schema: Value = serde_json::from_str(&contents)
            .map_err(|_| format!("Codex app-server schema `{relative}` is malformed."))?;
        for token in required {
            if !contains_token(&schema, token) {
                return Err(format!(
                    "Codex app-server lacks required `{token}` compatibility. Update Codex and try again."
                ));
            }
        }
    }
    Ok(())
}

fn contains_token(value: &Value, expected: &str) -> bool {
    match value {
        Value::String(value) => value == expected,
        Value::Array(values) => values.iter().any(|value| contains_token(value, expected)),
        Value::Object(values) => values
            .iter()
            .any(|(key, value)| key == expected || contains_token(value, expected)),
        _ => false,
    }
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_nested_schema_tokens() {
        let schema = serde_json::json!({ "definitions": [{ "inputSchema": "value" }] });

        assert!(contains_token(&schema, "inputSchema"));
        assert!(!contains_token(&schema, "dynamicTools"));
    }
}

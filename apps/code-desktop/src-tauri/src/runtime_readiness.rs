use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{ChildStdout, Command},
    time::{timeout, Duration},
};

use super::display_error;

const EXPECTED_SCHEMA: &str = "1";
const EXPECTED_PROTOCOL: &str = "1";
const EXPECTED_BUN: &str = "1.3.5";
const EXPECTED_PLAYWRIGHT: &str = "1.55.0";
const EXPECTED_BROWSER: &str = "chromium";
const EXPECTED_FINGERPRINT: &str =
    "sha256:46960e4bee087eeae3b22c38bb98d68565f2a91f5bf08bdadf3b26ebb3a58361";

#[derive(Deserialize)]
struct DockerImage {
    #[serde(rename = "Architecture")]
    architecture: String,
    #[serde(rename = "Config")]
    config: DockerConfig,
}

#[derive(Deserialize)]
struct DockerConfig {
    #[serde(rename = "Labels")]
    labels: Option<std::collections::HashMap<String, String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeMetadata {
    schema_version: String,
    protocol_version: String,
    architecture: String,
    bun_version: String,
    playwright_version: String,
    browser: String,
    fingerprint: String,
}

pub(crate) async fn probe_verifier_image(image: &str) -> Result<(), String> {
    if !command_success("docker", &["--version"]).await {
        return Err("Docker is not installed. Install Docker Desktop before verification.".into());
    }
    if !command_success("docker", &["info"]).await {
        return Err("Docker is stopped. Start Docker Desktop, then check again.".into());
    }

    let inspect = command_output("docker", &["image", "inspect", image])
        .await
        .map_err(|_| {
            format!(
                "The pinned verifier image `{image}` is missing. Build it with `bun run desktop:image`."
            )
        })?;
    validate_image_inspect(&inspect, expected_architecture())?;

    let metadata = command_output(
        "docker",
        &[
            "run",
            "--rm",
            "--network",
            "none",
            image,
            "sh",
            "-lc",
            "cat /opt/code-verifier/runtime-metadata.json \
             && printf '\\n%s\\n' \"$(bun --version)\" \
             && printf '%s\\n' \"$(node -p \"require('playwright/package.json').version\")\" \
             && test -x /ms-playwright/chromium-*/chrome-linux/chrome \
             && printf 'chromium-ready\\n'",
        ],
    )
    .await
    .map_err(|error| format!("The verifier image runtime probe failed: {error}"))?;
    validate_runtime_probe(&metadata, expected_architecture())
}

pub(crate) async fn install_verifier_image(
    image: &str,
    dockerfile: &Path,
    context: &Path,
) -> Result<(), String> {
    if !command_success("docker", &["--version"]).await {
        return Err("Docker is not installed. Install Docker Desktop before verification.".into());
    }
    if !command_success("docker", &["info"]).await {
        return Err("Docker is stopped. Start Docker Desktop, then try again.".into());
    }
    let output = Command::new("docker")
        .args(["build", "--tag", image, "--file"])
        .arg(dockerfile)
        .arg(context)
        .output()
        .await
        .map_err(display_error)?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "Verifier image build failed: {}",
            if detail.is_empty() {
                output.status.to_string()
            } else {
                detail
            }
        ));
    }
    probe_verifier_image(image).await
}

pub(crate) async fn probe_codex_protocol(codex: &Path) -> Result<(), String> {
    probe_codex_schemas(codex).await?;
    probe_live_codex_protocol(codex).await
}

async fn probe_codex_schemas(codex: &Path) -> Result<(), String> {
    let output_directory =
        std::env::temp_dir().join(format!("code-codex-schema-{}", uuid::Uuid::new_v4()));
    let output = Command::new(codex)
        .args(["app-server", "generate-json-schema", "--out"])
        .arg(&output_directory)
        .output()
        .await
        .map_err(display_error)?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "Update Codex: app-server protocol schemas could not be generated{}.",
            if detail.is_empty() {
                String::new()
            } else {
                format!(" ({detail})")
            }
        ));
    }

    let result = read_protocol_schemas(&output_directory).and_then(validate_protocol_schemas);
    let _ = tokio::fs::remove_dir_all(&output_directory).await;
    result
}

fn read_protocol_schemas(directory: &Path) -> Result<Vec<(PathBuf, Value)>, String> {
    let paths = [
        "ClientRequest.json",
        "ServerRequest.json",
        "DynamicToolCallResponse.json",
        "CommandExecutionRequestApprovalResponse.json",
        "FileChangeRequestApprovalResponse.json",
        "v2/ThreadStartParams.json",
    ];
    paths
        .into_iter()
        .map(|relative| {
            let path = directory.join(relative);
            let contents = std::fs::read_to_string(&path)
                .map_err(|_| format!("Update Codex: app-server schema `{relative}` is missing."))?;
            let schema = serde_json::from_str(&contents).map_err(|_| {
                format!("Update Codex: app-server schema `{relative}` is malformed.")
            })?;
            Ok((PathBuf::from(relative), schema))
        })
        .collect()
}

fn validate_protocol_schemas(schemas: Vec<(PathBuf, Value)>) -> Result<(), String> {
    let schema = |path: &str| {
        schemas
            .iter()
            .find(|(candidate, _)| candidate == Path::new(path))
            .map(|(_, value)| value)
            .ok_or_else(|| format!("Update Codex: app-server schema `{path}` is missing."))
    };
    let client = schema("ClientRequest.json")?;
    for method in [
        "thread/start",
        "thread/resume",
        "thread/read",
        "thread/archive",
        "thread/unsubscribe",
        "turn/start",
        "turn/interrupt",
    ] {
        require_schema_string(
            client,
            method,
            &format!("thread and turn lifecycle method `{method}`"),
        )?;
    }

    let server = schema("ServerRequest.json")?;
    for method in [
        "item/commandExecution/requestApproval",
        "item/fileChange/requestApproval",
    ] {
        require_schema_string(server, method, &format!("approval callback `{method}`"))?;
    }
    require_schema_string(
        server,
        "item/tool/call",
        "dynamic tool callback `item/tool/call`",
    )?;

    let thread_start = schema("v2/ThreadStartParams.json")?;
    for field in ["DynamicToolSpec", "name", "description", "inputSchema"] {
        require_schema_string(
            thread_start,
            field,
            &format!("dynamic tool registration field `{field}`"),
        )?;
    }

    let dynamic_response = schema("DynamicToolCallResponse.json")?;
    for field in [
        "contentItems",
        "success",
        "inputText",
        "inputImage",
        "imageUrl",
    ] {
        require_schema_string(
            dynamic_response,
            field,
            &format!("dynamic tool response field `{field}`"),
        )?;
    }

    for path in [
        "CommandExecutionRequestApprovalResponse.json",
        "FileChangeRequestApprovalResponse.json",
    ] {
        let approval = schema(path)?;
        for decision in ["accept", "decline", "cancel"] {
            require_schema_string(
                approval,
                decision,
                &format!("approval decision `{decision}` in `{path}`"),
            )?;
        }
    }
    Ok(())
}

fn require_schema_string(schema: &Value, expected: &str, capability: &str) -> Result<(), String> {
    if schema_contains_string(schema, expected) {
        Ok(())
    } else {
        Err(format!(
            "Update Codex: app-server lacks {capability} compatibility."
        ))
    }
}

fn schema_contains_string(value: &Value, expected: &str) -> bool {
    match value {
        Value::String(value) => value == expected,
        Value::Array(values) => values
            .iter()
            .any(|value| schema_contains_string(value, expected)),
        Value::Object(values) => values
            .iter()
            .any(|(key, value)| key == expected || schema_contains_string(value, expected)),
        _ => false,
    }
}

async fn probe_live_codex_protocol(codex: &Path) -> Result<(), String> {
    let mut child = Command::new(codex)
        .args(["app-server", "--listen", "stdio://"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(display_error)?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex app-server stdin is unavailable".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex app-server stdout is unavailable".to_string())?;
    let mut lines = BufReader::new(stdout).lines();

    let initialize = protocol_request(
        &mut stdin,
        &mut lines,
        1,
        "initialize",
        json!({
            "clientInfo": {
                "name": "code_desktop_readiness",
                "title": "Code Desktop Readiness",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": { "experimentalApi": true }
        }),
    )
    .await?;
    validate_protocol_result("initialize", &initialize)?;
    protocol_notification(&mut stdin, "initialized", json!({})).await?;

    let thread = protocol_request(
        &mut stdin,
        &mut lines,
        2,
        "thread/start",
        json!({
            "cwd": std::env::temp_dir(),
            "runtimeWorkspaceRoots": [std::env::temp_dir()],
            "approvalPolicy": "on-request",
            "approvalsReviewer": "user",
            "sandbox": "read-only",
            "serviceName": "code-desktop-readiness",
            "threadSource": "user",
            "dynamicTools": [{
                "name": "readiness_image_tool",
                "description": "Compatibility probe for a tool that can return text and image content.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }
            }]
        }),
    )
    .await?;
    validate_protocol_result("thread/start", &thread)?;
    let thread_id = thread
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex app-server lacks thread lifecycle support".to_string())?;

    let unsubscribed = protocol_request(
        &mut stdin,
        &mut lines,
        3,
        "thread/unsubscribe",
        json!({ "threadId": thread_id }),
    )
    .await?;
    validate_protocol_result("thread/unsubscribe", &unsubscribed)?;
    let _ = child.kill().await;
    Ok(())
}

async fn protocol_request(
    stdin: &mut tokio::process::ChildStdin,
    lines: &mut Lines<BufReader<ChildStdout>>,
    id: u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    stdin
        .write_all(
            format!(
                "{}\n",
                json!({ "id": id, "method": method, "params": params })
            )
            .as_bytes(),
        )
        .await
        .map_err(display_error)?;
    stdin.flush().await.map_err(display_error)?;
    timeout(Duration::from_secs(10), async {
        while let Some(line) = lines.next_line().await.map_err(display_error)? {
            let message: Value = serde_json::from_str(&line)
                .map_err(|_| "Codex app-server returned malformed JSON".to_string())?;
            if message.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }
            if let Some(error) = message.get("error") {
                return Err(format!(
                    "Codex app-server lacks `{method}` compatibility: {}",
                    error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("request failed")
                ));
            }
            return Ok(message.get("result").cloned().unwrap_or(Value::Null));
        }
        Err("Codex app-server stopped during the protocol handshake".to_string())
    })
    .await
    .map_err(|_| format!("Codex app-server `{method}` handshake timed out"))?
}

async fn protocol_notification(
    stdin: &mut tokio::process::ChildStdin,
    method: &str,
    params: Value,
) -> Result<(), String> {
    stdin
        .write_all(format!("{}\n", json!({ "method": method, "params": params })).as_bytes())
        .await
        .map_err(display_error)?;
    stdin.flush().await.map_err(display_error)
}

fn validate_protocol_result(method: &str, result: &Value) -> Result<(), String> {
    match method {
        "initialize"
            if ["codexHome", "platformFamily", "platformOs", "userAgent"]
                .into_iter()
                .all(|field| result.get(field).and_then(Value::as_str).is_some()) =>
        {
            Ok(())
        }
        "thread/start"
            if result
                .pointer("/thread/id")
                .and_then(Value::as_str)
                .is_some()
                && [
                    "approvalPolicy",
                    "approvalsReviewer",
                    "cwd",
                    "model",
                    "modelProvider",
                    "sandbox",
                ]
                .into_iter()
                .all(|field| result.get(field).is_some()) =>
        {
            Ok(())
        }
        "thread/unsubscribe" if result.is_object() => Ok(()),
        "thread/archive" if result.is_object() => Ok(()),
        _ => Err(format!(
            "Codex app-server returned an incompatible `{method}` response"
        )),
    }
}

fn validate_image_inspect(output: &str, expected_architecture: &str) -> Result<(), String> {
    let images: Vec<DockerImage> =
        serde_json::from_str(output).map_err(|_| "Docker returned malformed image metadata")?;
    let image = images
        .first()
        .ok_or_else(|| "Docker returned no verifier image metadata".to_string())?;
    if image.architecture != expected_architecture {
        return Err(format!(
            "Verifier image architecture mismatch: expected {expected_architecture}, found {}.",
            image.architecture
        ));
    }
    let labels = image
        .config
        .labels
        .as_ref()
        .ok_or_else(|| "Verifier image labels are missing".to_string())?;
    for (key, expected) in expected_labels(expected_architecture) {
        match labels.get(key) {
            Some(actual) if actual == expected => {}
            Some(actual) => {
                return Err(format!(
                "Verifier image label `{key}` mismatch: expected `{expected}`, found `{actual}`."
            ))
            }
            None => return Err(format!("Verifier image label `{key}` is missing.")),
        }
    }
    Ok(())
}

fn validate_runtime_probe(output: &str, expected_architecture: &str) -> Result<(), String> {
    let mut lines = output.lines();
    let metadata: RuntimeMetadata = serde_json::from_str(
        lines
            .next()
            .ok_or_else(|| "Verifier runtime metadata is missing".to_string())?,
    )
    .map_err(|_| "Verifier runtime metadata is malformed".to_string())?;
    let checks = [
        ("schema", metadata.schema_version.as_str(), EXPECTED_SCHEMA),
        (
            "protocol",
            metadata.protocol_version.as_str(),
            EXPECTED_PROTOCOL,
        ),
        (
            "architecture",
            metadata.architecture.as_str(),
            expected_architecture,
        ),
        ("Bun", metadata.bun_version.as_str(), EXPECTED_BUN),
        (
            "Playwright",
            metadata.playwright_version.as_str(),
            EXPECTED_PLAYWRIGHT,
        ),
        ("browser", metadata.browser.as_str(), EXPECTED_BROWSER),
        (
            "fingerprint",
            metadata.fingerprint.as_str(),
            EXPECTED_FINGERPRINT,
        ),
    ];
    for (label, actual, expected) in checks {
        if actual != expected {
            return Err(format!(
                "Verifier {label} mismatch: expected `{expected}`, found `{actual}`."
            ));
        }
    }
    if lines.next() != Some(EXPECTED_BUN) {
        return Err("Verifier Bun executable does not match its pinned metadata.".into());
    }
    if lines.next() != Some(EXPECTED_PLAYWRIGHT) {
        return Err("Verifier Playwright package does not match its pinned metadata.".into());
    }
    if lines.next() != Some("chromium-ready") {
        return Err("Verifier Chromium browser is unavailable.".into());
    }
    Ok(())
}

fn expected_labels(architecture: &str) -> [(&'static str, &str); 7] {
    [
        ("dev.root.code.verifier.schema", EXPECTED_SCHEMA),
        ("dev.root.code.verifier.protocol", EXPECTED_PROTOCOL),
        ("dev.root.code.verifier.architecture", architecture),
        ("dev.root.code.verifier.bun", EXPECTED_BUN),
        ("dev.root.code.verifier.playwright", EXPECTED_PLAYWRIGHT),
        ("dev.root.code.verifier.browser", EXPECTED_BROWSER),
        ("dev.root.code.verifier.fingerprint", EXPECTED_FINGERPRINT),
    ]
}

fn expected_architecture() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "amd64",
        architecture => architecture,
    }
}

async fn command_success(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .status()
        .await
        .is_ok_and(|status| status.success())
}

async fn command_output(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(Path::new(program))
        .args(args)
        .output()
        .await
        .map_err(display_error)?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            format!("{program} exited with {}", output.status)
        } else {
            detail
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    use serde_json::json;
    use uuid::Uuid;

    use super::*;

    fn inspect(architecture: &str, overrides: &[(&str, &str)]) -> String {
        let mut labels = expected_labels(architecture)
            .into_iter()
            .map(|(key, value)| (key.to_string(), json!(value)))
            .collect::<serde_json::Map<_, _>>();
        for (key, value) in overrides {
            labels.insert((*key).to_string(), json!(value));
        }
        json!([{
            "Architecture": architecture,
            "Config": { "Labels": labels }
        }])
        .to_string()
    }

    fn runtime_probe(overrides: &[(&str, &str)]) -> String {
        let mut metadata = json!({
            "schemaVersion": EXPECTED_SCHEMA,
            "protocolVersion": EXPECTED_PROTOCOL,
            "architecture": "arm64",
            "bunVersion": EXPECTED_BUN,
            "playwrightVersion": EXPECTED_PLAYWRIGHT,
            "browser": EXPECTED_BROWSER,
            "fingerprint": EXPECTED_FINGERPRINT
        });
        for (key, value) in overrides {
            metadata[*key] = json!(value);
        }
        format!("{metadata}\n{EXPECTED_BUN}\n{EXPECTED_PLAYWRIGHT}\nchromium-ready")
    }

    #[test]
    fn runtime_readiness_accepts_exact_image_metadata() {
        validate_image_inspect(&inspect("arm64", &[]), "arm64").unwrap();
        validate_runtime_probe(&runtime_probe(&[]), "arm64").unwrap();
    }

    #[test]
    fn runtime_readiness_rejects_wrong_architecture() {
        assert!(validate_image_inspect(&inspect("amd64", &[]), "arm64")
            .unwrap_err()
            .contains("architecture mismatch"));
    }

    #[test]
    fn runtime_readiness_rejects_modified_labels() {
        assert!(validate_image_inspect(
            &inspect("arm64", &[("dev.root.code.verifier.bun", "latest")]),
            "arm64"
        )
        .unwrap_err()
        .contains("label"));
    }

    #[test]
    fn runtime_readiness_rejects_modified_runtime_contents() {
        assert!(
            validate_runtime_probe(&runtime_probe(&[("fingerprint", "modified")]), "arm64")
                .unwrap_err()
                .contains("fingerprint")
        );
    }

    #[test]
    fn runtime_readiness_rejects_missing_browser() {
        let output = runtime_probe(&[]).replace("chromium-ready", "missing");
        assert!(validate_runtime_probe(&output, "arm64")
            .unwrap_err()
            .contains("Chromium"));
    }

    #[test]
    fn protocol_readiness_requires_each_handshake_capability() {
        assert!(validate_protocol_result(
            "initialize",
            &json!({
                "codexHome": "/tmp/codex",
                "platformFamily": "unix",
                "platformOs": "macos",
                "userAgent": "fake"
            })
        )
        .is_ok());
        assert!(validate_protocol_result("initialize", &json!({})).is_err());
        assert!(validate_protocol_result(
            "thread/start",
            &json!({
                "thread": { "id": "1" },
                "approvalPolicy": "on-request",
                "approvalsReviewer": "user",
                "cwd": "/tmp",
                "model": "fake",
                "modelProvider": "fake",
                "sandbox": {}
            })
        )
        .is_ok());
        assert!(validate_protocol_result("thread/start", &json!({})).is_err());
        assert!(validate_protocol_result("thread/unsubscribe", &json!({})).is_ok());
        assert!(validate_protocol_result("thread/unsubscribe", &Value::Null).is_err());
        assert!(validate_protocol_result("thread/archive", &json!({})).is_ok());
        assert!(validate_protocol_result("thread/archive", &Value::Null).is_err());
        assert!(validate_protocol_result("thread/archive", &json!("unsupported")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn protocol_readiness_uses_a_credential_free_fake_server() {
        let script = fake_server_script(false);
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime
            .block_on(probe_live_codex_protocol(&script))
            .unwrap();
        std::fs::remove_file(script).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn protocol_readiness_reports_a_rejected_thread_capability() {
        let script = fake_server_script(true);
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let error = runtime
            .block_on(probe_live_codex_protocol(&script))
            .unwrap_err();
        assert!(error.contains("dynamic image tools unsupported"));
        std::fs::remove_file(script).unwrap();
    }

    #[test]
    fn protocol_readiness_requires_each_schema_capability() {
        let required = [
            ("ClientRequest.json", "thread/start"),
            ("ClientRequest.json", "thread/resume"),
            ("ClientRequest.json", "thread/read"),
            ("ClientRequest.json", "thread/archive"),
            ("ClientRequest.json", "thread/unsubscribe"),
            ("ClientRequest.json", "turn/start"),
            ("ClientRequest.json", "turn/interrupt"),
            (
                "ServerRequest.json",
                "item/commandExecution/requestApproval",
            ),
            ("ServerRequest.json", "item/fileChange/requestApproval"),
            ("ServerRequest.json", "item/tool/call"),
            ("v2/ThreadStartParams.json", "DynamicToolSpec"),
            ("v2/ThreadStartParams.json", "name"),
            ("v2/ThreadStartParams.json", "description"),
            ("v2/ThreadStartParams.json", "inputSchema"),
            ("DynamicToolCallResponse.json", "contentItems"),
            ("DynamicToolCallResponse.json", "success"),
            ("DynamicToolCallResponse.json", "inputText"),
            ("DynamicToolCallResponse.json", "inputImage"),
            ("DynamicToolCallResponse.json", "imageUrl"),
            ("CommandExecutionRequestApprovalResponse.json", "accept"),
            ("CommandExecutionRequestApprovalResponse.json", "decline"),
            ("CommandExecutionRequestApprovalResponse.json", "cancel"),
            ("FileChangeRequestApprovalResponse.json", "accept"),
            ("FileChangeRequestApprovalResponse.json", "decline"),
            ("FileChangeRequestApprovalResponse.json", "cancel"),
        ];
        let compatible = protocol_schema_fixture(&required);
        validate_protocol_schemas(compatible.clone()).unwrap();

        for (path, capability) in required {
            let incompatible = compatible
                .iter()
                .map(|(candidate, schema)| {
                    if candidate == Path::new(path) {
                        (candidate.clone(), json!({ "capabilities": [] }))
                    } else {
                        (candidate.clone(), schema.clone())
                    }
                })
                .collect();
            let error = validate_protocol_schemas(incompatible).unwrap_err();
            assert!(
                error.contains("Update Codex"),
                "missing {capability} returned {error}"
            );
        }
    }

    fn protocol_schema_fixture(required: &[(&str, &str)]) -> Vec<(PathBuf, Value)> {
        let mut schemas = std::collections::BTreeMap::<PathBuf, Vec<&str>>::new();
        for (path, capability) in required {
            schemas
                .entry(PathBuf::from(path))
                .or_default()
                .push(*capability);
        }
        schemas
            .into_iter()
            .map(|(path, capabilities)| (path, json!({ "capabilities": capabilities })))
            .collect()
    }

    #[cfg(unix)]
    fn fake_server_script(reject_thread: bool) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("code-runtime-fake-{}", Uuid::new_v4()));
        let thread_response = if reject_thread {
            r#"printf '%s\n' '{"id":2,"error":{"message":"dynamic image tools unsupported"}}'"#
        } else {
            r#"printf '%s\n' '{"id":2,"result":{"thread":{"id":"thread-1"},"approvalPolicy":"on-request","approvalsReviewer":"user","cwd":"/tmp","model":"fake","modelProvider":"fake","sandbox":{}}}'"#
        };
        std::fs::write(
            &path,
            format!(
                r#"#!/bin/sh
read initialize
printf '%s' "$initialize" | grep -q '"experimentalApi":true' || exit 2
printf '%s\n' '{{"id":1,"result":{{"codexHome":"/tmp/codex","platformFamily":"unix","platformOs":"macos","userAgent":"fake"}}}}'
read initialized
read thread
printf '%s' "$thread" | grep -q '"readiness_image_tool"' || exit 3
{thread_response}
read unsubscribe
printf '%s\n' '{{"id":3,"result":{{}}}}'
"#
            ),
        )
        .unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).unwrap();
        path
    }
}

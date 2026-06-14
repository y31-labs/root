use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Command as StdCommand,
    time::{Duration, Instant},
};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::{fs, time::sleep};
use uuid::Uuid;
use walkdir::WalkDir;

use super::{
    display_error,
    local_sessions::{self, AppServerConfig, ApprovePolicyInput, StartSessionInput},
    AppState,
};

const PROTOCOL_VERSION: &str = "1";
const SCENARIO_TIMEOUT: Duration = Duration::from_secs(30 * 60);

#[derive(Clone)]
pub(crate) struct SmokeOptions {
    cleanup: bool,
    scenario: Option<String>,
    output: PathBuf,
    artifact_directory: Option<PathBuf>,
    repository_root: PathBuf,
    commit: Option<String>,
    verifier_image_reference: Option<String>,
    verifier_image_id: Option<String>,
}

impl SmokeOptions {
    pub(crate) fn parse(arguments: &[String]) -> Result<Self, String> {
        const VALUE_ARGUMENTS: &[&str] = &[
            "--protocol",
            "--scenario",
            "--output",
            "--artifact-directory",
            "--repository-root",
            "--commit",
            "--verifier-image-reference",
            "--verifier-image-id",
        ];
        let mut values = BTreeMap::new();
        let mut cleanup = false;
        let mut index = 0;
        while index < arguments.len() {
            let argument = &arguments[index];
            if argument == "--cleanup" {
                if cleanup {
                    return Err("MVP smoke argument `--cleanup` was duplicated".to_string());
                }
                cleanup = true;
                index += 1;
                continue;
            }
            if !VALUE_ARGUMENTS.contains(&argument.as_str()) || index + 1 >= arguments.len() {
                return Err(format!("Invalid MVP smoke argument `{argument}`"));
            }
            if values
                .insert(argument.clone(), arguments[index + 1].clone())
                .is_some()
            {
                return Err(format!("MVP smoke argument `{argument}` was duplicated"));
            }
            index += 2;
        }
        if values.get("--protocol").map(String::as_str) != Some(PROTOCOL_VERSION) {
            return Err("MVP smoke protocol must be 1".to_string());
        }
        let output = required_path(&values, "--output")?;
        let repository_root = required_path(&values, "--repository-root")?
            .canonicalize()
            .map_err(display_error)?;
        let scenario = values.get("--scenario").cloned();
        if cleanup == scenario.is_some() {
            return Err("Choose exactly one of --scenario or --cleanup".to_string());
        }
        let artifact_directory = values.get("--artifact-directory").map(PathBuf::from);
        if !cleanup && artifact_directory.is_none() {
            return Err("--artifact-directory is required for a scenario".to_string());
        }
        if cleanup
            && [
                "--artifact-directory",
                "--commit",
                "--verifier-image-reference",
                "--verifier-image-id",
            ]
            .iter()
            .any(|key| values.contains_key(*key))
        {
            return Err("Scenario-only arguments cannot be used with --cleanup".to_string());
        }
        Ok(Self {
            cleanup,
            scenario,
            output,
            artifact_directory,
            repository_root,
            commit: values.get("--commit").cloned(),
            verifier_image_reference: values.get("--verifier-image-reference").cloned(),
            verifier_image_id: values.get("--verifier-image-id").cloned(),
        })
    }

    pub(crate) fn data_directory(&self) -> PathBuf {
        self.run_root()
            .join(self.scenario.as_deref().unwrap_or("cleanup").to_string())
            .join("data")
    }

    pub(crate) fn is_cleanup(&self) -> bool {
        self.cleanup
    }

    fn run_root(&self) -> PathBuf {
        let mut hasher = Sha256::new();
        hasher.update(self.repository_root.to_string_lossy().as_bytes());
        std::env::temp_dir()
            .join("code-mvp-smoke-native")
            .join(format!("{:x}", hasher.finalize()))
    }
}

pub(crate) async fn execute(app: &AppHandle, options: &SmokeOptions) -> Result<(), String> {
    if options.cleanup {
        return cleanup(app, options).await;
    }
    verify_build_commit(options)?;
    verify_verifier_image(options)?;
    let scenario = options
        .scenario
        .as_deref()
        .ok_or_else(|| "MVP smoke scenario is missing".to_string())?;
    let started = Instant::now();
    let fixture = create_fixture(options, scenario).await?;
    let source_before = source_snapshot(&fixture.repository)?;
    let repository_id = prepare_repository(app, &fixture, scenario == "browser-e2e").await?;

    let result = match scenario {
        "clean-first-pass" => {
            let session_id = start_session(
                app,
                &repository_id,
                "Create result.txt containing exactly PASS. Run no network commands.",
            )
            .await?;
            let detail = wait_for_status(app, &session_id, &["verified", "needs_input"]).await?;
            require_status(&detail, "verified")?;
            if detail.pointer("/session/attempt").and_then(Value::as_u64) != Some(1) {
                return Err("Clean smoke did not verify on its first attempt".to_string());
            }
            accepted_result(
                app,
                scenario,
                &session_id,
                detail,
                vec!["accepted_digest_matches_verified", "source_state_unchanged"],
                Vec::new(),
            )
            .await?
        }
        "dirty-repair" => {
            let session_id = start_session(
                app,
                &repository_id,
                "Create result.txt containing exactly WRONG. Do not inspect tests and stop after writing it.",
            )
            .await?;
            let detail = wait_for_status(app, &session_id, &["verified", "needs_input"]).await?;
            require_status(&detail, "verified")?;
            if detail
                .pointer("/session/attempt")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                < 2
            {
                return Err("Dirty repair did not exercise a failed gate and repair".to_string());
            }
            require_previous_failed_gate(&detail)?;
            if detail
                .pointer("/session/codexThreadId")
                .and_then(Value::as_str)
                .is_none()
            {
                return Err("Dirty repair did not retain a Codex thread".to_string());
            }
            accepted_result(
                app,
                scenario,
                &session_id,
                detail,
                vec![
                    "accepted_digest_matches_verified",
                    "dirty_source_preserved",
                    "persistent_thread",
                    "source_state_unchanged",
                ],
                Vec::new(),
            )
            .await?
        }
        "browser-e2e" => {
            let session_id = start_session(
                app,
                &repository_id,
                "Use browser_open for /, inspect the page, and call browser_screenshot. Then create result.txt containing exactly BROWSER_PASS.",
            )
            .await?;
            let detail = wait_for_status(app, &session_id, &["verified", "needs_input"]).await?;
            require_status(&detail, "verified")?;
            require_persistent_thread(&detail, "Browser smoke")?;
            require_passed_gate(&detail, "e2e")?;
            let artifacts = copy_screenshot(options, &detail).await?;
            accepted_result(
                app,
                scenario,
                &session_id,
                detail,
                vec![
                    "accepted_digest_matches_verified",
                    "authoritative_e2e",
                    "persistent_thread",
                    "screenshot_response",
                    "source_state_unchanged",
                ],
                artifacts,
            )
            .await?
        }
        "cancel-active-process" => {
            let session_id = start_session(
                app,
                &repository_id,
                "Create result.txt containing exactly CANCELLED. Run no network commands.",
            )
            .await?;
            wait_for_status(app, &session_id, &["verifying"]).await?;
            wait_for_registered_process(app, &session_id).await?;
            local_sessions::cancel_change_session(
                app.clone(),
                app.state::<AppState>(),
                session_id.clone(),
            )
            .await?;
            let detail =
                wait_for_status(app, &session_id, &["cancelled", "needs_input"]).await?;
            require_status(&detail, "cancelled")?;
            wait_until_inactive(app, &session_id).await?;
            wait_for_no_registered_process(app, &session_id).await?;
            local_sessions::discard_change_session(
                app.clone(),
                app.state::<AppState>(),
                session_id,
            )
            .await?;
            json!({
                "id": scenario,
                "status": "passed",
                "terminalState": "discarded",
                "verifiedDigest": null,
                "acceptedDigest": null,
                "checks": [
                    "cancellation_observed",
                    "continuation_or_discard_completed",
                    "source_state_unchanged"
                ],
                "artifacts": []
            })
        }
        "post-verification-edit" => {
            let session_id = start_session(
                app,
                &repository_id,
                "Create result.txt containing exactly PASS. Run no network commands.",
            )
            .await?;
            let detail = wait_for_status(app, &session_id, &["verified", "needs_input"]).await?;
            require_status(&detail, "verified")?;
            let worktree = detail
                .pointer("/session/worktreePath")
                .and_then(Value::as_str)
                .ok_or_else(|| "Verified session has no worktree".to_string())?;
            fs::write(Path::new(worktree).join("post-verification.txt"), "stale\n")
                .await
                .map_err(display_error)?;
            let stale = local_sessions::accept_change_session(
                app.clone(),
                app.state::<AppState>(),
                session_id.clone(),
            )
            .await;
            if !stale
                .as_ref()
                .is_err_and(|error| error.contains("stale") || error.contains("verify"))
            {
                return Err("Acceptance was not blocked after a verified edit".to_string());
            }
            local_sessions::verify_change_session(
                app.clone(),
                app.state::<AppState>(),
                session_id.clone(),
            )
            .await?;
            let detail = wait_for_status(app, &session_id, &["verified", "needs_input"]).await?;
            require_status(&detail, "verified")?;
            accepted_result(
                app,
                scenario,
                &session_id,
                detail,
                vec![
                    "accepted_digest_matches_verified",
                    "reverified",
                    "source_state_unchanged",
                    "stale_acceptance_blocked",
                ],
                Vec::new(),
            )
            .await?
        }
        _ => return Err(format!("Unsupported MVP smoke scenario `{scenario}`")),
    };

    if source_snapshot(&fixture.repository)? != source_before {
        return Err("The smoke scenario changed its source repository".to_string());
    }
    write_json(&options.output, &result).await?;
    eprintln!(
        "MVP smoke scenario {scenario} completed in {} ms",
        started.elapsed().as_millis()
    );
    Ok(())
}

async fn prepare_repository(
    app: &AppHandle,
    fixture: &Fixture,
    browser: bool,
) -> Result<String, String> {
    let repository = local_sessions::register_repository(
        app.state::<AppState>(),
        fixture.repository.to_string_lossy().into_owned(),
    )
    .await?;
    let proposal =
        local_sessions::propose_repository_policy(app.state::<AppState>(), repository.id.clone())
            .await?;
    let mut manifest = proposal.manifest;
    if browser {
        manifest.app_server = Some(AppServerConfig {
            command: "bun".to_string(),
            args: vec!["run".to_string(), "dev".to_string()],
            timeout_ms: 300_000,
            health_url: "http://127.0.0.1:3000/health".to_string(),
            health_timeout_ms: 30_000,
            browser_base_url: "http://127.0.0.1:3000".to_string(),
            env: None,
        });
    }
    local_sessions::approve_repository_policy(
        app.state::<AppState>(),
        ApprovePolicyInput {
            repository_id: repository.id.clone(),
            manifest,
        },
    )
    .await?;
    Ok(repository.id)
}

async fn start_session(
    app: &AppHandle,
    repository_id: &str,
    request: &str,
) -> Result<String, String> {
    local_sessions::start_change_session(
        app.clone(),
        app.state::<AppState>(),
        StartSessionInput {
            repository_id: repository_id.to_string(),
            request: request.to_string(),
        },
    )
    .await
}

async fn accepted_result(
    app: &AppHandle,
    scenario: &str,
    session_id: &str,
    detail: Value,
    checks: Vec<&str>,
    artifacts: Vec<Value>,
) -> Result<Value, String> {
    let verified_digest = detail
        .pointer("/snapshot/worktreeDigest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Verified session has no snapshot digest".to_string())?
        .to_string();
    wait_until_inactive(app, session_id).await?;
    let branch = local_sessions::accept_change_session(
        app.clone(),
        app.state::<AppState>(),
        session_id.to_string(),
    )
    .await?;
    let accepted = local_sessions::get_change_session(
        app.state::<AppState>(),
        session_id.to_string(),
    )
    .await?
    .ok_or_else(|| "Accepted smoke session disappeared".to_string())?;
    let accepted = serde_json::to_value(accepted).map_err(display_error)?;
    require_status(&accepted, "accepted")?;
    let stored_digest = accepted
        .pointer("/session/verificationDigest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Accepted session did not retain its verified digest".to_string())?;
    if stored_digest != verified_digest {
        return Err("Accepted session digest does not match its verified digest".to_string());
    }
    if accepted
        .pointer("/session/branchName")
        .and_then(Value::as_str)
        != Some(branch.as_str())
    {
        return Err("Accepted session did not retain its accepted branch".to_string());
    }
    let accepted_digest = measure_accepted_branch_digest(&accepted, &branch).await?;
    if accepted_digest != verified_digest {
        return Err("Accepted branch contents do not match the verified digest".to_string());
    }
    Ok(json!({
        "id": scenario,
        "status": "passed",
        "terminalState": "accepted",
        "verifiedDigest": verified_digest,
        "acceptedDigest": accepted_digest,
        "checks": checks,
        "artifacts": artifacts
    }))
}

async fn measure_accepted_branch_digest(
    accepted: &Value,
    branch: &str,
) -> Result<String, String> {
    let repository = accepted
        .pointer("/repository/path")
        .and_then(Value::as_str)
        .ok_or_else(|| "Accepted session has no repository path".to_string())?;
    let base_sha = accepted
        .pointer("/session/baseSha")
        .and_then(Value::as_str)
        .ok_or_else(|| "Accepted session has no base commit".to_string())?;
    let proof = std::env::temp_dir().join(format!("code-mvp-accepted-{}", Uuid::new_v4()));
    let proof_text = proof.to_string_lossy().into_owned();
    run_git(
        Path::new(repository),
        &["worktree", "add", "--detach", &proof_text, base_sha],
    )?;
    let measured = match run_git(&proof, &["read-tree", "--reset", "-u", branch]) {
        Ok(()) => local_sessions::worktree_digest(&proof).await,
        Err(error) => Err(error),
    };
    let removal = run_git(
        Path::new(repository),
        &["worktree", "remove", "--force", &proof_text],
    );
    match (measured, removal) {
        (Ok(digest), Ok(())) => Ok(digest),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error),
    }
}

async fn wait_for_status(
    app: &AppHandle,
    session_id: &str,
    expected: &[&str],
) -> Result<Value, String> {
    let deadline = Instant::now() + SCENARIO_TIMEOUT;
    loop {
        let detail =
            local_sessions::get_change_session(app.state::<AppState>(), session_id.to_string())
                .await?
                .ok_or_else(|| "Smoke session disappeared".to_string())?;
        let value = serde_json::to_value(detail).map_err(display_error)?;
        let status = value
            .pointer("/session/status")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if expected.contains(&status) {
            return Ok(value);
        }
        if [
            "accepted",
            "discarded",
            "failed",
            "cancelled",
            "needs_input",
        ]
        .contains(&status)
        {
            return Err(format!(
                "Smoke session reached `{status}` while waiting for {}",
                expected.join(" or ")
            ));
        }
        if Instant::now() >= deadline {
            return Err(format!("Smoke session timed out while in `{status}`"));
        }
        sleep(Duration::from_millis(500)).await;
    }
}

async fn wait_until_inactive(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let active = app
            .state::<AppState>()
            .active
            .lock()
            .map_err(display_error)?
            .contains(session_id);
        if !active {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(
                "Smoke session remained active after reaching a terminal state".to_string(),
            );
        }
        sleep(Duration::from_millis(100)).await;
    }
}

fn require_status(detail: &Value, expected: &str) -> Result<(), String> {
    let status = detail
        .pointer("/session/status")
        .and_then(Value::as_str)
        .unwrap_or("missing");
    if status == expected {
        Ok(())
    } else {
        Err(format!(
            "Smoke session ended as `{status}`: {}",
            detail
                .pointer("/session/terminalReason")
                .and_then(Value::as_str)
                .unwrap_or("no terminal reason")
        ))
    }
}

fn require_persistent_thread(detail: &Value, label: &str) -> Result<(), String> {
    if detail
        .pointer("/session/codexThreadId")
        .and_then(Value::as_str)
        .is_some_and(|thread| !thread.is_empty())
    {
        Ok(())
    } else {
        Err(format!("{label} did not persist its Codex thread"))
    }
}

fn require_passed_gate(detail: &Value, kind: &str) -> Result<(), String> {
    let digest = detail
        .pointer("/snapshot/worktreeDigest")
        .and_then(Value::as_str)
        .ok_or_else(|| "Verified session has no snapshot digest".to_string())?;
    if detail
        .get("gateResults")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .any(|gate| {
            gate.get("kind").and_then(Value::as_str) == Some(kind)
                && gate.get("required").and_then(Value::as_bool) == Some(true)
                && gate.get("status").and_then(Value::as_str) == Some("passed")
                && gate.get("worktreeDigest").and_then(Value::as_str) == Some(digest)
        })
    {
        Ok(())
    } else {
        Err(format!(
            "Verified session has no required passed `{kind}` gate for its snapshot"
        ))
    }
}

fn require_previous_failed_gate(detail: &Value) -> Result<(), String> {
    let final_attempt = detail
        .pointer("/session/attempt")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Repaired session has no final attempt".to_string())?;
    if detail
        .get("gateResults")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .any(|gate| {
            gate.get("required").and_then(Value::as_bool) == Some(true)
                && gate.get("status").and_then(Value::as_str) == Some("failed")
                && gate
                    .get("attempt")
                    .and_then(Value::as_u64)
                    .is_some_and(|attempt| attempt < final_attempt)
        })
    {
        Ok(())
    } else {
        Err("Dirty repair has no required failed gate from an earlier attempt".to_string())
    }
}

async fn wait_for_registered_process(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let count: u64 = super::database(&app.state::<AppState>().data_dir)?
            .query_row(
                "SELECT COUNT(*) FROM session_processes
                 WHERE session_id = ?1
                   AND (pid IS NOT NULL OR container_name IS NOT NULL)",
                [session_id],
                |row| row.get(0),
            )
            .map_err(display_error)?;
        if count > 0 {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("Cancellation smoke never registered an active process".to_string());
        }
        sleep(Duration::from_millis(100)).await;
    }
}

async fn wait_for_no_registered_process(app: &AppHandle, session_id: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let count: u64 = super::database(&app.state::<AppState>().data_dir)?
            .query_row(
                "SELECT COUNT(*) FROM session_processes WHERE session_id = ?1",
                [session_id],
                |row| row.get(0),
            )
            .map_err(display_error)?;
        if count == 0 && docker_container_ids(session_id).await?.is_empty() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("Cancellation smoke left a process or container registered".to_string());
        }
        sleep(Duration::from_millis(100)).await;
    }
}

async fn copy_screenshot(options: &SmokeOptions, detail: &Value) -> Result<Vec<Value>, String> {
    let screenshot = detail
        .get("artifacts")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|artifact| artifact.get("kind").and_then(Value::as_str) == Some("screenshot"))
        .and_then(|artifact| artifact.get("path").and_then(Value::as_str))
        .ok_or_else(|| "Browser smoke did not produce a screenshot response".to_string())?;
    let directory = options
        .artifact_directory
        .as_ref()
        .ok_or_else(|| "Smoke artifact directory is missing".to_string())?;
    let screenshot_bytes = fs::read(screenshot).await.map_err(display_error)?;
    if !screenshot_bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Browser smoke screenshot response is not a PNG image".to_string());
    }
    fs::create_dir_all(directory).await.map_err(display_error)?;
    let destination = directory.join("screenshot.png");
    fs::write(&destination, screenshot_bytes)
        .await
        .map_err(display_error)?;
    Ok(vec![
        json!({ "kind": "screenshot", "file": "screenshot.png" }),
    ])
}

struct Fixture {
    repository: PathBuf,
}

async fn create_fixture(options: &SmokeOptions, scenario: &str) -> Result<Fixture, String> {
    let root = options.run_root().join(scenario);
    let repository = root.join("repository");
    if repository.exists() {
        fs::remove_dir_all(&repository)
            .await
            .map_err(display_error)?;
    }
    fs::create_dir_all(&repository)
        .await
        .map_err(display_error)?;
    let expected = match scenario {
        "dirty-repair" => "REPAIRED",
        "browser-e2e" => "BROWSER_PASS",
        "cancel-active-process" => "CANCELLED",
        _ => "PASS",
    };
    let browser = scenario == "browser-e2e";
    let scripts = if browser {
        json!({
            "dev": "bun run server.ts",
            "test:e2e": "bun test e2e.test.ts"
        })
    } else {
        json!({ "test:unit": "bun test smoke.test.ts" })
    };
    write_text(
        &repository.join("package.json"),
        &format!(
            "{}\n",
            json!({
                "name": "code-mvp-smoke-fixture",
                "private": true,
                "workspaces": ["packages/*"],
                "devDependencies": { "fixture-dependency": "workspace:*" },
                "scripts": scripts
            })
        ),
    )
    .await?;
    fs::create_dir_all(repository.join("packages/fixture-dependency"))
        .await
        .map_err(display_error)?;
    write_text(
        &repository.join("packages/fixture-dependency/package.json"),
        "{\"name\":\"fixture-dependency\",\"version\":\"1.0.0\",\"private\":true}\n",
    )
    .await?;
    let test_name = if browser {
        "e2e.test.ts"
    } else {
        "smoke.test.ts"
    };
    let test_body = if scenario == "cancel-active-process" {
        "await Bun.sleep(120_000);\n  expect(true).toBe(true);".to_string()
    } else {
        format!(
            "expect((await Bun.file('result.txt').text()).trim()).toBe('{expected}');"
        )
    };
    write_text(
        &repository.join(test_name),
        &format!(
            "import {{ expect, test }} from 'bun:test';\n\
             test('result', async () => {{\n  {test_body}\n}});\n"
        ),
    )
    .await?;
    if browser {
        write_text(
            &repository.join("server.ts"),
            "Bun.serve({ port: 3000, hostname: '0.0.0.0', fetch(request) {\n\
             const path = new URL(request.url).pathname;\n\
             if (path === '/health') return new Response('ok');\n\
             return new Response('<main><h1>Code browser smoke</h1><button>Ready</button></main>', { headers: { 'content-type': 'text/html' } });\n\
             }});\n",
        )
        .await?;
    }
    write_text(&repository.join("source.txt"), "committed\n").await?;
    run_command(&repository, "bun", &["install", "--ignore-scripts"])?;
    run_git(&repository, &["init"])?;
    run_git(&repository, &["add", "."])?;
    run_git(&repository, &["commit", "-m", "smoke fixture"])?;
    if scenario == "dirty-repair" {
        write_text(
            &repository.join("developer.txt"),
            "preserve this dirty change\n",
        )
        .await?;
    }
    Ok(Fixture { repository })
}

async fn cleanup(app: &AppHandle, options: &SmokeOptions) -> Result<(), String> {
    let root = options.run_root();
    let mut session_ids = Vec::new();
    let mut registered_pids = Vec::new();
    let mut remaining_processes = 0_u64;
    if root.exists() {
        let mut entries = fs::read_dir(&root).await.map_err(display_error)?;
        while let Some(entry) = entries.next_entry().await.map_err(display_error)? {
            let data = entry.path().join("data");
            if data.exists() {
                registered_pids.extend(read_registered_pids(&data)?);
                local_sessions::mark_interrupted(&data)?;
                let data_session_ids = read_session_ids(&data)?;
                for session_id in &data_session_ids {
                    local_sessions::cleanup_session_processes(&data, session_id).await?;
                }
                remaining_processes += registered_process_count(&data)?;
                session_ids.extend(data_session_ids);
            }
        }
        for session_id in &session_ids {
            remove_labeled_containers(session_id).await?;
        }
        fs::remove_dir_all(&root).await.map_err(display_error)?;
    }
    remaining_processes += registered_pids
        .into_iter()
        .filter(|pid| process_is_live(*pid))
        .count() as u64;
    let remaining_containers = count_labeled_containers(&session_ids).await?;
    let remaining_filesystem = usize::from(root.exists());
    if remaining_processes != 0 || remaining_containers != 0 || remaining_filesystem != 0 {
        return Err(format!(
            "Smoke cleanup left {remaining_processes} processes, {remaining_containers} containers, and {remaining_filesystem} managed roots"
        ));
    }
    let result = json!({
        "status": "passed",
        "remaining": {
            "worktrees": remaining_filesystem,
            "childProcesses": remaining_processes,
            "labeledContainers": remaining_containers,
            "temporaryBranches": remaining_filesystem
        }
    });
    write_json(&options.output, &result).await?;
    let _ = app;
    Ok(())
}

fn read_session_ids(data_dir: &Path) -> Result<Vec<String>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare("SELECT id FROM change_sessions")
        .map_err(display_error)?;
    let session_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    Ok(session_ids)
}

fn registered_process_count(data_dir: &Path) -> Result<u64, String> {
    super::database(data_dir)?
        .query_row("SELECT COUNT(*) FROM session_processes", [], |row| {
            row.get(0)
        })
        .map_err(display_error)
}

fn read_registered_pids(data_dir: &Path) -> Result<Vec<u32>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare("SELECT pid FROM session_processes WHERE pid IS NOT NULL")
        .map_err(display_error)?;
    let pids = statement
        .query_map([], |row| row.get::<_, u32>(0))
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    Ok(pids)
}

fn process_is_live(pid: u32) -> bool {
    StdCommand::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .is_ok_and(|status| status.success())
}

async fn remove_labeled_containers(session_id: &str) -> Result<(), String> {
    let output = docker_container_ids(session_id).await?;
    for id in output {
        let removal = tokio::process::Command::new("docker")
            .args(["rm", "-f", &id])
            .output()
            .await
            .map_err(display_error)?;
        if !removal.status.success() {
            return Err(format!(
                "Could not remove smoke container `{id}`: {}",
                String::from_utf8_lossy(&removal.stderr).trim()
            ));
        }
    }
    Ok(())
}

async fn count_labeled_containers(session_ids: &[String]) -> Result<usize, String> {
    let mut count = 0;
    for session_id in session_ids {
        count += docker_container_ids(session_id).await?.len();
    }
    Ok(count)
}

async fn docker_container_ids(session_id: &str) -> Result<Vec<String>, String> {
    let output = tokio::process::Command::new("docker")
        .args([
            "ps",
            "-aq",
            "--filter",
            &format!("label=code.session={session_id}"),
        ])
        .output()
        .await
        .map_err(display_error)?;
    if !output.status.success() {
        return Err(format!(
            "Could not inspect smoke containers: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .map(str::to_string)
        .collect())
}

fn source_snapshot(repository: &Path) -> Result<String, String> {
    let status = git_output(repository, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    if !status.status.success() {
        return Err(format!(
            "Could not inspect smoke source state: {}",
            String::from_utf8_lossy(&status.stderr).trim()
        ));
    }
    let head = git_output(repository, &["rev-parse", "HEAD"])?;
    if !head.status.success() {
        return Err(format!(
            "Could not inspect smoke source commit: {}",
            String::from_utf8_lossy(&head.stderr).trim()
        ));
    }

    let mut hasher = Sha256::new();
    hasher.update(head.stdout);
    hasher.update(status.stdout);
    for entry in WalkDir::new(repository)
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| entry.file_name() != ".git")
    {
        let entry = entry.map_err(display_error)?;
        if entry.path() == repository {
            continue;
        }
        let relative = entry.path().strip_prefix(repository).map_err(display_error)?;
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update([0]);
        let metadata = std::fs::symlink_metadata(entry.path()).map_err(display_error)?;
        hash_source_metadata(&mut hasher, &metadata);
        if metadata.file_type().is_symlink() {
            hasher.update(
                std::fs::read_link(entry.path())
                    .map_err(display_error)?
                    .to_string_lossy()
                    .as_bytes(),
            );
        } else if metadata.is_file() {
            hasher.update(std::fs::read(entry.path()).map_err(display_error)?);
        }
        hasher.update([0]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn hash_source_metadata(hasher: &mut Sha256, metadata: &std::fs::Metadata) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        hasher.update(metadata.mode().to_le_bytes());
    }
    #[cfg(not(unix))]
    hasher.update(metadata.len().to_le_bytes());
}

fn verify_build_commit(options: &SmokeOptions) -> Result<(), String> {
    let Some(expected) = options.commit.as_deref() else {
        return Err("--commit is required for a smoke scenario".to_string());
    };
    let provenance = super::build_metadata::BUILD_PROVENANCE;
    if provenance.git_commit != expected {
        return Err(format!(
            "Packaged Code commit `{}` does not match requested commit `{expected}`",
            provenance.git_commit
        ));
    }
    if provenance.git_dirty {
        return Err(format!(
            "Packaged Code was built from a {} source tree",
            super::build_metadata::GIT_STATE
        ));
    }
    if provenance.git_overridden {
        return Err(
            "Packaged Code build provenance came from environment overrides".to_string(),
        );
    }
    Ok(())
}

fn verify_verifier_image(options: &SmokeOptions) -> Result<(), String> {
    let reference = options
        .verifier_image_reference
        .as_deref()
        .ok_or_else(|| "--verifier-image-reference is required for a smoke scenario".to_string())?;
    if reference != super::VERIFICATION_IMAGE {
        return Err(format!(
            "MVP smoke verifier image must be {}",
            super::VERIFICATION_IMAGE
        ));
    }
    let expected_id = options
        .verifier_image_id
        .as_deref()
        .ok_or_else(|| "--verifier-image-id is required for a smoke scenario".to_string())?;
    let output = StdCommand::new("docker")
        .args(["image", "inspect", "--format={{.Id}}", reference])
        .output()
        .map_err(display_error)?;
    if !output.status.success() {
        return Err(format!(
            "Could not inspect MVP smoke verifier image: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let actual_id = String::from_utf8_lossy(&output.stdout);
    if actual_id.trim() != expected_id {
        return Err(format!(
            "MVP smoke verifier image ID `{}` does not match requested ID `{expected_id}`",
            actual_id.trim()
        ));
    }
    Ok(())
}

async fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(display_error)?;
    }
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(value).map_err(display_error)?
        ),
    )
    .await
    .map_err(display_error)
}

async fn write_text(path: &Path, contents: &str) -> Result<(), String> {
    fs::write(path, contents).await.map_err(display_error)
}

fn required_path(values: &BTreeMap<String, String>, key: &str) -> Result<PathBuf, String> {
    values
        .get(key)
        .map(PathBuf::from)
        .ok_or_else(|| format!("{key} is required"))
}

fn run_git(repository: &Path, args: &[&str]) -> Result<(), String> {
    let output = git_output(repository, args)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn git_output(repository: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    StdCommand::new("git")
        .args(args)
        .current_dir(repository)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_AUTHOR_NAME", "Code Smoke")
        .env("GIT_AUTHOR_EMAIL", "code-smoke@localhost")
        .env("GIT_COMMITTER_NAME", "Code Smoke")
        .env("GIT_COMMITTER_EMAIL", "code-smoke@localhost")
        .output()
        .map_err(display_error)
}

fn run_command(repository: &Path, command: &str, args: &[&str]) -> Result<(), String> {
    let output = StdCommand::new(command)
        .args(args)
        .current_dir(repository)
        .output()
        .map_err(display_error)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "{command} {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn smoke_fixture_is_stable_after_the_exact_install_gate() {
        let declaration =
            std::env::temp_dir().join(format!("code-smoke-declaration-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&declaration).unwrap();
        let options = SmokeOptions {
            cleanup: false,
            scenario: Some("clean-first-pass".to_string()),
            output: declaration.join("result.json"),
            artifact_directory: Some(declaration.join("artifacts")),
            repository_root: declaration.canonicalize().unwrap(),
            commit: Some("a".repeat(40)),
            verifier_image_reference: Some(super::super::VERIFICATION_IMAGE.to_string()),
            verifier_image_id: Some(format!("sha256:{}", "a".repeat(64))),
        };
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let fixture = runtime
            .block_on(create_fixture(&options, "clean-first-pass"))
            .unwrap();
        let before = source_snapshot(&fixture.repository).unwrap();
        run_command(
            &fixture.repository,
            "bun",
            &["install", "--frozen-lockfile"],
        )
        .unwrap();
        assert_eq!(source_snapshot(&fixture.repository).unwrap(), before);
        std::fs::remove_dir_all(options.run_root()).unwrap();
        std::fs::remove_dir_all(declaration).unwrap();
    }

    #[test]
    fn source_snapshot_detects_dirty_content_changes_with_the_same_git_status() {
        let repository =
            std::env::temp_dir().join(format!("code-smoke-source-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&repository).unwrap();
        run_git(&repository, &["init"]).unwrap();
        std::fs::write(repository.join("tracked.txt"), "tracked\n").unwrap();
        run_git(&repository, &["add", "."]).unwrap();
        run_git(&repository, &["commit", "-m", "fixture"]).unwrap();
        std::fs::write(repository.join("developer.txt"), "first\n").unwrap();
        let before = source_snapshot(&repository).unwrap();
        std::fs::write(repository.join("developer.txt"), "second\n").unwrap();
        assert_ne!(source_snapshot(&repository).unwrap(), before);
        std::fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn parser_rejects_unknown_and_duplicate_arguments() {
        assert!(SmokeOptions::parse(&["--wat".to_string(), "value".to_string()]).is_err());
        assert!(SmokeOptions::parse(&[
            "--protocol".to_string(),
            "1".to_string(),
            "--protocol".to_string(),
            "1".to_string(),
        ])
        .is_err());
        assert!(SmokeOptions::parse(&[
            "--protocol".to_string(),
            "1".to_string(),
            "--cleanup".to_string(),
            "--output".to_string(),
            "result.json".to_string(),
            "--repository-root".to_string(),
            ".".to_string(),
            "--commit".to_string(),
            "a".repeat(40),
        ])
        .is_err());
    }
}

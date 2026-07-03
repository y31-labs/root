use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::Metadata,
    path::{Component, Path, PathBuf},
    process::{Command as SystemCommand, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::{sleep, timeout},
};
use uuid::Uuid;
use walkdir::{DirEntry, WalkDir};

use super::{
    display_error, now_ms,
    session_engine::{EngineFuture, EngineTurnStatus, ImplementationEngine},
    AppState, VERIFICATION_IMAGE,
};

const MAX_ATTEMPTS: u32 = 5;
const MAX_CYCLE_TIME: Duration = Duration::from_secs(30 * 60);
const MAX_ADDED_FILE_SIZE: u64 = 5 * 1024 * 1024;
const VERIFIER_BUN_VERSION: &str = "1.3.5";
const BROWSER_CONTROLLER: &str = include_str!("../browser-controller.cjs");
const BROWSER_VERIFIER: &str = include_str!("../browser-verifier.cjs");
const FLOW_COVERAGE_REPORT_FILE: &str = "flow-coverage.json";
const FLOW_COVERAGE_REPORT_ENV: &str = "CODE_FLOW_COVERAGE_REPORT";
const REPOSITORY_MAPPING_OUTPUT_FILE: &str = "project-map.json";
const REPOSITORY_MAPPING_SUMMARY_FILE: &str = "repository-summary.json";
const REPOSITORY_MAPPING_TIMEOUT: Duration = Duration::from_secs(90);

const GATE_ORDER: [&str; 10] = [
    "install",
    "typecheck",
    "lint",
    "build",
    "unit",
    "integration",
    "coverage",
    "accessibility",
    "e2e",
    "visual",
];
const SAFETY_CHECKS: [&str; 7] = [
    "diff",
    "secrets",
    "symlinks",
    "fileSize",
    "fileMode",
    "policy",
    "stability",
];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VerificationManifest {
    pub(crate) version: u8,
    pub(crate) runtime: RuntimeConfig,
    pub(crate) gates: BTreeMap<String, VerificationCommand>,
    pub(crate) app_server: Option<AppServerConfig>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeConfig {
    pub(crate) package_manager: String,
    pub(crate) bun_version: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VerificationCommand {
    pub(crate) command: String,
    pub(crate) args: Vec<String>,
    pub(crate) timeout_ms: u64,
    pub(crate) required: bool,
    pub(crate) network: String,
    pub(crate) env: Option<BTreeMap<String, String>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppServerConfig {
    pub(crate) command: String,
    pub(crate) args: Vec<String>,
    pub(crate) timeout_ms: u64,
    pub(crate) health_url: String,
    pub(crate) health_timeout_ms: u64,
    pub(crate) browser_base_url: String,
    pub(crate) env: Option<BTreeMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Repository {
    pub(crate) id: String,
    path: String,
    name: String,
    head_sha: String,
    branch: Option<String>,
    dirty: bool,
    compatible: bool,
    compatibility_detail: Option<String>,
    created_at: i64,
    updated_at: i64,
    policy: Option<RepositoryPolicy>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryPolicy {
    repository_id: String,
    manifest: VerificationManifest,
    fingerprint: String,
    fingerprint_paths: Vec<String>,
    approved_at: i64,
    valid: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryTarget {
    id: String,
    repository_id: String,
    name: String,
    path: String,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    package_name: Option<String>,
    scripts: BTreeMap<String, String>,
    source: String,
    selected: bool,
    created_at: i64,
    updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryTargetScan {
    mode: String,
    targets: Vec<RepositoryTarget>,
    assisted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    assistance_detail: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RepositoryMappingMode {
    Code,
    Claude,
    CloudApi,
}

impl RepositoryMappingMode {
    fn parse(mode: Option<&str>) -> Result<Self, String> {
        match mode.unwrap_or("code") {
            "code" => Ok(Self::Code),
            "claude" => Ok(Self::Claude),
            "cloudApi" => Ok(Self::CloudApi),
            value => Err(format!("Unsupported repository mapping mode: {value}")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Code => "code",
            Self::Claude => "claude",
            Self::CloudApi => "cloudApi",
        }
    }
}

struct RepositoryMappingInput<'a> {
    repository: &'a RepositoryRow,
    existing: &'a [RepositoryTargetRow],
}

struct RepositoryMappingOutput {
    mode: RepositoryMappingMode,
    targets: Vec<RepositoryTargetRow>,
    assisted: bool,
    assistance_detail: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(dead_code)]
struct AiRepositoryMapDocument {
    version: u8,
    mode: String,
    targets: Vec<AiRepositoryMapTarget>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(dead_code)]
struct AiRepositoryMapTarget {
    name: String,
    path: String,
    kind: String,
    #[serde(default)]
    package_name: Option<String>,
    #[serde(default)]
    scripts: BTreeMap<String, String>,
    #[serde(default = "default_selected")]
    selected: bool,
}

trait RepositoryMapper {
    fn map<'a>(
        &'a self,
        input: RepositoryMappingInput<'a>,
    ) -> EngineFuture<'a, RepositoryMappingOutput>;
}

struct DeterministicRepositoryMapper {
    mode: RepositoryMappingMode,
}

struct CodeRepositoryMapper {
    data_dir: PathBuf,
    engine: Arc<dyn ImplementationEngine>,
}

impl RepositoryMapper for DeterministicRepositoryMapper {
    fn map<'a>(
        &'a self,
        input: RepositoryMappingInput<'a>,
    ) -> EngineFuture<'a, RepositoryMappingOutput> {
        Box::pin(async move {
            let mut targets = discover_repository_targets(input.repository).await?;
            preserve_existing_target_state(&mut targets, input.existing);
            Ok(RepositoryMappingOutput {
                mode: self.mode,
                targets,
                assisted: false,
                assistance_detail: Some(repository_mapping_detail(self.mode)),
            })
        })
    }
}

impl RepositoryMapper for CodeRepositoryMapper {
    fn map<'a>(
        &'a self,
        input: RepositoryMappingInput<'a>,
    ) -> EngineFuture<'a, RepositoryMappingOutput> {
        Box::pin(async move {
            let workspace = self
                .data_dir
                .join("repository-mapping")
                .join(Uuid::new_v4().to_string());
            fs::create_dir_all(&workspace).await.map_err(display_error)?;
            let result = self.map_in_workspace(input, &workspace).await;
            let _ = fs::remove_dir_all(&workspace).await;
            result
        })
    }
}

impl CodeRepositoryMapper {
    async fn map_in_workspace(
        &self,
        input: RepositoryMappingInput<'_>,
        workspace: &Path,
    ) -> Result<RepositoryMappingOutput, String> {
        let summary = repository_mapping_summary(input.repository, input.existing).await?;
        fs::write(
            workspace.join(REPOSITORY_MAPPING_SUMMARY_FILE),
            serde_json::to_string_pretty(&summary).map_err(display_error)?,
        )
        .await
        .map_err(display_error)?;

        run_repository_mapping_turn(self.engine.clone(), workspace.to_path_buf()).await?;
        let output = fs::read_to_string(workspace.join(REPOSITORY_MAPPING_OUTPUT_FILE))
            .await
            .map_err(|error| {
                format!(
                    "Code automatic mapping did not produce {REPOSITORY_MAPPING_OUTPUT_FILE}: {error}"
                )
            })?;
        let mut targets =
            parse_ai_repository_map_document(input.repository, RepositoryMappingMode::Code, &output)?;
        preserve_existing_target_state(&mut targets, input.existing);
        Ok(RepositoryMappingOutput {
            mode: RepositoryMappingMode::Code,
            targets,
            assisted: true,
            assistance_detail: Some(
                "Code automatic mapping used a generated repository summary and AI classification."
                    .to_string(),
            ),
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TargetFlowOverview {
    snapshot: TargetFlowSnapshot,
    timeline: Vec<TargetFlowTimelineItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowSnapshot {
    target: RepositoryTarget,
    flows: Vec<TargetFlow>,
    unscoped_flows: Vec<TargetFlow>,
    proposals: Vec<TargetFlowProposal>,
    invalid_documents: Vec<TargetFlowInvalidDocument>,
    generated_at: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlow {
    flow_id: String,
    name: String,
    goal: String,
    relative_path: String,
    digest: String,
    graph: TargetFlowGraph,
    source_paths: Vec<String>,
    coverage_scenarios: Vec<TargetFlowCoverageScenario>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowGraph {
    nodes: Vec<TargetFlowNode>,
    edges: Vec<TargetFlowEdge>,
    issues: Vec<TargetFlowIssue>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowNode {
    id: String,
    state_id: String,
    label: String,
    kind: String,
    route: Option<String>,
    status: String,
    coverage: TargetFlowCoverageSummary,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowEdge {
    id: String,
    transition_id: String,
    source: String,
    target: String,
    label: String,
    actor: String,
    status: String,
    coverage: TargetFlowCoverageSummary,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowIssue {
    severity: String,
    code: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowProposal {
    proposal_id: String,
    flow_id: String,
    summary: String,
    confidence: String,
    relative_path: String,
    digest: String,
    operation_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowInvalidDocument {
    kind: String,
    relative_path: String,
    issue_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowCoverageSummary {
    status: String,
    required: usize,
    covered: usize,
    missing: usize,
    optional: usize,
    scenarios: Vec<TargetFlowCoverageScenarioReference>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowCoverageScenarioReference {
    scenario_id: String,
    title: String,
    behavior: String,
    required: bool,
    covered: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowCoverageScenario {
    scenario_id: String,
    flow_id: String,
    title: String,
    description: String,
    gate: String,
    relative_path: String,
    digest: String,
    covers: Vec<TargetFlowCoverageCover>,
    expected_evidence: Vec<TargetFlowCoverageExpectedEvidence>,
    evidence: Vec<TargetFlowCoverageEvidence>,
    latest_session: Option<TargetFlowCoverageSession>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowCoverageCover {
    kind: String,
    id: String,
    behavior: String,
    required: bool,
    covered: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowCoverageExpectedEvidence {
    kind: String,
    label: String,
    required: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowCoverageEvidence {
    scenario_id: String,
    session_id: String,
    artifact_id: String,
    kind: String,
    label: String,
    path: String,
    created_at: i64,
    verified_at: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowCoverageSession {
    session_id: String,
    request: String,
    status: String,
    verified_at: i64,
}

#[derive(Clone)]
struct ParsedFlowCoverageDocument {
    scenario: TargetFlowCoverageScenario,
    targets: Vec<ParsedFlowCoverageTarget>,
}

#[derive(Clone)]
struct ParsedFlowCoverageTarget {
    kind: String,
    id: String,
    behavior: String,
    required: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowCoverageRuntimeReport {
    version: u8,
    scenarios: Vec<FlowCoverageRuntimeScenario>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowCoverageRuntimeScenario {
    flow_id: String,
    scenario_id: String,
    status: Option<String>,
    covers: Vec<FlowCoverageRuntimeCover>,
    evidence: Vec<FlowCoverageRuntimeEvidence>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowCoverageRuntimeCover {
    kind: String,
    id: String,
    status: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowCoverageRuntimeEvidence {
    kind: String,
    label: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetFlowTimelineItem {
    id: String,
    flow_id: Option<String>,
    flow_name: Option<String>,
    relative_path: String,
    change_type: String,
    commit_sha: String,
    commit_subject: String,
    committed_at: i64,
    summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PolicyProposal {
    pub(crate) manifest: VerificationManifest,
    fingerprint: String,
    fingerprint_paths: Vec<String>,
    detected_scripts: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangeSession {
    pub(crate) id: String,
    repository_id: String,
    repository_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_path: Option<String>,
    request: String,
    base_sha: String,
    worktree_path: String,
    branch_name: Option<String>,
    codex_thread_id: Option<String>,
    status: String,
    attempt: u32,
    verification_digest: Option<String>,
    terminal_reason: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionEvent {
    id: i64,
    session_id: String,
    kind: String,
    message: String,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GateResult {
    id: i64,
    session_id: String,
    kind: String,
    required: bool,
    status: String,
    attempt: u32,
    duration_ms: u64,
    exit_code: Option<i32>,
    worktree_digest: String,
    artifact_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionApproval {
    request_id: Value,
    method: String,
    detail: String,
    status: String,
    created_at: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Artifact {
    id: String,
    session_id: String,
    kind: String,
    path: String,
    label: String,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VerificationSnapshot {
    session_id: String,
    worktree_digest: String,
    required: usize,
    passed: usize,
    failed: usize,
    missing: usize,
    has_diff: bool,
    verified_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReportRepository {
    name: String,
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReportTask {
    request_summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReportTarget {
    name: String,
    path: String,
    kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReportCheck {
    kind: String,
    required: bool,
    status: String,
    attempt: u32,
    duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<i32>,
    artifact_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReportArtifactIndexEntry {
    id: String,
    kind: String,
    path: String,
    label: String,
    created_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReportPrivacy {
    source_contents_included: bool,
    redaction_notes: Vec<String>,
    notes: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceReport {
    version: u8,
    session_id: String,
    repository: EvidenceReportRepository,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<EvidenceReportTarget>,
    task: EvidenceReportTask,
    base_commit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    accepted_branch: Option<String>,
    verification: VerificationSnapshot,
    gates: Vec<EvidenceReportCheck>,
    safety_checks: Vec<EvidenceReportCheck>,
    artifacts: Vec<EvidenceReportArtifactIndexEntry>,
    privacy: EvidenceReportPrivacy,
    created_at: i64,
    exported_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EvidenceReportExport {
    report: EvidenceReport,
    json_artifact: Artifact,
    markdown_artifact: Artifact,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionDetail {
    session: ChangeSession,
    repository: Repository,
    policy: RepositoryPolicy,
    events: Vec<SessionEvent>,
    gate_results: Vec<GateResult>,
    approvals: Vec<SessionApproval>,
    artifacts: Vec<Artifact>,
    snapshot: Option<VerificationSnapshot>,
    diff: String,
    current_digest: String,
    verification_stale: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApprovePolicyInput {
    pub(crate) repository_id: String,
    pub(crate) manifest: VerificationManifest,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartSessionInput {
    pub(crate) repository_id: String,
    pub(crate) target_id: Option<String>,
    pub(crate) request: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveRepositoryTargetsInput {
    pub(crate) repository_id: String,
    pub(crate) targets: Vec<SaveRepositoryTarget>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveRepositoryTarget {
    pub(crate) id: Option<String>,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: String,
    pub(crate) package_name: Option<String>,
    pub(crate) scripts: Option<BTreeMap<String, String>>,
    pub(crate) source: String,
    pub(crate) selected: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContinueSessionInput {
    pub(crate) session_id: String,
    pub(crate) message: String,
}

struct RepositoryRow {
    id: String,
    path: PathBuf,
    name: String,
    head_sha: String,
    branch: Option<String>,
    dirty: bool,
    compatible: bool,
    compatibility_detail: Option<String>,
    created_at: i64,
    updated_at: i64,
}

struct PolicyRow {
    repository_id: String,
    manifest: VerificationManifest,
    fingerprint: String,
    fingerprint_paths: Vec<String>,
    approved_at: i64,
}

#[derive(Clone)]
struct RepositoryTargetRow {
    id: String,
    repository_id: String,
    name: String,
    path: String,
    kind: String,
    package_name: Option<String>,
    scripts: BTreeMap<String, String>,
    source: String,
    selected: bool,
    created_at: i64,
    updated_at: i64,
}

struct SessionRow {
    id: String,
    repository_id: String,
    target_id: Option<String>,
    request: String,
    base_sha: String,
    worktree_path: PathBuf,
    branch_name: Option<String>,
    codex_thread_id: Option<String>,
    status: String,
    attempt: u32,
    verification_digest: Option<String>,
    terminal_reason: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Clone, Debug)]
struct ProcessOutput {
    exit_code: Option<i32>,
    output: String,
    timed_out: bool,
    cancelled: bool,
}

#[derive(Clone, Debug)]
struct PendingGateResult {
    kind: String,
    required: bool,
    status: String,
    attempt: u32,
    duration_ms: u64,
    exit_code: Option<i32>,
    worktree_digest: String,
    artifact_ids: Vec<String>,
}

#[derive(Clone, Debug)]
struct ProcessRecord {
    id: String,
    pid: Option<u32>,
    container_name: Option<String>,
}

#[derive(Clone)]
struct ProcessRegistry {
    data_dir: PathBuf,
}

impl ProcessRegistry {
    fn new(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    fn register(
        &self,
        session_id: &str,
        purpose: &str,
        kind: &str,
        pid: Option<u32>,
        container_name: Option<&str>,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        super::database(&self.data_dir)?
            .execute(
                "INSERT INTO session_processes
                 (id, session_id, purpose, kind, pid, container_name, started_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, session_id, purpose, kind, pid, container_name, now_ms()],
            )
            .map_err(display_error)?;
        Ok(id)
    }

    fn finish(&self, id: &str) -> Result<(), String> {
        super::database(&self.data_dir)?
            .execute("DELETE FROM session_processes WHERE id = ?1", [id])
            .map_err(display_error)?;
        Ok(())
    }

    fn records(&self, session_id: &str) -> Result<Vec<ProcessRecord>, String> {
        let connection = super::database(&self.data_dir)?;
        let mut statement = connection
            .prepare(
                "SELECT id, pid, container_name
                 FROM session_processes WHERE session_id = ?1 ORDER BY started_at, id",
            )
            .map_err(display_error)?;
        let records = statement
            .query_map([session_id], |row| {
                Ok(ProcessRecord {
                    id: row.get(0)?,
                    pid: row.get(1)?,
                    container_name: row.get(2)?,
                })
            })
            .map_err(display_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(display_error)?;
        Ok(records)
    }

    fn clear_session(&self, session_id: &str) -> Result<(), String> {
        super::database(&self.data_dir)?
            .execute(
                "DELETE FROM session_processes WHERE session_id = ?1",
                [session_id],
            )
            .map_err(display_error)?;
        Ok(())
    }

    async fn cleanup_session(&self, session_id: &str) -> Result<(), String> {
        for record in self.records(session_id)? {
            if let Some(container_name) = &record.container_name {
                let _ = Command::new("docker")
                    .args(["rm", "-f", container_name])
                    .output()
                    .await;
            }
            if let Some(pid) = record.pid {
                terminate_pid(pid).await;
            }
            let _ = self.finish(&record.id);
        }
        cleanup_labeled_containers(session_id).await;
        self.clear_session(session_id)
    }

    fn cleanup_session_sync(&self, session_id: &str) -> Result<(), String> {
        for record in self.records(session_id)? {
            if let Some(container_name) = &record.container_name {
                let _ = SystemCommand::new("docker")
                    .args(["rm", "-f", container_name])
                    .output();
            }
            if let Some(pid) = record.pid {
                terminate_pid_sync(pid);
            }
            let _ = self.finish(&record.id);
        }
        cleanup_labeled_containers_sync(session_id);
        self.clear_session(session_id)
    }
}

trait ProcessExecutor: Send + Sync {
    fn run(
        &self,
        cancelled: Arc<Mutex<HashSet<String>>>,
        registry: ProcessRegistry,
        session_id: String,
        purpose: String,
        program: String,
        args: Vec<String>,
        cwd: Option<PathBuf>,
        process_timeout: Duration,
    ) -> EngineFuture<'_, ProcessOutput>;
}

trait SessionClock: Send + Sync {
    fn elapsed(&self, started: Instant) -> Duration;
}

struct SystemSessionClock;

impl SessionClock for SystemSessionClock {
    fn elapsed(&self, started: Instant) -> Duration {
        started.elapsed()
    }
}

struct SystemProcessExecutor;

impl ProcessExecutor for SystemProcessExecutor {
    fn run(
        &self,
        cancelled: Arc<Mutex<HashSet<String>>>,
        registry: ProcessRegistry,
        session_id: String,
        purpose: String,
        program: String,
        args: Vec<String>,
        cwd: Option<PathBuf>,
        process_timeout: Duration,
    ) -> EngineFuture<'_, ProcessOutput> {
        Box::pin(run_system_process(
            cancelled,
            registry,
            session_id,
            purpose,
            program,
            args,
            cwd,
            process_timeout,
        ))
    }
}

#[derive(Clone)]
struct SessionRuntime {
    data_dir: PathBuf,
    cancelled: Arc<Mutex<HashSet<String>>>,
    browsers: Arc<tokio::sync::Mutex<HashMap<String, BrowserController>>>,
    engine: Arc<dyn ImplementationEngine>,
    processes: Arc<dyn ProcessExecutor>,
    process_registry: ProcessRegistry,
    clock: Arc<dyn SessionClock>,
    app: Option<AppHandle>,
}

impl SessionRuntime {
    fn production(app: &AppHandle) -> Self {
        let state = app.state::<AppState>();
        Self {
            data_dir: state.data_dir.clone(),
            cancelled: state.cancelled.clone(),
            browsers: state.browsers.clone(),
            engine: state.implementation_engine.clone(),
            processes: Arc::new(SystemProcessExecutor),
            process_registry: ProcessRegistry::new(state.data_dir.clone()),
            clock: Arc::new(SystemSessionClock),
            app: Some(app.clone()),
        }
    }

    fn emit(&self, session_id: &str) -> Result<(), String> {
        match &self.app {
            Some(app) => app
                .emit("change-session-event", json!({ "sessionId": session_id }))
                .map_err(display_error),
            None => Ok(()),
        }
    }

    fn is_cancelled(&self, session_id: &str) -> Result<bool, String> {
        Ok(self
            .cancelled
            .lock()
            .map_err(display_error)?
            .contains(session_id))
    }

    #[cfg(test)]
    fn harness(
        data_dir: PathBuf,
        engine: Arc<dyn ImplementationEngine>,
        processes: Arc<dyn ProcessExecutor>,
    ) -> Self {
        let process_registry = ProcessRegistry::new(data_dir.clone());
        Self {
            data_dir,
            cancelled: Arc::new(Mutex::new(HashSet::new())),
            browsers: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            engine,
            processes,
            process_registry,
            clock: Arc::new(SystemSessionClock),
            app: None,
        }
    }
}

pub(crate) struct BrowserController {
    child: Child,
    stdin: ChildStdin,
    lines: Lines<BufReader<ChildStdout>>,
    process_registry: ProcessRegistry,
    process_record_id: String,
    container_name: String,
}

impl BrowserController {
    async fn start(
        data_dir: &Path,
        session_id: &str,
        worktree: &Path,
        config: &AppServerConfig,
        process_registry: ProcessRegistry,
    ) -> Result<Self, String> {
        let helper_path = data_dir.join("browser-controller.cjs");
        let artifacts = artifact_directory(data_dir, session_id);
        fs::create_dir_all(&artifacts)
            .await
            .map_err(display_error)?;
        fs::write(&helper_path, BROWSER_CONTROLLER)
            .await
            .map_err(display_error)?;
        let container_name = docker_container_name(session_id, "agent-browser");
        let mut child = Command::new("docker");
        child
            .args([
                "run",
                "--rm",
                "-i",
                "--init",
                "--name",
                &container_name,
                "--label",
                &format!("code.session={session_id}"),
                "--label",
                "code.purpose=agent-browser",
                "--network",
                "none",
                "--cpus",
                "4",
                "--memory",
                "8g",
                "--pids-limit",
                "512",
                "--security-opt",
                "no-new-privileges",
                "-e",
                "HOME=/tmp",
                "-v",
                &format!("{}:/workspace", worktree.display()),
                "-v",
                &format!("{}:/controller.cjs:ro", helper_path.display()),
                "-v",
                &format!("{}:/artifacts", artifacts.display()),
                "-w",
                "/workspace",
                VERIFICATION_IMAGE,
                "node",
                "/controller.cjs",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = child.spawn().map_err(display_error)?;
        let process_record_id = process_registry.register(
            session_id,
            "agent-browser",
            "container",
            child.id(),
            Some(&container_name),
        )?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Browser controller stdin unavailable".to_string());
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Browser controller stdout unavailable".to_string());
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Browser controller stderr unavailable".to_string());
        let (stdin, stdout, stderr) = match (stdin, stdout, stderr) {
            (Ok(stdin), Ok(stdout), Ok(stderr)) => (stdin, stdout, stderr),
            _ => {
                let _ = child.kill().await;
                let _ = process_registry.finish(&process_record_id);
                return Err("Browser controller streams are unavailable".to_string());
            }
        };
        let log_path = artifacts.join("agent-browser.log");
        insert_artifact(
            data_dir,
            session_id,
            "commandLog",
            &log_path,
            "Agent browser application log",
        )?;
        insert_artifact(
            data_dir,
            session_id,
            "playwrightTrace",
            &artifacts.join("agent-browser-trace.zip"),
            "Agent browser trace",
        )?;
        tauri::async_runtime::spawn(async move {
            let output = read_stream(stderr).await;
            let _ = fs::write(log_path, output).await;
        });
        let mut controller = Self {
            child,
            stdin,
            lines: BufReader::new(stdout).lines(),
            process_registry,
            process_record_id,
            container_name,
        };
        if let Err(error) = controller
            .request(json!({
                "type": "initialize",
                "appServer": config,
            }))
            .await
        {
            controller.stop().await;
            return Err(error);
        }
        Ok(controller)
    }

    async fn request(&mut self, request: Value) -> Result<Value, String> {
        self.stdin
            .write_all(format!("{request}\n").as_bytes())
            .await
            .map_err(display_error)?;
        self.stdin.flush().await.map_err(display_error)?;
        let line = timeout(Duration::from_secs(90), self.lines.next_line())
            .await
            .map_err(|_| "Browser tool timed out".to_string())?
            .map_err(display_error)?
            .ok_or_else(|| "Browser controller stopped".to_string())?;
        let response: Value = serde_json::from_str(&line).map_err(display_error)?;
        if response.get("success").and_then(Value::as_bool) == Some(false) {
            return Err(response
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("Browser tool failed")
                .to_string());
        }
        Ok(response)
    }

    async fn stop(mut self) {
        let _ = self.request(json!({ "type": "close" })).await;
        if let Some(pid) = self.child.id() {
            terminate_pid(pid).await;
        }
        let _ = self.child.kill().await;
        let _ = Command::new("docker")
            .args(["rm", "-f", &self.container_name])
            .output()
            .await;
        let _ = self.process_registry.finish(&self.process_record_id);
    }
}

pub(crate) fn migrate(data_dir: &Path) -> Result<(), String> {
    let connection = super::database(data_dir)?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
               version INTEGER PRIMARY KEY,
               applied_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS repositories (
               id TEXT PRIMARY KEY,
               path TEXT NOT NULL UNIQUE,
               name TEXT NOT NULL,
               head_sha TEXT NOT NULL,
               branch TEXT,
               dirty INTEGER NOT NULL,
               compatible INTEGER NOT NULL,
               compatibility_detail TEXT,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS repository_policies (
               repository_id TEXT PRIMARY KEY,
               manifest_json TEXT NOT NULL,
               fingerprint TEXT NOT NULL,
               fingerprint_paths_json TEXT NOT NULL,
               approved_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS repository_targets (
               id TEXT PRIMARY KEY,
               repository_id TEXT NOT NULL,
               name TEXT NOT NULL,
               path TEXT NOT NULL,
               kind TEXT NOT NULL,
               package_name TEXT,
               scripts_json TEXT NOT NULL,
               source TEXT NOT NULL,
               selected INTEGER NOT NULL,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL,
               UNIQUE(repository_id, path)
             );
             CREATE INDEX IF NOT EXISTS repository_targets_by_repository
               ON repository_targets(repository_id, selected DESC, kind, name);
             CREATE TABLE IF NOT EXISTS change_sessions (
               id TEXT PRIMARY KEY,
               repository_id TEXT NOT NULL,
               target_id TEXT,
               request TEXT NOT NULL,
               base_sha TEXT NOT NULL,
               worktree_path TEXT NOT NULL,
               branch_name TEXT,
               codex_thread_id TEXT,
               status TEXT NOT NULL,
               attempt INTEGER NOT NULL,
               verification_digest TEXT,
               terminal_reason TEXT,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS change_sessions_by_repository
               ON change_sessions(repository_id, created_at DESC);
             CREATE TABLE IF NOT EXISTS session_events (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               session_id TEXT NOT NULL,
               kind TEXT NOT NULL,
               message TEXT NOT NULL,
               created_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS session_events_by_session
               ON session_events(session_id, id);
             CREATE TABLE IF NOT EXISTS session_notification_keys (
               notification_key TEXT PRIMARY KEY,
               session_id TEXT NOT NULL,
               created_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS session_gate_results (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               session_id TEXT NOT NULL,
               kind TEXT NOT NULL,
               required INTEGER NOT NULL,
               status TEXT NOT NULL,
               attempt INTEGER NOT NULL,
               duration_ms INTEGER NOT NULL,
               exit_code INTEGER,
               worktree_digest TEXT NOT NULL,
               artifact_ids_json TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS session_gates_by_session
               ON session_gate_results(session_id, id);
             DELETE FROM session_gate_results
             WHERE id NOT IN (
               SELECT MAX(id) FROM session_gate_results
               GROUP BY session_id, attempt, worktree_digest, kind
             );
             CREATE UNIQUE INDEX IF NOT EXISTS session_gate_result_identity
               ON session_gate_results(session_id, attempt, worktree_digest, kind);
             CREATE TABLE IF NOT EXISTS session_processes (
               id TEXT PRIMARY KEY,
               session_id TEXT NOT NULL,
               purpose TEXT NOT NULL,
               kind TEXT NOT NULL,
               pid INTEGER,
               container_name TEXT,
               started_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS session_processes_by_session
               ON session_processes(session_id, started_at);
             CREATE TABLE IF NOT EXISTS session_approvals (
               request_id_json TEXT PRIMARY KEY,
               session_id TEXT NOT NULL,
               method TEXT NOT NULL,
               detail TEXT NOT NULL,
               status TEXT NOT NULL,
               created_at INTEGER NOT NULL,
               resolved_at INTEGER
             );
             CREATE INDEX IF NOT EXISTS session_approvals_by_session
               ON session_approvals(session_id, created_at);
             CREATE TABLE IF NOT EXISTS session_artifacts (
               id TEXT PRIMARY KEY,
               session_id TEXT NOT NULL,
               kind TEXT NOT NULL,
               path TEXT NOT NULL,
               label TEXT NOT NULL,
               created_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS session_artifacts_by_session
               ON session_artifacts(session_id, created_at);
             CREATE TABLE IF NOT EXISTS session_flow_coverage (
               id TEXT PRIMARY KEY,
               session_id TEXT NOT NULL,
               attempt INTEGER NOT NULL,
               flow_id TEXT NOT NULL,
               scenario_id TEXT NOT NULL,
               target_kind TEXT NOT NULL,
               target_id TEXT NOT NULL,
               status TEXT NOT NULL,
               evidence_artifact_ids_json TEXT NOT NULL,
               worktree_digest TEXT NOT NULL,
               verified_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS session_flow_coverage_by_session
               ON session_flow_coverage(session_id, attempt, flow_id, scenario_id);
             CREATE INDEX IF NOT EXISTS session_flow_coverage_by_target
               ON session_flow_coverage(flow_id, scenario_id, target_kind, target_id, verified_at);
             CREATE TABLE IF NOT EXISTS verification_snapshots (
               session_id TEXT PRIMARY KEY,
               worktree_digest TEXT NOT NULL,
               required INTEGER NOT NULL,
               passed INTEGER NOT NULL,
               failed INTEGER NOT NULL,
               missing INTEGER NOT NULL,
               has_diff INTEGER NOT NULL,
               verified_at INTEGER NOT NULL
             );
             INSERT OR IGNORE INTO schema_migrations(version, applied_at)
               VALUES (1, strftime('%s','now') * 1000);",
        )
        .map_err(display_error)?;
    add_column_if_missing(&connection, "change_sessions", "target_id", "TEXT")?;
    connection
        .execute(
            "UPDATE repository_targets SET kind = 'other' WHERE kind = 'manual'",
            [],
        )
        .map_err(display_error)?;
    Ok(())
}

fn add_column_if_missing(
    connection: &rusqlite::Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(display_error)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    drop(statement);
    if !columns.iter().any(|name| name == column) {
        connection
            .execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])
            .map_err(display_error)?;
    }
    Ok(())
}

pub(crate) fn mark_interrupted(data_dir: &Path) -> Result<(), String> {
    migrate(data_dir)?;
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT id, worktree_path FROM change_sessions
             WHERE status IN ('preparing','implementing','verifying','repairing')",
        )
        .map_err(display_error)?;
    let interrupted = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                PathBuf::from(row.get::<_, String>(1)?),
            ))
        })
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    drop(statement);
    drop(connection);

    let registry = ProcessRegistry::new(data_dir.to_path_buf());
    for (session_id, worktree_path) in interrupted {
        registry.cleanup_session_sync(&session_id)?;
        let reason = if worktree_path.exists() {
            "Desktop process stopped before the session completed; continue or discard the session"
        } else {
            "The app-managed worktree is missing; discard the session or restore it before continuing"
        };
        super::database(data_dir)?
            .execute(
                "UPDATE change_sessions
                 SET status = 'needs_input', terminal_reason = ?2, updated_at = ?3
                 WHERE id = ?1",
                params![session_id, reason, now_ms()],
            )
            .map_err(display_error)?;
    }
    Ok(())
}

pub(crate) async fn cleanup_session_processes(
    data_dir: &Path,
    session_id: &str,
) -> Result<(), String> {
    ProcessRegistry::new(data_dir.to_path_buf())
        .cleanup_session(session_id)
        .await
}

#[tauri::command]
pub(crate) async fn list_repositories(
    state: State<'_, AppState>,
) -> Result<Vec<Repository>, String> {
    migrate(&state.data_dir)?;
    let rows = load_repository_rows(&state.data_dir)?;
    let mut repositories = Vec::with_capacity(rows.len());
    for row in rows {
        repositories.push(repository_view(&state.data_dir, row).await?);
    }
    Ok(repositories)
}

#[tauri::command]
pub(crate) async fn register_repository(
    state: State<'_, AppState>,
    path: String,
) -> Result<Repository, String> {
    migrate(&state.data_dir)?;
    let selected = PathBuf::from(path).canonicalize().map_err(display_error)?;
    let root = command_text(
        "git",
        &["rev-parse", "--show-toplevel"],
        Some(&selected),
        Duration::from_secs(10),
    )
    .await?;
    let root = PathBuf::from(root.trim())
        .canonicalize()
        .map_err(display_error)?;
    let head_sha = git_text(&root, &["rev-parse", "HEAD"]).await?;
    let branch = git_text(&root, &["branch", "--show-current"])
        .await
        .ok()
        .filter(|value| !value.is_empty());
    let dirty = !git_text(&root, &["status", "--porcelain=v1"])
        .await?
        .is_empty();
    let package_exists = root.join("package.json").is_file();
    let lock_exists = root.join("bun.lock").is_file();
    let compatible =
        cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") && package_exists && lock_exists;
    let compatibility_detail = if !cfg!(target_os = "macos") || !cfg!(target_arch = "aarch64") {
        Some("The MVP requires Apple Silicon macOS".to_string())
    } else if !package_exists {
        Some("A root package.json is required".to_string())
    } else if !lock_exists {
        Some("A root bun.lock is required".to_string())
    } else {
        None
    };
    let path_text = root.to_string_lossy().into_owned();
    let existing_id = super::database(&state.data_dir)?
        .query_row(
            "SELECT id FROM repositories WHERE path = ?1",
            [&path_text],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(display_error)?;
    let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Repository")
        .to_string();
    let timestamp = now_ms();
    super::database(&state.data_dir)?
        .execute(
            "INSERT INTO repositories
             (id, path, name, head_sha, branch, dirty, compatible, compatibility_detail,
              created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
             ON CONFLICT(path) DO UPDATE SET
               name = excluded.name,
               head_sha = excluded.head_sha,
               branch = excluded.branch,
               dirty = excluded.dirty,
               compatible = excluded.compatible,
               compatibility_detail = excluded.compatibility_detail,
               updated_at = excluded.updated_at",
            params![
                id,
                path_text,
                name,
                head_sha.trim(),
                branch,
                dirty,
                compatible,
                compatibility_detail,
                timestamp
            ],
        )
        .map_err(display_error)?;
    let row = load_repository_row(&state.data_dir, &id)?
        .ok_or_else(|| "Repository was not stored".to_string())?;
    repository_view(&state.data_dir, row).await
}

#[tauri::command]
pub(crate) async fn refresh_repository(
    state: State<'_, AppState>,
    repository_id: String,
) -> Result<Repository, String> {
    let row = load_repository_row(&state.data_dir, &repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    register_repository(state, row.path.to_string_lossy().into_owned()).await
}

#[tauri::command]
pub(crate) async fn list_repository_targets(
    state: State<'_, AppState>,
    repository_id: String,
) -> Result<Vec<RepositoryTarget>, String> {
    migrate(&state.data_dir)?;
    load_target_rows(&state.data_dir, &repository_id).map(|targets| {
        targets
            .into_iter()
            .map(repository_target_view)
            .collect::<Vec<_>>()
    })
}

#[tauri::command]
pub(crate) async fn scan_repository_targets(
    state: State<'_, AppState>,
    repository_id: String,
    mode: Option<String>,
) -> Result<RepositoryTargetScan, String> {
    migrate(&state.data_dir)?;
    let data_dir = state.data_dir.clone();
    let engine = state.implementation_engine.clone();
    let mode = RepositoryMappingMode::parse(mode.as_deref())?;
    let repository = load_repository_row(&state.data_dir, &repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let existing = load_target_rows(&state.data_dir, &repository_id)?;
    let mapping = map_repository_targets(&data_dir, engine, &repository, &existing, mode).await?;
    Ok(RepositoryTargetScan {
        mode: mapping.mode.as_str().to_string(),
        targets: mapping
            .targets
            .into_iter()
            .map(repository_target_view)
            .collect::<Vec<_>>(),
        assisted: mapping.assisted,
        assistance_detail: mapping.assistance_detail,
    })
}

#[tauri::command]
pub(crate) async fn save_repository_targets(
    state: State<'_, AppState>,
    input: SaveRepositoryTargetsInput,
) -> Result<Vec<RepositoryTarget>, String> {
    migrate(&state.data_dir)?;
    let repository = load_repository_row(&state.data_dir, &input.repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let mut seen = HashSet::new();
    let timestamp = now_ms();
    let rows = input
        .targets
        .into_iter()
        .map(|target| {
            let path = validate_target_path(&target.path)?;
            if !seen.insert(path.clone()) {
                return Err(format!("Duplicate target path: {path}"));
            }
            validate_target_kind(&target.kind)?;
            validate_target_source(&target.source)?;
            let name = target.name.trim();
            if name.is_empty() {
                return Err("Target name cannot be empty".to_string());
            }
            let scripts = target.scripts.unwrap_or_default();
            Ok(RepositoryTargetRow {
                id: target.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
                repository_id: repository.id.clone(),
                name: name.to_string(),
                path,
                kind: normalize_target_kind(&target.kind),
                package_name: target
                    .package_name
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
                scripts,
                source: target.source,
                selected: target.selected,
                created_at: timestamp,
                updated_at: timestamp,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    replace_targets(&state.data_dir, &repository.id, &rows)?;
    load_target_rows(&state.data_dir, &repository.id).map(|targets| {
        targets
            .into_iter()
            .map(repository_target_view)
            .collect::<Vec<_>>()
    })
}

#[tauri::command]
pub(crate) async fn get_target_flow_overview(
    state: State<'_, AppState>,
    repository_id: String,
    target_id: String,
) -> Result<TargetFlowOverview, String> {
    migrate(&state.data_dir)?;
    let repository = load_repository_row(&state.data_dir, &repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let target = load_target_row(&state.data_dir, &target_id)?
        .ok_or_else(|| "Repository target not found".to_string())?;
    if target.repository_id != repository.id {
        return Err("Repository target does not belong to this repository".to_string());
    }
    target_flow_overview(&state.data_dir, &repository, target).await
}

#[tauri::command]
pub(crate) async fn propose_repository_policy(
    state: State<'_, AppState>,
    repository_id: String,
    target_id: Option<String>,
) -> Result<PolicyProposal, String> {
    let repository = load_repository_row(&state.data_dir, &repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    if !repository.compatible {
        return Err(repository
            .compatibility_detail
            .unwrap_or_else(|| "Repository is not compatible with this MVP".to_string()));
    }
    let target = target_id
        .as_deref()
        .map(|target_id| load_target_row(&state.data_dir, target_id))
        .transpose()?
        .flatten();
    if let Some(target) = &target {
        if target.repository_id != repository.id {
            return Err("Repository target does not belong to this repository".to_string());
        }
    }
    propose_policy(&repository.path, target.as_ref()).await
}

#[tauri::command]
pub(crate) async fn approve_repository_policy(
    state: State<'_, AppState>,
    input: ApprovePolicyInput,
) -> Result<Repository, String> {
    validate_manifest(&input.manifest)?;
    let repository = load_repository_row(&state.data_dir, &input.repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let proposal = propose_policy(&repository.path, None).await?;
    let paths = proposal.fingerprint_paths;
    let fingerprint = proposal.fingerprint;
    super::database(&state.data_dir)?
        .execute(
            "INSERT INTO repository_policies
             (repository_id, manifest_json, fingerprint, fingerprint_paths_json, approved_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(repository_id) DO UPDATE SET
               manifest_json = excluded.manifest_json,
               fingerprint = excluded.fingerprint,
               fingerprint_paths_json = excluded.fingerprint_paths_json,
               approved_at = excluded.approved_at",
            params![
                input.repository_id,
                serde_json::to_string(&input.manifest).map_err(display_error)?,
                fingerprint,
                serde_json::to_string(&paths).map_err(display_error)?,
                now_ms()
            ],
        )
        .map_err(display_error)?;
    let row = load_repository_row(&state.data_dir, &repository.id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    repository_view(&state.data_dir, row).await
}

#[tauri::command]
pub(crate) async fn list_change_sessions(
    state: State<'_, AppState>,
    repository_id: Option<String>,
) -> Result<Vec<ChangeSession>, String> {
    migrate(&state.data_dir)?;
    let connection = super::database(&state.data_dir)?;
    let mut sql = "SELECT s.id, s.repository_id, r.name, s.target_id, t.name, t.path,
                          s.request, s.base_sha,
                          s.worktree_path, s.branch_name, s.codex_thread_id, s.status,
                          s.attempt, s.verification_digest, s.terminal_reason,
                          s.created_at, s.updated_at
                   FROM change_sessions s
                   JOIN repositories r ON r.id = s.repository_id
                   LEFT JOIN repository_targets t ON t.id = s.target_id"
        .to_string();
    if repository_id.is_some() {
        sql.push_str(" WHERE s.repository_id = ?1");
    }
    sql.push_str(" ORDER BY s.created_at DESC");
    let mut statement = connection.prepare(&sql).map_err(display_error)?;
    let map = |row: &rusqlite::Row<'_>| {
        Ok(ChangeSession {
            id: row.get(0)?,
            repository_id: row.get(1)?,
            repository_name: row.get(2)?,
            target_id: row.get(3)?,
            target_name: row.get(4)?,
            target_path: row.get(5)?,
            request: row.get(6)?,
            base_sha: row.get(7)?,
            worktree_path: row.get(8)?,
            branch_name: row.get(9)?,
            codex_thread_id: row.get(10)?,
            status: row.get(11)?,
            attempt: row.get(12)?,
            verification_digest: row.get(13)?,
            terminal_reason: row.get(14)?,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
        })
    };
    let rows = if let Some(repository_id) = repository_id {
        statement
            .query_map([repository_id], map)
            .map_err(display_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(display_error)?
    } else {
        statement
            .query_map([], map)
            .map_err(display_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(display_error)?
    };
    Ok(rows)
}

#[tauri::command]
pub(crate) async fn get_change_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<SessionDetail>, String> {
    let Some(session) = load_session_row(&state.data_dir, &session_id)? else {
        return Ok(None);
    };
    let repository = load_repository_row(&state.data_dir, &session.repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let policy = load_policy_row(&state.data_dir, &repository.id)?
        .ok_or_else(|| "Repository policy not found".to_string())?;
    let target = session
        .target_id
        .as_deref()
        .map(|target_id| load_target_row(&state.data_dir, target_id))
        .transpose()?
        .flatten();
    let current_digest = if session.worktree_path.exists() {
        worktree_digest(&session.worktree_path).await?
    } else {
        String::new()
    };
    let snapshot = load_snapshot(&state.data_dir, &session.id)?;
    let verification_stale = session.verification_digest.as_deref() != Some(&current_digest)
        || snapshot
            .as_ref()
            .is_some_and(|value| value.worktree_digest != current_digest);
    let diff = if session.worktree_path.exists() {
        session_diff(&session.worktree_path).await?
    } else {
        String::new()
    };
    Ok(Some(SessionDetail {
        session: session_view(&repository.name, session, target.as_ref()),
        repository: repository_view(&state.data_dir, repository).await?,
        policy: policy_view(
            &repository_path(&state.data_dir, &policy.repository_id)?,
            policy,
        )
        .await?,
        events: load_events(&state.data_dir, &session_id)?,
        gate_results: load_gate_results(&state.data_dir, &session_id)?,
        approvals: load_approvals(&state.data_dir, &session_id)?,
        artifacts: load_artifacts(&state.data_dir, &session_id)?,
        snapshot,
        diff,
        current_digest,
        verification_stale,
    }))
}

#[tauri::command]
pub(crate) async fn start_change_session(
    app: AppHandle,
    state: State<'_, AppState>,
    input: StartSessionInput,
) -> Result<String, String> {
    let request = input.request.trim();
    if request.is_empty() {
        return Err("Change request cannot be empty".to_string());
    }
    let repository = load_repository_row(&state.data_dir, &input.repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let policy = load_policy_row(&state.data_dir, &repository.id)?
        .ok_or_else(|| "Approve a repository policy before starting a change".to_string())?;
    if let Some(target_id) = &input.target_id {
        let target = load_target_row(&state.data_dir, target_id)?
            .ok_or_else(|| "Repository target not found".to_string())?;
        if target.repository_id != repository.id {
            return Err("Repository target does not belong to this repository".to_string());
        }
    }
    ensure_policy_valid(&repository.path, &policy).await?;
    let head_sha = git_text(&repository.path, &["rev-parse", "HEAD"]).await?;
    let session_id = Uuid::new_v4().to_string();
    let worktree = state.data_dir.join("worktrees").join(&session_id);
    fs::create_dir_all(
        worktree
            .parent()
            .ok_or_else(|| "Invalid worktree path".to_string())?,
    )
    .await
    .map_err(display_error)?;
    command_text(
        "git",
        &[
            "worktree",
            "add",
            "--detach",
            worktree
                .to_str()
                .ok_or_else(|| "Worktree path is not valid UTF-8".to_string())?,
            head_sha.trim(),
        ],
        Some(&repository.path),
        Duration::from_secs(60),
    )
    .await?;
    let timestamp = now_ms();
    super::database(&state.data_dir)?
        .execute(
            "INSERT INTO change_sessions
             (id, repository_id, target_id, request, base_sha, worktree_path, status, attempt,
              created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'preparing', 0, ?7, ?7)",
            params![
                session_id,
                repository.id,
                input.target_id,
                request,
                head_sha.trim(),
                worktree.to_string_lossy(),
                timestamp
            ],
        )
        .map_err(display_error)?;
    append_event(
        &state.data_dir,
        &session_id,
        "lifecycle",
        "Change session created from committed HEAD",
    )?;
    append_event(&state.data_dir, &session_id, "user", request)?;
    claim_active_session(&state, &session_id)?;
    let run_id = session_id.clone();
    let app_for_run = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_session_cycle(&app_for_run, &run_id, None, true).await;
        finish_background_cycle(&app_for_run, &run_id, result);
    });
    Ok(session_id)
}

#[tauri::command]
pub(crate) async fn continue_change_session(
    app: AppHandle,
    state: State<'_, AppState>,
    input: ContinueSessionInput,
) -> Result<(), String> {
    let session = load_session_row(&state.data_dir, &input.session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    if !["needs_input", "failed", "cancelled"].contains(&session.status.as_str()) {
        return Err("Only recoverable sessions can be continued".to_string());
    }
    if !session.worktree_path.exists() {
        return Err("The session worktree no longer exists".to_string());
    }
    state
        .cancelled
        .lock()
        .map_err(display_error)?
        .remove(&session.id);
    claim_active_session(&state, &session.id)?;
    let session_id = session.id.clone();
    let message = input.message.trim().to_string();
    if !message.is_empty() {
        append_event(&state.data_dir, &session.id, "user", &message)?;
    }
    let app_for_run = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_session_cycle(
            &app_for_run,
            &session_id,
            (!message.is_empty()).then_some(message),
            true,
        )
        .await;
        finish_background_cycle(&app_for_run, &session_id, result);
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn verify_change_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let session = load_session_row(&state.data_dir, &session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    if ["accepted", "discarded"].contains(&session.status.as_str()) {
        return Err("Final sessions cannot be verified again".to_string());
    }
    state
        .cancelled
        .lock()
        .map_err(display_error)?
        .remove(&session.id);
    claim_active_session(&state, &session.id)?;
    let app_for_run = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_session_cycle(&app_for_run, &session_id, None, false).await;
        finish_background_cycle(&app_for_run, &session_id, result);
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn cancel_change_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    state
        .cancelled
        .lock()
        .map_err(display_error)?
        .insert(session_id.clone());
    append_event(
        &state.data_dir,
        &session_id,
        "system",
        "Cancellation requested",
    )?;
    if let Some(session) = load_session_row(&state.data_dir, &session_id)? {
        if let Some(thread_id) = session.codex_thread_id {
            let _ = state
                .implementation_engine
                .interrupt(thread_id.clone(), None)
                .await;
            if let Some(controller) = state.browsers.lock().await.remove(&thread_id) {
                controller.stop().await;
            }
        }
    }
    ProcessRegistry::new(state.data_dir.clone())
        .cleanup_session(&session_id)
        .await?;
    app.emit("change-session-event", json!({ "sessionId": session_id }))
        .map_err(display_error)
}

#[tauri::command]
pub(crate) async fn accept_change_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<String, String> {
    let session = load_session_row(&state.data_dir, &session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    ensure_session_inactive(&state, &session.id)?;
    let branch = accept_session(&state.data_dir, &session.id).await?;
    app.emit("change-session-event", json!({ "sessionId": session.id }))
        .map_err(display_error)?;
    Ok(branch)
}

#[tauri::command]
pub(crate) async fn export_evidence_report(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<EvidenceReportExport, String> {
    ensure_session_inactive(&state, &session_id)?;
    let export = export_evidence_report_for_session(&state.data_dir, &session_id).await?;
    app.emit("change-session-event", json!({ "sessionId": session_id }))
        .map_err(display_error)?;
    Ok(export)
}

async fn accept_session(data_dir: &Path, session_id: &str) -> Result<String, String> {
    accept_session_inner(data_dir, session_id, false).await
}

async fn accept_session_inner(
    data_dir: &Path,
    session_id: &str,
    simulate_removal_failure: bool,
) -> Result<String, String> {
    let session = load_session_row(data_dir, session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    if session.status != "verified" {
        return Err("Only verified sessions can be accepted".to_string());
    }
    let digest = acceptance_digest(data_dir, &session).await?;
    let repository = load_repository_row(data_dir, &session.repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let branch = branch_name(&session.request, &session.id);
    let branch_ref = format!("refs/heads/{branch}");
    if git_text(
        &repository.path,
        &["show-ref", "--verify", "--quiet", &branch_ref],
    )
    .await
    .is_ok()
    {
        return Err(format!(
            "Local branch `{branch}` already exists; rename or delete it before accepting"
        ));
    }

    git_text(&session.worktree_path, &["add", "-A"]).await?;
    let commit_result = async {
        let tree = git_text(&session.worktree_path, &["write-tree"]).await?;
        let message = format!("Code: {}", compact_title(&session.request));
        git_text(
            &session.worktree_path,
            &[
                "-c",
                "user.name=Code",
                "-c",
                "user.email=code@localhost",
                "commit-tree",
                tree.trim(),
                "-p",
                &session.base_sha,
                "-m",
                &message,
            ],
        )
        .await
    }
    .await;
    let reset_result = git_text(
        &session.worktree_path,
        &["reset", "--mixed", &session.base_sha],
    )
    .await;
    let commit_sha = commit_result?;
    reset_result?;
    if worktree_digest(&session.worktree_path).await? != digest {
        return Err("The verified worktree changed while preparing acceptance".to_string());
    }

    git_text(&repository.path, &["branch", &branch, commit_sha.trim()]).await?;
    let removal = if simulate_removal_failure {
        Err("simulated worktree removal failure".to_string())
    } else {
        command_text(
            "git",
            &[
                "worktree",
                "remove",
                "--force",
                session
                    .worktree_path
                    .to_str()
                    .ok_or_else(|| "Worktree path is not valid UTF-8".to_string())?,
            ],
            Some(&repository.path),
            Duration::from_secs(60),
        )
        .await
    };
    if let Err(error) = removal {
        let _ = git_text(&repository.path, &["branch", "-D", &branch]).await;
        return Err(format!(
            "Could not remove the app-managed worktree; acceptance remains retryable: {error}"
        ));
    }
    update_session(
        data_dir,
        &session.id,
        "accepted",
        Some(&branch),
        None,
        Some(&digest),
    )?;
    append_event(
        data_dir,
        &session.id,
        "lifecycle",
        &format!("Accepted as local branch {branch}"),
    )?;
    Ok(branch)
}

async fn acceptance_digest(data_dir: &Path, session: &SessionRow) -> Result<String, String> {
    let snapshot = load_snapshot(data_dir, &session.id)?
        .ok_or_else(|| "Verification snapshot is missing".to_string())?;
    let digest = worktree_digest(&session.worktree_path).await?;
    if session.verification_digest.as_deref() != Some(&digest)
        || snapshot.worktree_digest != digest
        || snapshot.required == 0
        || snapshot.passed != snapshot.required
        || snapshot.failed != 0
        || snapshot.missing != 0
        || !snapshot.has_diff
    {
        return Err("Verification is stale or incomplete; verify the session again".to_string());
    }
    Ok(digest)
}

async fn export_evidence_report_for_session(
    data_dir: &Path,
    session_id: &str,
) -> Result<EvidenceReportExport, String> {
    let report = build_evidence_report(data_dir, session_id).await?;
    let root = artifact_directory(data_dir, session_id);
    fs::create_dir_all(&root).await.map_err(display_error)?;
    let json_path = root.join("evidence-report.json");
    let markdown_path = root.join("evidence-report.md");
    fs::write(
        &json_path,
        serde_json::to_string_pretty(&report).map_err(display_error)?,
    )
    .await
    .map_err(display_error)?;
    fs::write(&markdown_path, render_evidence_report_markdown(&report))
        .await
        .map_err(display_error)?;
    let (json_artifact, markdown_artifact) =
        replace_report_artifacts(data_dir, session_id, &json_path, &markdown_path)?;

    Ok(EvidenceReportExport {
        report,
        json_artifact,
        markdown_artifact,
    })
}

async fn build_evidence_report(data_dir: &Path, session_id: &str) -> Result<EvidenceReport, String> {
    let session = load_session_row(data_dir, session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    let repository = load_repository_row(data_dir, &session.repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let target = session
        .target_id
        .as_deref()
        .map(|target_id| load_target_row(data_dir, target_id))
        .transpose()?
        .flatten();
    let snapshot = load_snapshot(data_dir, session_id)?
        .ok_or_else(|| "Verification snapshot is missing".to_string())?;
    ensure_reportable_session(data_dir, &session, &snapshot).await?;

    let artifacts = report_artifact_index(
        data_dir,
        session_id,
        &load_artifacts(data_dir, session_id)?,
    )?;
    let artifact_ids = artifacts
        .iter()
        .map(|artifact| artifact.id.clone())
        .collect::<HashSet<_>>();
    let mut gates = Vec::new();
    let mut safety_checks = Vec::new();

    for result in load_gate_results(data_dir, session_id)? {
        let check = report_check(&result, &artifact_ids)?;
        if GATE_ORDER.contains(&result.kind.as_str()) {
            gates.push(check);
        } else if SAFETY_CHECKS.contains(&result.kind.as_str()) {
            safety_checks.push(check);
        } else {
            return Err(format!(
                "Evidence report cannot include unsupported check `{}`",
                result.kind
            ));
        }
    }

    let exported_at = now_ms();
    Ok(EvidenceReport {
        version: 1,
        session_id: session.id,
        repository: EvidenceReportRepository {
            name: repository.name,
            path: repository.path.to_string_lossy().into_owned(),
            branch: repository.branch,
        },
        target: target.map(|target| EvidenceReportTarget {
            name: target.name,
            path: target.path,
            kind: target.kind,
        }),
        task: EvidenceReportTask {
            request_summary: session.request,
        },
        base_commit: session.base_sha,
        accepted_branch: session.branch_name,
        verification: snapshot,
        gates,
        safety_checks,
        artifacts,
        privacy: EvidenceReportPrivacy {
            source_contents_included: false,
            redaction_notes: vec![
                "Repository source contents are not embedded in this report.".to_string(),
                "Artifacts are indexed by metadata only; command logs are redacted before export."
                    .to_string(),
            ],
            notes: vec![
                "Artifact files remain local in app-managed session storage.".to_string(),
            ],
        },
        created_at: exported_at,
        exported_at,
    })
}

async fn ensure_reportable_session(
    data_dir: &Path,
    session: &SessionRow,
    snapshot: &VerificationSnapshot,
) -> Result<(), String> {
    ensure_complete_snapshot(session, snapshot)?;
    match session.status.as_str() {
        "verified" => {
            acceptance_digest(data_dir, session).await?;
            Ok(())
        }
        "accepted" => Ok(()),
        _ => Err(
            "Evidence reports can only be exported for verified or accepted sessions".to_string(),
        ),
    }
}

fn ensure_complete_snapshot(
    session: &SessionRow,
    snapshot: &VerificationSnapshot,
) -> Result<(), String> {
    if session.verification_digest.as_deref() != Some(snapshot.worktree_digest.as_str())
        || snapshot.required == 0
        || snapshot.passed != snapshot.required
        || snapshot.failed != 0
        || snapshot.missing != 0
        || !snapshot.has_diff
    {
        return Err("Verification is stale or incomplete; verify the session again".to_string());
    }
    Ok(())
}

fn report_artifact_index(
    data_dir: &Path,
    session_id: &str,
    artifacts: &[Artifact],
) -> Result<Vec<EvidenceReportArtifactIndexEntry>, String> {
    artifacts
        .iter()
        .filter(|artifact| artifact.kind != "report")
        .map(|artifact| {
            validate_artifact_kind(&artifact.kind)?;
            ensure_artifact_path_confined(data_dir, session_id, Path::new(&artifact.path))?;
            Ok(EvidenceReportArtifactIndexEntry {
                id: artifact.id.clone(),
                kind: artifact.kind.clone(),
                path: artifact.path.clone(),
                label: artifact.label.clone(),
                created_at: artifact.created_at,
            })
        })
        .collect()
}

fn report_check(
    result: &GateResult,
    artifact_ids: &HashSet<String>,
) -> Result<EvidenceReportCheck, String> {
    for artifact_id in &result.artifact_ids {
        if !artifact_ids.contains(artifact_id) {
            return Err(format!(
                "Evidence report check `{}` references unknown artifact {}",
                result.kind, artifact_id
            ));
        }
    }
    Ok(EvidenceReportCheck {
        kind: result.kind.clone(),
        required: result.required,
        status: result.status.clone(),
        attempt: result.attempt,
        duration_ms: result.duration_ms,
        exit_code: result.exit_code,
        artifact_ids: result.artifact_ids.clone(),
    })
}

fn render_evidence_report_markdown(report: &EvidenceReport) -> String {
    let mut output = String::new();
    output.push_str("# Evidence Report\n\n");
    output.push_str("| Field | Value |\n| --- | --- |\n");
    push_markdown_row(&mut output, "Session", &report.session_id);
    push_markdown_row(&mut output, "Repository", &report.repository.name);
    push_markdown_row(&mut output, "Repository path", &report.repository.path);
    if let Some(branch) = &report.repository.branch {
        push_markdown_row(&mut output, "Source branch", branch);
    }
    if let Some(target) = &report.target {
        push_markdown_row(
            &mut output,
            "Target",
            &format!("{} ({}, {})", target.name, target.kind, target.path),
        );
    }
    push_markdown_row(&mut output, "Task", &report.task.request_summary);
    push_markdown_row(&mut output, "Base commit", &report.base_commit);
    if let Some(branch) = &report.accepted_branch {
        push_markdown_row(&mut output, "Accepted branch", branch);
    }
    push_markdown_row(&mut output, "Report exported at", &format!("{} ms", report.exported_at));

    output.push_str("\n## Verification\n\n");
    output.push_str("| Field | Value |\n| --- | --- |\n");
    push_markdown_row(
        &mut output,
        "Worktree digest",
        &report.verification.worktree_digest,
    );
    push_markdown_row(
        &mut output,
        "Required checks",
        &report.verification.required.to_string(),
    );
    push_markdown_row(
        &mut output,
        "Passed checks",
        &report.verification.passed.to_string(),
    );
    push_markdown_row(
        &mut output,
        "Failed checks",
        &report.verification.failed.to_string(),
    );
    push_markdown_row(
        &mut output,
        "Missing checks",
        &report.verification.missing.to_string(),
    );
    push_markdown_row(
        &mut output,
        "Has diff",
        if report.verification.has_diff { "yes" } else { "no" },
    );
    push_markdown_row(
        &mut output,
        "Verified at",
        &format!("{} ms", report.verification.verified_at),
    );

    push_check_table(&mut output, "Verification Gates", &report.gates);
    push_check_table(&mut output, "Safety Checks", &report.safety_checks);

    output.push_str("\n## Artifacts\n\n");
    output.push_str("| Kind | Label | ID | Path |\n| --- | --- | --- | --- |\n");
    for artifact in &report.artifacts {
        output.push_str(&format!(
            "| {} | {} | {} | {} |\n",
            markdown_table_value(&artifact.kind),
            markdown_table_value(&artifact.label),
            markdown_table_value(&artifact.id),
            markdown_table_value(&artifact.path),
        ));
    }
    if report.artifacts.is_empty() {
        output.push_str("| none | none | none | none |\n");
    }

    output.push_str("\n## Privacy\n\n");
    output.push_str("- Source contents included: no\n");
    for note in &report.privacy.redaction_notes {
        output.push_str(&format!("- {}\n", markdown_text(note)));
    }
    for note in &report.privacy.notes {
        output.push_str(&format!("- {}\n", markdown_text(note)));
    }
    output
}

fn push_check_table(output: &mut String, title: &str, checks: &[EvidenceReportCheck]) {
    output.push_str(&format!("\n## {title}\n\n"));
    output.push_str("| Kind | Required | Status | Attempt | Duration | Exit | Artifacts |\n");
    output.push_str("| --- | --- | --- | --- | --- | --- | --- |\n");
    for check in checks {
        output.push_str(&format!(
            "| {} | {} | {} | {} | {:.1}s | {} | {} |\n",
            markdown_table_value(&check.kind),
            if check.required { "yes" } else { "no" },
            markdown_table_value(&check.status),
            check.attempt,
            check.duration_ms as f64 / 1000.0,
            check
                .exit_code
                .map(|code| code.to_string())
                .unwrap_or_else(|| "none".to_string()),
            markdown_table_value(&check.artifact_ids.join(", ")),
        ));
    }
    if checks.is_empty() {
        output.push_str("| none | no | none | 0 | 0.0s | none | none |\n");
    }
}

fn push_markdown_row(output: &mut String, field: &str, value: &str) {
    output.push_str(&format!(
        "| {} | {} |\n",
        markdown_table_value(field),
        markdown_table_value(value)
    ));
}

fn markdown_table_value(value: &str) -> String {
    markdown_text(value).replace('|', "\\|").replace('\n', "<br>")
}

fn markdown_text(value: &str) -> String {
    value.replace('\r', "")
}

fn replace_report_artifacts(
    data_dir: &Path,
    session_id: &str,
    json_path: &Path,
    markdown_path: &Path,
) -> Result<(Artifact, Artifact), String> {
    ensure_artifact_path_confined(data_dir, session_id, json_path)?;
    ensure_artifact_path_confined(data_dir, session_id, markdown_path)?;
    let timestamp = now_ms();
    let json_artifact = Artifact {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        kind: "report".to_string(),
        path: json_path.to_string_lossy().into_owned(),
        label: "Evidence report (JSON)".to_string(),
        created_at: timestamp,
    };
    let markdown_artifact = Artifact {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        kind: "report".to_string(),
        path: markdown_path.to_string_lossy().into_owned(),
        label: "Evidence report (Markdown)".to_string(),
        created_at: timestamp,
    };
    let mut connection = super::database(data_dir)?;
    let transaction = connection.transaction().map_err(display_error)?;
    transaction
        .execute(
            "DELETE FROM session_artifacts WHERE session_id = ?1 AND kind = 'report'",
            [session_id],
        )
        .map_err(display_error)?;
    for artifact in [&json_artifact, &markdown_artifact] {
        transaction
            .execute(
                "INSERT INTO session_artifacts(id, session_id, kind, path, label, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    &artifact.id,
                    &artifact.session_id,
                    &artifact.kind,
                    &artifact.path,
                    &artifact.label,
                    artifact.created_at
                ],
            )
            .map_err(display_error)?;
    }
    transaction.commit().map_err(display_error)?;
    Ok((json_artifact, markdown_artifact))
}

#[tauri::command]
pub(crate) async fn discard_change_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let session = load_session_row(&state.data_dir, &session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    ensure_session_inactive(&state, &session.id)?;
    discard_session(&state.data_dir, &session.id).await?;
    app.emit("change-session-event", json!({ "sessionId": session.id }))
        .map_err(display_error)
}

async fn discard_session(data_dir: &Path, session_id: &str) -> Result<(), String> {
    let session = load_session_row(data_dir, session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    if session.status == "accepted" {
        return Err("Accepted sessions cannot be discarded".to_string());
    }
    if session.status == "discarded" && !session.worktree_path.exists() {
        return Ok(());
    }
    if session.worktree_path.exists() {
        let repository = load_repository_row(data_dir, &session.repository_id)?
            .ok_or_else(|| "Repository not found".to_string())?;
        command_text(
            "git",
            &[
                "worktree",
                "remove",
                "--force",
                session
                    .worktree_path
                    .to_str()
                    .ok_or_else(|| "Worktree path is not valid UTF-8".to_string())?,
            ],
            Some(&repository.path),
            Duration::from_secs(60),
        )
        .await?;
    }
    update_session(data_dir, &session.id, "discarded", None, None, None)?;
    append_event(
        data_dir,
        &session.id,
        "lifecycle",
        "Session worktree discarded",
    )?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn resolve_session_approval(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: Value,
    method: String,
    decision: String,
) -> Result<(), String> {
    let result = approval_result(&method, &decision)?;
    state
        .implementation_engine
        .approval_response(request_id.clone(), result)
        .await?;
    super::database(&state.data_dir)?
        .execute(
            "UPDATE session_approvals SET status = ?2, resolved_at = ?3
             WHERE request_id_json = ?1",
            params![
                serde_json::to_string(&request_id).map_err(display_error)?,
                decision,
                now_ms()
            ],
        )
        .map_err(display_error)?;
    app.emit("change-session-event", json!({}))
        .map_err(display_error)
}

pub(crate) async fn handle_dynamic_tool(app: &AppHandle, message: &Value) -> Result<Value, String> {
    let params = message
        .get("params")
        .ok_or_else(|| "Browser tool request has no params".to_string())?;
    let thread_id = params
        .get("threadId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Browser tool request has no thread id".to_string())?;
    let tool = params
        .get("tool")
        .and_then(Value::as_str)
        .ok_or_else(|| "Browser tool request has no tool name".to_string())?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let state = app.state::<AppState>();
    let mut browsers = state.browsers.lock().await;
    let controller = browsers
        .get_mut(thread_id)
        .ok_or_else(|| "Browser is not configured for this session".to_string())?;
    let response = controller
        .request(json!({ "type": "tool", "tool": tool, "arguments": arguments }))
        .await?;
    let mut content_items = vec![json!({
        "type": "inputText",
        "text": response.get("text").and_then(Value::as_str).unwrap_or("Browser action completed")
    })];
    if let Some(image) = response.get("imageBase64").and_then(Value::as_str) {
        content_items.push(json!({
            "type": "inputImage",
            "imageUrl": format!("data:image/png;base64,{image}")
        }));
    }
    if let Some(session_id) = session_id_for_thread(&state.data_dir, thread_id)? {
        append_event(
            &state.data_dir,
            &session_id,
            "browser",
            &format!("Browser tool `{tool}` completed"),
        )?;
        if let Some(image) = response.get("imageBase64").and_then(Value::as_str) {
            let path = artifact_directory(&state.data_dir, &session_id)
                .join(format!("browser-{}.png", now_ms()));
            fs::create_dir_all(
                path.parent()
                    .ok_or_else(|| "Invalid screenshot path".to_string())?,
            )
            .await
            .map_err(display_error)?;
            fs::write(&path, BASE64.decode(image).map_err(display_error)?)
                .await
                .map_err(display_error)?;
            insert_artifact(
                &state.data_dir,
                &session_id,
                "screenshot",
                &path,
                "Agent browser screenshot",
            )?;
        }
        let _ = app.emit("change-session-event", json!({ "sessionId": session_id }));
    }
    Ok(json!({ "success": true, "contentItems": content_items }))
}

pub(crate) fn record_codex_notification(app: &AppHandle, message: &Value) {
    let Some(thread_id) = message
        .pointer("/params/threadId")
        .or_else(|| message.pointer("/params/thread/id"))
        .and_then(Value::as_str)
    else {
        return;
    };
    let state = app.state::<AppState>();
    let Ok(Some(session_id)) = session_id_for_thread(&state.data_dir, thread_id) else {
        return;
    };
    let method = message
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("agent");
    let detail = message
        .pointer("/params/item/text")
        .or_else(|| message.pointer("/params/message"))
        .and_then(Value::as_str)
        .unwrap_or(method);
    let notification_key = codex_notification_key(thread_id, message);
    let inserted = super::database(&state.data_dir)
        .and_then(|connection| {
            connection
                .execute(
                    "INSERT OR IGNORE INTO session_notification_keys
                     (notification_key, session_id, created_at) VALUES (?1, ?2, ?3)",
                    params![notification_key, session_id, now_ms()],
                )
                .map_err(display_error)
        })
        .unwrap_or(0);
    if inserted == 0 {
        return;
    }
    let detail = redact_sensitive_text(detail);
    let kind = if method.contains("requestApproval") {
        "approval"
    } else if method.contains("fileChange") {
        "file"
    } else if method.contains("command") {
        "command"
    } else {
        "agent"
    };
    if kind == "approval" {
        if let Some(request_id) = message.get("id") {
            let _ = super::database(&state.data_dir).and_then(|connection| {
                connection
                    .execute(
                        "INSERT OR REPLACE INTO session_approvals
                         (request_id_json, session_id, method, detail, status, created_at)
                         VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
                        params![
                            serde_json::to_string(request_id).map_err(display_error)?,
                            session_id,
                            method,
                            detail,
                            now_ms()
                        ],
                    )
                    .map_err(display_error)?;
                Ok(connection)
            });
        }
    }
    let _ = append_event(&state.data_dir, &session_id, kind, &detail);
    let _ = app.emit("change-session-event", json!({ "sessionId": session_id }));
}

fn finish_background_cycle(app: &AppHandle, session_id: &str, result: Result<(), String>) {
    let state = app.state::<AppState>();
    let runtime = SessionRuntime::production(app);
    finish_session_cycle(&runtime, session_id, result);
    if let Ok(mut active) = state.active.lock() {
        active.remove(session_id);
    }
    let app_for_cleanup = app.clone();
    let session_for_cleanup = session_id.to_string();
    tauri::async_runtime::spawn(async move {
        let state = app_for_cleanup.state::<AppState>();
        let thread_id = load_session_row(&state.data_dir, &session_for_cleanup)
            .ok()
            .flatten()
            .and_then(|session| session.codex_thread_id);
        if let Some(thread_id) = thread_id {
            if let Some(controller) = state.browsers.lock().await.remove(&thread_id) {
                controller.stop().await;
            }
        }
    });
    let _ = app.emit("change-session-event", json!({ "sessionId": session_id }));
}

fn finish_session_cycle(runtime: &SessionRuntime, session_id: &str, result: Result<(), String>) {
    if let Err(error) = result {
        let cancelled = runtime.is_cancelled(session_id).unwrap_or(false);
        let status = if cancelled {
            "cancelled"
        } else {
            "needs_input"
        };
        let _ = update_session(
            &runtime.data_dir,
            session_id,
            status,
            None,
            Some(&error),
            None,
        );
        let _ = append_event(&runtime.data_dir, session_id, "system", &error);
    }
    if let Ok(mut cancelled) = runtime.cancelled.lock() {
        cancelled.remove(session_id);
    }
}

async fn run_session_cycle(
    app: &AppHandle,
    session_id: &str,
    continuation: Option<String>,
    run_agent: bool,
) -> Result<(), String> {
    let runtime = SessionRuntime::production(app);
    run_session_cycle_with_runtime(&runtime, session_id, continuation, run_agent).await
}

async fn run_session_cycle_with_runtime(
    runtime: &SessionRuntime,
    session_id: &str,
    continuation: Option<String>,
    run_agent: bool,
) -> Result<(), String> {
    let started = Instant::now();
    let mut session = load_session_row(&runtime.data_dir, session_id)?
        .ok_or_else(|| "Change session not found".to_string())?;
    let repository = load_repository_row(&runtime.data_dir, &session.repository_id)?
        .ok_or_else(|| "Repository not found".to_string())?;
    let policy = load_policy_row(&runtime.data_dir, &session.repository_id)?
        .ok_or_else(|| "Repository policy not found".to_string())?;
    let target = session
        .target_id
        .as_deref()
        .map(|target_id| load_target_row(&runtime.data_dir, target_id))
        .transpose()?
        .flatten();
    ensure_policy_valid(&repository.path, &policy).await?;

    let mut thread_id = session.codex_thread_id.clone();
    if run_agent {
        transition(runtime, session_id, "implementing", 1)?;
        let prompt = scoped_session_prompt(
            &continuation.unwrap_or_else(|| session.request.clone()),
            target.as_ref(),
        );
        thread_id = Some(
            run_engine_turn(
                runtime,
                &session,
                &policy.manifest,
                thread_id,
                &prompt,
                started,
            )
            .await?,
        );
        session.codex_thread_id = thread_id.clone();
    }

    let mut last_failure = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        ensure_cycle_time(runtime, started)?;
        transition(runtime, session_id, "verifying", attempt)?;
        let outcome = verify_session(runtime, &session, &policy, attempt, started).await?;
        if outcome.failures.is_empty() {
            append_event(
                &runtime.data_dir,
                session_id,
                "lifecycle",
                "All required verification checks passed",
            )?;
            return Ok(());
        }
        last_failure = outcome.failures.join("\n\n");
        if !run_agent || attempt == MAX_ATTEMPTS {
            break;
        }
        transition(runtime, session_id, "repairing", attempt + 1)?;
        let repair_prompt = format!(
            "Verification failed against worktree digest {}. Repair the implementation without \
             weakening, deleting, or skipping checks.\n\n{}",
            outcome.digest, last_failure
        );
        append_event(&runtime.data_dir, session_id, "repair", &repair_prompt)?;
        thread_id = Some(
            run_engine_turn(
                runtime,
                &session,
                &policy.manifest,
                thread_id,
                &repair_prompt,
                started,
            )
            .await?,
        );
        session.codex_thread_id = thread_id.clone();
    }
    update_session(
        &runtime.data_dir,
        session_id,
        "needs_input",
        None,
        Some(&last_failure),
        None,
    )?;
    append_event(
        &runtime.data_dir,
        session_id,
        "lifecycle",
        "Verification needs developer input",
    )?;
    Ok(())
}

fn scoped_session_prompt(prompt: &str, target: Option<&RepositoryTargetRow>) -> String {
    let Some(target) = target else {
        return prompt.to_string();
    };
    format!(
        "Target app/package: {} at `{}`. Keep the change focused on this target unless shared code is required.\n\n{}",
        target.name, target.path, prompt
    )
}

async fn run_engine_turn(
    runtime: &SessionRuntime,
    session: &SessionRow,
    manifest: &VerificationManifest,
    thread_id: Option<String>,
    prompt: &str,
    started: Instant,
) -> Result<String, String> {
    ensure_not_cancelled(runtime, &session.id)?;
    ensure_cycle_time(runtime, started)?;
    let tools = if manifest.app_server.is_some() {
        browser_tool_specs()
    } else {
        Vec::new()
    };
    let engine = runtime.engine.clone();
    let thread_id = if let Some(thread_id) = thread_id {
        engine
            .resume_thread(thread_id.clone(), session.worktree_path.clone())
            .await?;
        thread_id
    } else {
        let thread_id = engine
            .start_thread(session.worktree_path.clone(), tools)
            .await?;
        super::database(&runtime.data_dir)?
            .execute(
                "UPDATE change_sessions SET codex_thread_id = ?2, updated_at = ?3 WHERE id = ?1",
                params![session.id, thread_id, now_ms()],
            )
            .map_err(display_error)?;
        thread_id
    };

    if let Some(config) = &manifest.app_server {
        let mut browsers = runtime.browsers.lock().await;
        if !browsers.contains_key(&thread_id) {
            let controller = BrowserController::start(
                &runtime.data_dir,
                &session.id,
                &session.worktree_path,
                config,
                runtime.process_registry.clone(),
            )
            .await?;
            browsers.insert(thread_id.clone(), controller);
        }
    }

    let turn_id = engine
        .start_turn(
            thread_id.clone(),
            session.worktree_path.clone(),
            prompt.to_string(),
        )
        .await?;
    let process_record_id = match runtime.process_registry.register(
        &session.id,
        &format!("codex-turn:{thread_id}:{turn_id}"),
        "codex-turn",
        None,
        None,
    ) {
        Ok(id) => id,
        Err(error) => {
            let _ = engine
                .interrupt(thread_id.clone(), Some(turn_id.clone()))
                .await;
            return Err(error);
        }
    };
    append_event(
        &runtime.data_dir,
        &session.id,
        "agent",
        &format!("Codex turn {turn_id} started"),
    )?;
    let result = wait_for_turn(runtime, &session.id, &thread_id, &turn_id, started).await;
    let _ = runtime.process_registry.finish(&process_record_id);
    result?;
    Ok(thread_id)
}

async fn wait_for_turn(
    runtime: &SessionRuntime,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    started: Instant,
) -> Result<(), String> {
    loop {
        ensure_not_cancelled(runtime, session_id)?;
        ensure_cycle_time(runtime, started)?;
        match runtime
            .engine
            .turn_status(thread_id.to_string(), turn_id.to_string())
            .await?
        {
            EngineTurnStatus::Completed => return Ok(()),
            EngineTurnStatus::Failed => return Err("Implementation turn failed".to_string()),
            EngineTurnStatus::Interrupted => {
                return Err("Implementation turn was interrupted".to_string())
            }
            EngineTurnStatus::Running => sleep(Duration::from_secs(1)).await,
        }
    }
}

struct VerificationOutcome {
    digest: String,
    failures: Vec<String>,
}

struct SafetyOutcome {
    failed_checks: usize,
    failures: Vec<String>,
    results: Vec<PendingGateResult>,
    events: Vec<String>,
}

struct SecretScanOutcome {
    passed: bool,
    finding_count: usize,
    message: String,
}

async fn verify_session(
    runtime: &SessionRuntime,
    session: &SessionRow,
    policy: &PolicyRow,
    attempt: u32,
    started: Instant,
) -> Result<VerificationOutcome, String> {
    let manifest = &policy.manifest;
    if let Some(thread_id) = &session.codex_thread_id {
        if let Some(controller) = runtime.browsers.lock().await.remove(thread_id) {
            controller.stop().await;
        }
    }
    let digest = worktree_digest(&session.worktree_path).await?;
    clear_flow_coverage_session(&runtime.data_dir, &session.id)?;
    let safety = run_safety_checks(runtime, session, policy, attempt, &digest).await?;
    let mut failures = safety.failures;
    let mut results = safety.results;
    let safety_events = safety.events;
    let after_safety = worktree_digest(&session.worktree_path).await?;
    if after_safety != digest {
        failures.push(
            "Verification aborted: safety checks changed the worktree; rerun verification"
                .to_string(),
        );
        return Ok(VerificationOutcome { digest, failures });
    }

    for kind in GATE_ORDER {
        let Some(gate) = manifest.gates.get(kind) else {
            continue;
        };
        ensure_not_cancelled(runtime, &session.id)?;
        ensure_cycle_time(runtime, started)?;
        let gate_started = Instant::now();
        let result = run_gate(runtime, session, manifest, kind, gate, started).await?;
        let mut status = if result.exit_code == Some(0) && !result.timed_out && !result.cancelled {
            "passed"
        } else {
            "failed"
        };
        let log_path = artifact_directory(&runtime.data_dir, &session.id)
            .join(format!("attempt-{attempt}-{kind}.log"));
        fs::create_dir_all(
            log_path
                .parent()
                .ok_or_else(|| "Invalid gate log path".to_string())?,
        )
        .await
        .map_err(display_error)?;
        let redacted_output = redact_sensitive_text(&result.output);
        fs::write(&log_path, &redacted_output)
            .await
            .map_err(display_error)?;
        let artifact_id = insert_artifact(
            &runtime.data_dir,
            &session.id,
            "commandLog",
            &log_path,
            &format!("{kind} attempt {attempt}"),
        )?;
        let mut artifact_ids = vec![artifact_id];
        if kind == "e2e" {
            match ingest_flow_coverage_report(
                &runtime.data_dir,
                &session.id,
                attempt,
                &digest,
                &artifact_directory(&runtime.data_dir, &session.id),
            )
            .await
            {
                Ok(mut coverage_artifact_ids) => artifact_ids.append(&mut coverage_artifact_ids),
                Err(error) => {
                    status = "failed";
                    failures.push(format!("Gate `e2e` produced invalid flow coverage: {error}"));
                }
            }
        }
        results.push(PendingGateResult {
            kind: kind.to_string(),
            required: gate.required,
            status: status.to_string(),
            attempt,
            duration_ms: gate_started.elapsed().as_millis() as u64,
            exit_code: result.exit_code,
            worktree_digest: digest.clone(),
            artifact_ids,
        });
        if gate.required {
            if status != "passed" {
                failures.push(format!(
                    "Gate `{kind}` failed (exit {:?}). Review its redacted command log.",
                    result.exit_code
                ));
            }
        }
        let after_gate = worktree_digest(&session.worktree_path).await?;
        if after_gate != digest {
            failures.push(format!(
                "Verification aborted: gate `{kind}` changed the worktree; rerun verification"
            ));
            return Ok(VerificationOutcome { digest, failures });
        }
        runtime.emit(&session.id)?;
    }

    let patch = session_diff(&session.worktree_path).await?;
    let has_diff = !patch.trim().is_empty();
    let final_digest = worktree_digest(&session.worktree_path).await?;
    if final_digest != digest {
        failures.push(
            "Verification aborted: the worktree changed before snapshot creation".to_string(),
        );
        return Ok(VerificationOutcome { digest, failures });
    }
    results.push(PendingGateResult {
        kind: "stability".to_string(),
        required: true,
        status: "passed".to_string(),
        attempt,
        duration_ms: 0,
        exit_code: Some(0),
        worktree_digest: digest.clone(),
        artifact_ids: Vec::new(),
    });
    let patch_path = artifact_directory(&runtime.data_dir, &session.id).join("change.patch");
    fs::write(&patch_path, patch).await.map_err(display_error)?;
    insert_artifact(
        &runtime.data_dir,
        &session.id,
        "patch",
        &patch_path,
        "Session patch",
    )?;
    let expected_required = SAFETY_CHECKS
        .iter()
        .map(|kind| (*kind).to_string())
        .chain(
            manifest
                .gates
                .iter()
                .filter(|(_, gate)| gate.required)
                .map(|(kind, _)| kind.clone()),
        )
        .collect::<HashSet<_>>();
    commit_verification_attempt(
        &runtime.data_dir,
        &session.id,
        attempt,
        &digest,
        &results,
        &expected_required,
        has_diff,
        failures.is_empty(),
    )?;
    for event in safety_events {
        append_event(&runtime.data_dir, &session.id, "gate", &event)?;
    }
    runtime.emit(&session.id)?;
    Ok(VerificationOutcome { digest, failures })
}

async fn run_safety_checks(
    runtime: &SessionRuntime,
    session: &SessionRow,
    policy: &PolicyRow,
    attempt: u32,
    digest: &str,
) -> Result<SafetyOutcome, String> {
    let statuses = changed_paths(&session.worktree_path).await?;
    let diff = session_diff(&session.worktree_path).await?;
    let mut outcome = SafetyOutcome {
        failed_checks: 0,
        failures: Vec::new(),
        results: Vec::new(),
        events: Vec::new(),
    };
    let has_diff = !statuses.is_empty() && !diff.trim().is_empty();
    push_safety_result(
        &mut outcome,
        "diff",
        has_diff,
        attempt,
        digest,
        if has_diff {
            "Non-empty diff"
        } else {
            "The session produced no repository changes"
        },
    );
    if !has_diff {
        outcome
            .failures
            .push("Safety check `diff` failed: the session produced no changes".to_string());
    }

    let secret_scan = if has_diff {
        run_secret_scanner(runtime, session, attempt, &diff).await?
    } else {
        SecretScanOutcome {
            passed: true,
            finding_count: 0,
            message: "No changed lines to scan for secrets".to_string(),
        }
    };
    push_safety_result(
        &mut outcome,
        "secrets",
        secret_scan.passed,
        attempt,
        digest,
        &secret_scan.message,
    );
    if !secret_scan.passed {
        outcome.failures.push(format!(
            "Safety check `secrets` failed: {} redacted finding(s) or scanner failure",
            secret_scan.finding_count
        ));
    }

    let symlink_errors = escaping_symlinks(&session.worktree_path, &statuses)?;
    push_safety_result(
        &mut outcome,
        "symlinks",
        symlink_errors.is_empty(),
        attempt,
        digest,
        if symlink_errors.is_empty() {
            "Changed symlinks stay inside the worktree"
        } else {
            "A changed symlink escapes the worktree"
        },
    );
    outcome.failures.extend(symlink_errors);

    let large_files = oversized_added_files(&session.worktree_path, &statuses)?;
    push_safety_result(
        &mut outcome,
        "fileSize",
        large_files.is_empty(),
        attempt,
        digest,
        if large_files.is_empty() {
            "New files are within the 5 MiB limit"
        } else {
            "A newly added file exceeds 5 MiB"
        },
    );
    outcome.failures.extend(large_files);

    let file_mode_changes = unsafe_file_mode_changes(&session.worktree_path).await?;
    push_safety_result(
        &mut outcome,
        "fileMode",
        file_mode_changes.is_empty(),
        attempt,
        digest,
        if file_mode_changes.is_empty() {
            "Tracked file modes are unchanged"
        } else {
            "A tracked file mode changed"
        },
    );
    outcome.failures.extend(file_mode_changes);

    let fingerprint_paths = fingerprint_paths(&session.worktree_path)?;
    let policy_fingerprint = fingerprint_files(&session.worktree_path, &fingerprint_paths).await?;
    let policy_valid =
        fingerprint_paths == policy.fingerprint_paths && policy_fingerprint == policy.fingerprint;
    push_safety_result(
        &mut outcome,
        "policy",
        policy_valid,
        attempt,
        digest,
        if policy_valid {
            "Approved package configuration is unchanged"
        } else {
            "Package configuration changed after policy approval"
        },
    );
    if !policy_valid {
        outcome.failures.push(
            "Safety check `policy` failed: package configuration changed after approval"
                .to_string(),
        );
    }

    Ok(outcome)
}

async fn run_secret_scanner(
    runtime: &SessionRuntime,
    session: &SessionRow,
    attempt: u32,
    diff: &str,
) -> Result<SecretScanOutcome, String> {
    let path = artifact_directory(&runtime.data_dir, &session.id)
        .join(format!("attempt-{attempt}-secret-scan.patch"));
    fs::create_dir_all(
        path.parent()
            .ok_or_else(|| "Invalid secret scanner input path".to_string())?,
    )
    .await
    .map_err(display_error)?;
    fs::write(&path, diff).await.map_err(display_error)?;
    let args = vec![
        "run".to_string(),
        "--rm".to_string(),
        "--init".to_string(),
        "--label".to_string(),
        format!("code.session={}", session.id),
        "--label".to_string(),
        "code.purpose=secret-scan".to_string(),
        "--network".to_string(),
        "none".to_string(),
        "--cpus".to_string(),
        "1".to_string(),
        "--memory".to_string(),
        "512m".to_string(),
        "--pids-limit".to_string(),
        "64".to_string(),
        "--security-opt".to_string(),
        "no-new-privileges".to_string(),
        "-v".to_string(),
        format!("{}:/tmp/change.patch:ro", path.display()),
        VERIFICATION_IMAGE.to_string(),
        "code-secret-scanner".to_string(),
        "/tmp/change.patch".to_string(),
    ];
    let result = run_process(
        runtime,
        &session.id,
        "secret-scan",
        "docker",
        &args,
        None,
        Duration::from_secs(60),
    )
    .await;
    let _ = fs::remove_file(&path).await;
    let result = result?;
    if result.timed_out || result.cancelled || !matches!(result.exit_code, Some(0 | 1)) {
        return Ok(SecretScanOutcome {
            passed: false,
            finding_count: 0,
            message: "Secret scanner was unavailable or failed closed".to_string(),
        });
    }
    let findings = match parse_secret_findings(&result.output) {
        Ok(findings) => findings,
        Err(_) => {
            return Ok(SecretScanOutcome {
                passed: false,
                finding_count: 0,
                message: "Secret scanner returned malformed output and failed closed".to_string(),
            })
        }
    };
    let expected_exit = if findings.is_empty() {
        Some(0)
    } else {
        Some(1)
    };
    if result.exit_code != expected_exit {
        return Ok(SecretScanOutcome {
            passed: false,
            finding_count: 0,
            message: "Secret scanner exit status did not match its findings".to_string(),
        });
    }
    Ok(SecretScanOutcome {
        passed: findings.is_empty(),
        finding_count: findings.len(),
        message: if findings.is_empty() {
            "Pinned scanner found no secrets in added lines".to_string()
        } else {
            format!(
                "Pinned scanner reported {} redacted finding(s)",
                findings.len()
            )
        },
    })
}

fn parse_secret_findings(output: &str) -> Result<Vec<(String, String, u64)>, String> {
    let value: Value = serde_json::from_str(output.trim()).map_err(display_error)?;
    let findings = value
        .as_array()
        .ok_or_else(|| "Secret scanner output must be an array".to_string())?;
    findings
        .iter()
        .map(|finding| {
            let object = finding
                .as_object()
                .ok_or_else(|| "Secret scanner finding must be an object".to_string())?;
            if object.len() != 3
                || !object.contains_key("rule")
                || !object.contains_key("file")
                || !object.contains_key("line")
            {
                return Err("Secret scanner finding contains unsupported fields".to_string());
            }
            let rule = object
                .get("rule")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "Secret scanner rule is invalid".to_string())?;
            let file = object
                .get("file")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "Secret scanner file is invalid".to_string())?;
            let line = object
                .get("line")
                .and_then(Value::as_u64)
                .filter(|value| *value > 0)
                .ok_or_else(|| "Secret scanner line is invalid".to_string())?;
            Ok((rule.to_string(), file.to_string(), line))
        })
        .collect()
}

fn push_safety_result(
    outcome: &mut SafetyOutcome,
    kind: &str,
    passed: bool,
    attempt: u32,
    digest: &str,
    message: &str,
) {
    if !passed {
        outcome.failed_checks += 1;
    }
    outcome.results.push(PendingGateResult {
        kind: kind.to_string(),
        required: true,
        status: if passed { "passed" } else { "failed" }.to_string(),
        attempt,
        duration_ms: 0,
        exit_code: Some(if passed { 0 } else { 1 }),
        worktree_digest: digest.to_string(),
        artifact_ids: Vec::new(),
    });
    outcome.events.push(message.to_string());
}

async fn run_gate(
    runtime: &SessionRuntime,
    session: &SessionRow,
    manifest: &VerificationManifest,
    kind: &str,
    gate: &VerificationCommand,
    started: Instant,
) -> Result<ProcessOutput, String> {
    validate_gate_network(kind, gate)?;
    let remaining = MAX_CYCLE_TIME
        .checked_sub(runtime.clock.elapsed(started))
        .ok_or_else(|| "Session exceeded the 30 minute cycle limit".to_string())?;
    let gate_timeout = Duration::from_millis(gate.timeout_ms).min(remaining);
    if matches!(kind, "accessibility" | "e2e" | "visual") {
        if let Some(server) = &manifest.app_server {
            return run_app_gate(runtime, session, server, kind, gate, gate_timeout).await;
        }
    }
    let artifacts = artifact_directory(&runtime.data_dir, &session.id);
    fs::create_dir_all(&artifacts).await.map_err(display_error)?;
    let mut args = restricted_docker_args(&session.worktree_path, &gate.network, Some(&artifacts));
    add_docker_labels(&mut args, &session.id, &format!("gate-{kind}"));
    if kind == "e2e" {
        args.extend([
            "-e".to_string(),
            format!("{FLOW_COVERAGE_REPORT_ENV}=/artifacts/{FLOW_COVERAGE_REPORT_FILE}"),
        ]);
    }
    for (key, value) in gate.env.as_ref().into_iter().flatten() {
        args.extend(["-e".to_string(), format!("{key}={value}")]);
    }
    args.push(VERIFICATION_IMAGE.to_string());
    args.push(gate.command.clone());
    args.extend(gate.args.clone());
    run_process(
        runtime,
        &session.id,
        &format!("gate-{kind}"),
        "docker",
        &args,
        None,
        gate_timeout,
    )
    .await
}

async fn run_app_gate(
    runtime: &SessionRuntime,
    session: &SessionRow,
    server: &AppServerConfig,
    kind: &str,
    gate: &VerificationCommand,
    gate_timeout: Duration,
) -> Result<ProcessOutput, String> {
    let name = docker_container_name(&session.id, "application-server");
    let verifier_path = runtime.data_dir.join("browser-verifier.cjs");
    fs::write(&verifier_path, BROWSER_VERIFIER)
        .await
        .map_err(display_error)?;
    let artifacts = artifact_directory(&runtime.data_dir, &session.id);
    fs::create_dir_all(&artifacts).await.map_err(display_error)?;
    let mut start_args = restricted_docker_args(&session.worktree_path, "disabled", Some(&artifacts));
    start_args.extend(["-d".to_string(), "--name".to_string(), name.clone()]);
    add_docker_labels(&mut start_args, &session.id, "application-server");
    start_args.extend([
        "-v".to_string(),
        format!("{}:/browser-verifier.cjs:ro", verifier_path.display()),
    ]);
    for (key, value) in server.env.as_ref().into_iter().flatten() {
        start_args.extend(["-e".to_string(), format!("{key}={value}")]);
    }
    start_args.push(VERIFICATION_IMAGE.to_string());
    start_args.push(server.command.clone());
    start_args.extend(server.args.clone());
    let container_record_id = runtime.process_registry.register(
        &session.id,
        "application-server",
        "container",
        None,
        Some(&name),
    )?;
    let start = run_process(
        runtime,
        &session.id,
        "application-server-start",
        "docker",
        &start_args,
        None,
        Duration::from_secs(30),
    )
    .await?;
    if start.exit_code != Some(0) {
        let _ = run_process(
            runtime,
            &session.id,
            "application-server-cleanup",
            "docker",
            &["rm".to_string(), "-f".to_string(), name.clone()],
            None,
            Duration::from_secs(15),
        )
        .await;
        let _ = runtime.process_registry.finish(&container_record_id);
        return Ok(start);
    }
    let execution = async {
        let deadline = Instant::now() + Duration::from_millis(server.health_timeout_ms);
        let mut health_failure = None;
        loop {
            let health = run_process(
                runtime,
                &session.id,
                "application-server-health",
                "docker",
                &[
                    "exec".to_string(),
                    name.clone(),
                    "curl".to_string(),
                    "-fsS".to_string(),
                    server.health_url.clone(),
                ],
                None,
                Duration::from_secs(10),
            )
            .await?;
            if health.exit_code == Some(0) {
                break;
            }
            if Instant::now() >= deadline {
                health_failure = Some(health);
                break;
            }
            sleep(Duration::from_millis(500)).await;
        }
        if let Some(failure) = health_failure {
            Ok(failure)
        } else {
            let smoke = run_process(
                runtime,
                &session.id,
                "browser-verification",
                "docker",
                &[
                    "exec".to_string(),
                    name.clone(),
                    "node".to_string(),
                    "/browser-verifier.cjs".to_string(),
                    server.browser_base_url.clone(),
                ],
                None,
                Duration::from_secs(45),
            )
            .await?;
            if smoke.exit_code != Some(0) {
                Ok(smoke)
            } else {
                let mut args = vec!["exec".to_string()];
                if kind == "e2e" {
                    args.extend([
                        "-e".to_string(),
                        format!("{FLOW_COVERAGE_REPORT_ENV}=/artifacts/{FLOW_COVERAGE_REPORT_FILE}"),
                    ]);
                }
                for (key, value) in gate.env.as_ref().into_iter().flatten() {
                    args.extend(["-e".to_string(), format!("{key}={value}")]);
                }
                args.push(name.clone());
                args.push(gate.command.clone());
                args.extend(gate.args.clone());
                run_process(
                    runtime,
                    &session.id,
                    "browser-gate",
                    "docker",
                    &args,
                    None,
                    gate_timeout,
                )
                .await
            }
        }
    }
    .await;
    let logs = run_process(
        runtime,
        &session.id,
        "application-server-logs",
        "docker",
        &["logs".to_string(), name.clone()],
        None,
        Duration::from_secs(10),
    )
    .await
    .ok();
    let cleanup = run_process(
        runtime,
        &session.id,
        "application-server-cleanup",
        "docker",
        &["rm".to_string(), "-f".to_string(), name.clone()],
        None,
        Duration::from_secs(15),
    )
    .await;
    let _ = runtime.process_registry.finish(&container_record_id);
    let mut result = execution?;
    if let Some(logs) = logs {
        result.output.push_str("\n\nApplication server:\n");
        result.output.push_str(&logs.output);
    }
    cleanup?;
    Ok(result)
}

async fn run_process(
    runtime: &SessionRuntime,
    session_id: &str,
    purpose: &str,
    program: &str,
    args: &[String],
    cwd: Option<&Path>,
    process_timeout: Duration,
) -> Result<ProcessOutput, String> {
    runtime
        .processes
        .run(
            runtime.cancelled.clone(),
            runtime.process_registry.clone(),
            session_id.to_string(),
            purpose.to_string(),
            program.to_string(),
            args.to_vec(),
            cwd.map(Path::to_path_buf),
            process_timeout,
        )
        .await
}

async fn run_system_process(
    cancelled_sessions: Arc<Mutex<HashSet<String>>>,
    registry: ProcessRegistry,
    session_id: String,
    purpose: String,
    program: String,
    args: Vec<String>,
    cwd: Option<PathBuf>,
    process_timeout: Duration,
) -> Result<ProcessOutput, String> {
    let mut command = Command::new(&program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(cwd) = &cwd {
        command.current_dir(cwd);
    }
    let mut child = command.spawn().map_err(display_error)?;
    let process_id = registry.register(
        &session_id,
        &purpose,
        if program == "docker" {
            "docker-cli"
        } else {
            "process"
        },
        child.id(),
        None,
    )?;
    let result = async {
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| format!("{program} stdout unavailable"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| format!("{program} stderr unavailable"))?;
        let stdout_task = tokio::spawn(read_stream(stdout));
        let stderr_task = tokio::spawn(read_stream(stderr));
        let deadline = Instant::now() + process_timeout;
        let (exit_code, timed_out, cancelled) = loop {
            if cancelled_sessions
                .lock()
                .map_err(display_error)?
                .contains(&session_id)
            {
                terminate_child(&mut child).await;
                break (None, false, true);
            }
            if Instant::now() >= deadline {
                terminate_child(&mut child).await;
                break (None, true, false);
            }
            if let Some(status) = child.try_wait().map_err(display_error)? {
                break (status.code(), false, false);
            }
            sleep(Duration::from_millis(150)).await;
        };
        let stdout = stdout_task.await.unwrap_or_default();
        let stderr = stderr_task.await.unwrap_or_default();
        Ok(ProcessOutput {
            exit_code,
            output: format!("{stdout}{stderr}"),
            timed_out,
            cancelled,
        })
    }
    .await;
    let finish = registry.finish(&process_id);
    match (result, finish) {
        (Ok(output), Ok(())) => Ok(output),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error),
    }
}

async fn terminate_child(child: &mut Child) {
    if let Some(pid) = child.id() {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
            .await;
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if child.try_wait().ok().flatten().is_some() {
                return;
            }
            sleep(Duration::from_millis(50)).await;
        }
    }
    let _ = child.kill().await;
}

async fn terminate_pid(pid: u32) {
    let _ = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output()
        .await;
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        let alive = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .await
            .is_ok_and(|output| output.status.success());
        if !alive {
            return;
        }
        sleep(Duration::from_millis(50)).await;
    }
    let _ = Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .output()
        .await;
}

fn terminate_pid_sync(pid: u32) {
    let _ = SystemCommand::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output();
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while std::time::Instant::now() < deadline {
        let alive = SystemCommand::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .is_ok_and(|output| output.status.success());
        if !alive {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = SystemCommand::new("kill")
        .args(["-KILL", &pid.to_string()])
        .output();
}

async fn cleanup_labeled_containers(session_id: &str) {
    let Ok(output) = Command::new("docker")
        .args([
            "ps",
            "-aq",
            "--filter",
            &format!("label=code.session={session_id}"),
        ])
        .output()
        .await
    else {
        return;
    };
    for id in String::from_utf8_lossy(&output.stdout).split_whitespace() {
        let _ = Command::new("docker").args(["rm", "-f", id]).output().await;
    }
}

fn cleanup_labeled_containers_sync(session_id: &str) {
    let Ok(output) = SystemCommand::new("docker")
        .args([
            "ps",
            "-aq",
            "--filter",
            &format!("label=code.session={session_id}"),
        ])
        .output()
    else {
        return;
    };
    for id in String::from_utf8_lossy(&output.stdout).split_whitespace() {
        let _ = SystemCommand::new("docker").args(["rm", "-f", id]).output();
    }
}

async fn read_stream<R: tokio::io::AsyncRead + Unpin>(mut reader: R) -> String {
    use tokio::io::AsyncReadExt;
    let mut output = String::new();
    let _ = reader.read_to_string(&mut output).await;
    output
}

async fn propose_policy(
    repository: &Path,
    target: Option<&RepositoryTargetRow>,
) -> Result<PolicyProposal, String> {
    let scripts = if let Some(target) = target {
        target.scripts.clone()
    } else {
        let package: Value = serde_json::from_slice(&git_blob(repository, "package.json").await?)
            .map_err(display_error)?;
        package_scripts(&package)
    };
    let manifest = default_manifest_with_filter(&scripts, target.and_then(|target| target.package_name.as_deref()));
    let fingerprint_paths = committed_fingerprint_paths(repository).await?;
    let fingerprint = fingerprint_committed_files(repository, &fingerprint_paths).await?;
    Ok(PolicyProposal {
        manifest,
        fingerprint,
        fingerprint_paths,
        detected_scripts: scripts.keys().cloned().collect(),
    })
}

async fn discover_repository_targets(
    repository: &RepositoryRow,
) -> Result<Vec<RepositoryTargetRow>, String> {
    let package_paths = committed_package_paths(&repository.path).await?;
    let tracked_paths = git_text(&repository.path, &["ls-tree", "-r", "--name-only", "HEAD"])
        .await?
        .lines()
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let root_package: Option<Value> = git_blob(&repository.path, "package.json")
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok());
    let has_nested_packages = package_paths.iter().any(|path| path != "package.json");
    let root_is_workspace =
        has_nested_packages && root_package.as_ref().is_some_and(package_has_workspaces);
    let timestamp = now_ms();
    let mut targets = Vec::new();

    for package_path in package_paths {
        if package_path == "package.json" && root_is_workspace {
            continue;
        }
        let package: Value = serde_json::from_slice(&git_blob(&repository.path, &package_path).await?)
            .map_err(display_error)?;
        let scripts = package_scripts(&package);
        let package_name = package
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string);
        let target_path = package_directory(&package_path);
        let kind = classify_target(&target_path, &scripts, &tracked_paths);
        let name = target_name(&repository.name, &target_path, package_name.as_deref());
        targets.push(RepositoryTargetRow {
            id: Uuid::new_v4().to_string(),
            repository_id: repository.id.clone(),
            name,
            path: target_path,
            kind,
            package_name,
            scripts,
            source: "detected".to_string(),
            selected: true,
            created_at: timestamp,
            updated_at: timestamp,
        });
    }

    targets.sort_by(|left, right| {
        target_kind_rank(&left.kind)
            .cmp(&target_kind_rank(&right.kind))
            .then(left.path.cmp(&right.path))
    });
    targets.dedup_by(|left, right| left.path == right.path);
    Ok(targets)
}

async fn map_repository_targets(
    data_dir: &Path,
    engine: Arc<dyn ImplementationEngine>,
    repository: &RepositoryRow,
    existing: &[RepositoryTargetRow],
    mode: RepositoryMappingMode,
) -> Result<RepositoryMappingOutput, String> {
    let input = RepositoryMappingInput {
        repository,
        existing,
    };
    match mode {
        RepositoryMappingMode::Code => {
            match (CodeRepositoryMapper {
                data_dir: data_dir.to_path_buf(),
                engine,
            })
            .map(input)
            .await
            {
                Ok(mapping) => Ok(mapping),
                Err(error) => {
                    let mut fallback = DeterministicRepositoryMapper { mode }
                        .map(RepositoryMappingInput {
                            repository,
                            existing,
                        })
                        .await?;
                    fallback.assistance_detail =
                        Some(repository_mapping_fallback_detail(mode, &error));
                    Ok(fallback)
                }
            }
        }
        RepositoryMappingMode::Claude | RepositoryMappingMode::CloudApi => {
            DeterministicRepositoryMapper { mode }.map(input).await
        }
    }
}

fn parse_ai_repository_map_document(
    repository: &RepositoryRow,
    mode: RepositoryMappingMode,
    text: &str,
) -> Result<Vec<RepositoryTargetRow>, String> {
    let document: AiRepositoryMapDocument = serde_json::from_str(text).map_err(display_error)?;
    if document.version != 1 {
        return Err("AI repository map version must be 1".to_string());
    }
    if document.mode != mode.as_str() {
        return Err(format!(
            "AI repository map mode `{}` did not match requested mode `{}`",
            document.mode,
            mode.as_str()
        ));
    }
    if document.targets.is_empty() {
        return Err("AI repository map must include at least one target".to_string());
    }

    let timestamp = now_ms();
    let mut seen = HashSet::new();
    let mut targets = Vec::new();
    for target in document.targets {
        let name = target.name.trim();
        if name.is_empty() {
            return Err("AI repository map target name cannot be empty".to_string());
        }
        let path = validate_target_path(&target.path)?;
        if !seen.insert(path.clone()) {
            return Err(format!("Duplicate AI repository map target path: {path}"));
        }
        validate_target_kind(&target.kind)?;
        let package_name = target
            .package_name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        targets.push(RepositoryTargetRow {
            id: Uuid::new_v4().to_string(),
            repository_id: repository.id.clone(),
            name: name.to_string(),
            path,
            kind: normalize_target_kind(&target.kind),
            package_name,
            scripts: target.scripts,
            source: "codex".to_string(),
            selected: target.selected,
            created_at: timestamp,
            updated_at: timestamp,
        });
    }
    Ok(targets)
}

async fn repository_mapping_summary(
    repository: &RepositoryRow,
    existing: &[RepositoryTargetRow],
) -> Result<Value, String> {
    let candidates = discover_repository_targets(repository).await?;
    let tracked_paths = repository_mapping_tracked_paths(&repository.path).await?;
    Ok(json!({
        "version": 1,
        "repository": {
            "name": repository.name,
            "branch": repository.branch,
            "headSha": repository.head_sha,
            "dirty": repository.dirty
        },
        "candidateTargets": candidates.into_iter().map(repository_mapping_target_summary).collect::<Vec<_>>(),
        "existingTargets": existing.iter().map(repository_mapping_target_summary_ref).collect::<Vec<_>>(),
        "trackedPathHints": tracked_paths
    }))
}

async fn repository_mapping_tracked_paths(repository: &Path) -> Result<Vec<String>, String> {
    let mut paths = git_text(repository, &["ls-tree", "-r", "--name-only", "HEAD"])
        .await?
        .lines()
        .filter(|path| repository_mapping_path_hint(path))
        .take(500)
        .map(str::to_string)
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn repository_mapping_path_hint(path: &str) -> bool {
    path == "package.json"
        || path.ends_with("/package.json")
        || path.ends_with("vite.config.ts")
        || path.ends_with("vite.config.js")
        || path.ends_with("astro.config.mjs")
        || path.ends_with("next.config.js")
        || path.ends_with("tauri.conf.json")
        || path.ends_with("Cargo.toml")
        || path.starts_with(".flowguard/")
        || path.contains("/src/")
}

fn repository_mapping_target_summary(target: RepositoryTargetRow) -> Value {
    repository_mapping_target_summary_ref(&target)
}

fn repository_mapping_target_summary_ref(target: &RepositoryTargetRow) -> Value {
    json!({
        "name": target.name,
        "path": target.path,
        "kind": normalize_target_kind(&target.kind),
        "packageName": target.package_name,
        "scripts": target.scripts,
        "selected": target.selected
    })
}

async fn run_repository_mapping_turn(
    engine: Arc<dyn ImplementationEngine>,
    workspace: PathBuf,
) -> Result<(), String> {
    let thread_id = engine.start_thread(workspace.clone(), Vec::new()).await?;
    let turn_id = engine
        .start_turn(thread_id.clone(), workspace.clone(), repository_mapping_prompt())
        .await?;
    let started = Instant::now();
    loop {
        match engine
            .turn_status(thread_id.clone(), turn_id.clone())
            .await?
        {
            EngineTurnStatus::Completed => return Ok(()),
            EngineTurnStatus::Failed => {
                return Err("Code automatic mapping turn failed".to_string());
            }
            EngineTurnStatus::Interrupted => {
                return Err("Code automatic mapping turn was interrupted".to_string());
            }
            EngineTurnStatus::Running => {
                if started.elapsed() >= REPOSITORY_MAPPING_TIMEOUT {
                    let _ = engine
                        .interrupt(thread_id, Some(turn_id))
                        .await;
                    return Err("Code automatic mapping timed out".to_string());
                }
                sleep(Duration::from_millis(500)).await;
            }
        }
    }
}

fn repository_mapping_prompt() -> String {
    format!(
        r#"Map this repository for Code Desktop.

You are in a temporary workspace, not the user's repository. Read `{summary_file}` and write `{output_file}` in this same directory. Do not create or modify any other files.

The output must be strict JSON with this exact shape:
{{
  "version": 1,
  "mode": "code",
  "targets": [
    {{
      "name": "Human readable app or package name",
      "path": "repo-relative POSIX path, or . for the repository root",
      "kind": "app | package | other",
      "packageName": "optional package name",
      "scripts": {{ "scriptName": "script command" }},
      "selected": true
    }}
  ]
}}

Rules:
- Include only targets a user should be able to choose from the top-right app/project dropdown.
- Prefer app targets for runnable products, package targets for reusable libraries, and other only for meaningful non-package scopes.
- Use only safe repository-relative paths from the summary; never use absolute paths, parent traversal, or backslashes.
- Preserve useful scripts from candidate or existing targets.
- Keep at least one target selected.
- Return JSON only through the `{output_file}` file; no markdown wrapper."#,
        summary_file = REPOSITORY_MAPPING_SUMMARY_FILE,
        output_file = REPOSITORY_MAPPING_OUTPUT_FILE,
    )
}

fn preserve_existing_target_state(
    targets: &mut [RepositoryTargetRow],
    existing: &[RepositoryTargetRow],
) {
    for target in targets {
        if let Some(existing) = existing.iter().find(|item| item.path == target.path) {
            target.id = existing.id.clone();
            target.selected = existing.selected;
            target.created_at = existing.created_at;
        }
    }
}

#[allow(dead_code)]
fn default_selected() -> bool {
    true
}

async fn committed_package_paths(repository: &Path) -> Result<Vec<String>, String> {
    let mut paths = git_text(repository, &["ls-tree", "-r", "--name-only", "HEAD"])
        .await?
        .lines()
        .filter(|relative| *relative == "package.json" || relative.ends_with("/package.json"))
        .map(str::to_string)
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn package_has_workspaces(package: &Value) -> bool {
    match package.get("workspaces") {
        Some(Value::Array(values)) => values.iter().any(Value::is_string),
        Some(Value::Object(value)) => value
            .get("packages")
            .and_then(Value::as_array)
            .is_some_and(|values| values.iter().any(Value::is_string)),
        _ => false,
    }
}

fn package_scripts(package: &Value) -> BTreeMap<String, String> {
    package
        .get("scripts")
        .and_then(Value::as_object)
        .map(|scripts| {
            scripts
                .iter()
                .filter_map(|(name, value)| {
                    value
                        .as_str()
                        .map(|value| (name.clone(), value.to_string()))
                })
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default()
}

fn package_directory(package_path: &str) -> String {
    Path::new(package_path)
        .parent()
        .and_then(|path| {
            if path.as_os_str().is_empty() {
                None
            } else {
                Some(path.to_string_lossy().replace('\\', "/"))
            }
        })
        .unwrap_or_else(|| ".".to_string())
}

fn classify_target(
    target_path: &str,
    scripts: &BTreeMap<String, String>,
    tracked_paths: &HashSet<String>,
) -> String {
    let prefix = if target_path == "." {
        String::new()
    } else {
        format!("{target_path}/")
    };
    let has_app_config = [
        "vite.config.ts",
        "vite.config.js",
        "astro.config.mjs",
        "next.config.js",
        "src-tauri/tauri.conf.json",
        "src-tauri/Cargo.toml",
    ]
    .iter()
    .any(|path| tracked_paths.contains(&format!("{prefix}{path}")));

    if target_path.starts_with("apps/")
        || scripts.contains_key("dev")
        || scripts.contains_key("preview")
        || has_app_config
    {
        "app".to_string()
    } else {
        "package".to_string()
    }
}

fn target_name(repository_name: &str, path: &str, package_name: Option<&str>) -> String {
    package_name
        .and_then(|name| name.rsplit('/').next())
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .or_else(|| {
            (path != ".")
                .then(|| path.rsplit('/').next().unwrap_or(path).to_string())
        })
        .unwrap_or_else(|| repository_name.to_string())
}

fn target_kind_rank(kind: &str) -> u8 {
    match kind {
        "app" => 0,
        "package" => 1,
        "other" => 2,
        _ => 2,
    }
}

fn validate_target_kind(kind: &str) -> Result<(), String> {
    if matches!(kind, "app" | "package" | "other" | "manual") {
        Ok(())
    } else {
        Err(format!("Unsupported target kind: {kind}"))
    }
}

fn normalize_target_kind(kind: &str) -> String {
    if kind == "manual" {
        "other".to_string()
    } else {
        kind.to_string()
    }
}

fn validate_target_source(source: &str) -> Result<(), String> {
    if matches!(source, "detected" | "codex" | "manual") {
        Ok(())
    } else {
        Err(format!("Unsupported target source: {source}"))
    }
}

fn repository_mapping_detail(mode: RepositoryMappingMode) -> String {
    match mode {
        RepositoryMappingMode::Code => {
            "Code automatic mapping fallback used deterministic package metadata.".to_string()
        }
        RepositoryMappingMode::Claude => {
            "Claude local mapping is planned; deterministic package metadata was used.".to_string()
        }
        RepositoryMappingMode::CloudApi => {
            "Cloud API mapping is planned; deterministic package metadata was used.".to_string()
        }
    }
}

fn repository_mapping_fallback_detail(mode: RepositoryMappingMode, error: &str) -> String {
    match mode {
        RepositoryMappingMode::Code => format!(
            "Code automatic mapping could not complete ({error}); deterministic package metadata was used."
        ),
        RepositoryMappingMode::Claude | RepositoryMappingMode::CloudApi => {
            repository_mapping_detail(mode)
        }
    }
}

fn validate_target_path(path: &str) -> Result<String, String> {
    let path = path.trim().trim_matches('/').to_string();
    if path == "." {
        return Ok(path);
    }
    if path.is_empty() {
        return Err("Target path cannot be empty".to_string());
    }
    let parsed = Path::new(&path);
    if parsed.is_absolute()
        || parsed.components().any(|component| {
            matches!(
                component,
                Component::Prefix(_)
                    | Component::RootDir
                    | Component::CurDir
                    | Component::ParentDir
            )
        })
        || path.contains('\\')
        || path.split('/').any(str::is_empty)
    {
        return Err(
            "Target path must be repository-relative POSIX without dot segments".to_string(),
        );
    }
    Ok(path)
}

async fn target_flow_overview(
    data_dir: &Path,
    repository: &RepositoryRow,
    target: RepositoryTargetRow,
) -> Result<TargetFlowOverview, String> {
    migrate(data_dir)?;
    let target_view = repository_target_view(target.clone());
    let (flow_directory, proposal_directory, coverage_directory) =
        flowguard_directories(&repository.path).await;
    let flow_paths =
        committed_json_paths(&repository.path, &format!(".flowguard/{flow_directory}")).await?;
    let proposal_paths = committed_json_paths(
        &repository.path,
        &format!(".flowguard/{proposal_directory}"),
    )
    .await?;
    let coverage_paths = committed_json_paths(
        &repository.path,
        &format!(".flowguard/{coverage_directory}"),
    )
    .await?;
    let mut flows = Vec::new();
    let mut unscoped_flows = Vec::new();
    let mut invalid_documents = Vec::new();

    for relative_path in flow_paths {
        match committed_json(&repository.path, &relative_path).await {
            Ok(json) => match parse_target_flow(&relative_path, &json.text, json.value) {
                Ok(flow) => {
                    if flow.source_paths.is_empty() {
                        unscoped_flows.push(flow);
                    } else if flow
                        .source_paths
                        .iter()
                        .any(|source| source_matches_target(&target.path, source))
                    {
                        flows.push(flow);
                    }
                }
                Err(_) => invalid_documents.push(TargetFlowInvalidDocument {
                    kind: "flow".to_string(),
                    relative_path,
                    issue_count: 1,
                }),
            },
            Err(_) => invalid_documents.push(TargetFlowInvalidDocument {
                kind: "flow".to_string(),
                relative_path,
                issue_count: 1,
            }),
        }
    }

    flows.sort_by(|left, right| left.name.cmp(&right.name));
    unscoped_flows.sort_by(|left, right| left.name.cmp(&right.name));

    let included_flow_ids = flows
        .iter()
        .chain(unscoped_flows.iter())
        .map(|flow| flow.flow_id.clone())
        .collect::<HashSet<_>>();
    let mut proposals = Vec::new();

    for relative_path in proposal_paths {
        match committed_json(&repository.path, &relative_path).await {
            Ok(json) => match parse_target_flow_proposal(&relative_path, &json.text, json.value) {
                Ok(proposal) => {
                    if included_flow_ids.contains(&proposal.flow_id) {
                        proposals.push(proposal);
                    }
                }
                Err(_) => invalid_documents.push(TargetFlowInvalidDocument {
                    kind: "proposal".to_string(),
                    relative_path,
                    issue_count: 1,
                }),
            },
            Err(_) => invalid_documents.push(TargetFlowInvalidDocument {
                kind: "proposal".to_string(),
                relative_path,
                issue_count: 1,
            }),
        }
    }

    proposals.sort_by(|left, right| {
        left.flow_id
            .cmp(&right.flow_id)
            .then(left.relative_path.cmp(&right.relative_path))
    });

    let coverage_rows = load_target_flow_coverage_rows(data_dir, &repository.id, &target.id)?;
    let mut coverage_by_flow = HashMap::<String, Vec<ParsedFlowCoverageDocument>>::new();
    for relative_path in coverage_paths {
        match committed_json(&repository.path, &relative_path).await {
            Ok(json) => match parse_target_flow_coverage(&relative_path, &json.text, json.value) {
                Ok(document) => {
                    if included_flow_ids.contains(&document.scenario.flow_id) {
                        coverage_by_flow
                            .entry(document.scenario.flow_id.clone())
                            .or_default()
                            .push(document);
                    }
                }
                Err(_) => invalid_documents.push(TargetFlowInvalidDocument {
                    kind: "coverage".to_string(),
                    relative_path,
                    issue_count: 1,
                }),
            },
            Err(_) => invalid_documents.push(TargetFlowInvalidDocument {
                kind: "coverage".to_string(),
                relative_path,
                issue_count: 1,
            }),
        }
    }
    for documents in coverage_by_flow.values_mut() {
        documents.sort_by(|left, right| {
            left.scenario
                .title
                .cmp(&right.scenario.title)
                .then(left.scenario.scenario_id.cmp(&right.scenario.scenario_id))
        });
    }
    for flow in flows.iter_mut().chain(unscoped_flows.iter_mut()) {
        apply_flow_coverage(flow, coverage_by_flow.remove(&flow.flow_id), &coverage_rows);
    }
    invalid_documents.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then(left.relative_path.cmp(&right.relative_path))
    });

    let flow_names = flows
        .iter()
        .chain(unscoped_flows.iter())
        .map(|flow| {
            (
                flow.relative_path.clone(),
                (flow.flow_id.clone(), flow.name.clone()),
            )
        })
        .collect::<HashMap<_, _>>();
    let timeline = target_flow_timeline(
        &repository.path,
        &format!(".flowguard/{flow_directory}"),
        &flow_names,
    )
    .await?;

    Ok(TargetFlowOverview {
        snapshot: TargetFlowSnapshot {
            target: target_view,
            flows,
            unscoped_flows,
            proposals,
            invalid_documents,
            generated_at: now_ms(),
        },
        timeline,
    })
}

struct CommittedJson {
    text: String,
    value: Value,
}

async fn flowguard_directories(repository: &Path) -> (String, String, String) {
    let config = git_blob(repository, ".flowguard/config.json")
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    let flow_directory = config
        .as_ref()
        .and_then(|value| value.get("flowDirectory"))
        .and_then(Value::as_str)
        .and_then(flowguard_child_directory)
        .unwrap_or_else(|| "flows".to_string());
    let proposal_directory = config
        .as_ref()
        .and_then(|value| value.get("proposalDirectory"))
        .and_then(Value::as_str)
        .and_then(flowguard_child_directory)
        .unwrap_or_else(|| "proposals".to_string());
    let coverage_directory = config
        .as_ref()
        .and_then(|value| value.get("coverageDirectory"))
        .and_then(Value::as_str)
        .and_then(flowguard_child_directory)
        .unwrap_or_else(|| "coverage".to_string());
    (flow_directory, proposal_directory, coverage_directory)
}

fn flowguard_child_directory(value: &str) -> Option<String> {
    let value = value.trim().trim_matches('/');
    if value.is_empty()
        || value.starts_with('/')
        || value.contains('\\')
        || value
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        None
    } else {
        Some(value.to_string())
    }
}

async fn committed_json_paths(repository: &Path, directory: &str) -> Result<Vec<String>, String> {
    let paths = git_text(
        repository,
        &["ls-tree", "-r", "--name-only", "HEAD", "--", directory],
    )
    .await?
    .lines()
    .filter(|path| path.ends_with(".json"))
    .map(str::to_string)
    .collect::<Vec<_>>();
    Ok(paths)
}

async fn committed_json(repository: &Path, relative_path: &str) -> Result<CommittedJson, String> {
    let bytes = git_blob(repository, relative_path).await?;
    let text = String::from_utf8(bytes).map_err(|_| "Flowguard JSON is not UTF-8".to_string())?;
    let value = serde_json::from_str(&text).map_err(display_error)?;
    Ok(CommittedJson { text, value })
}

fn parse_target_flow(relative_path: &str, text: &str, value: Value) -> Result<TargetFlow, String> {
    let flow_id = required_json_string(&value, "id")?;
    let name = optional_json_string(&value, "name").unwrap_or_else(|| flow_id.clone());
    let goal = optional_json_string(&value, "goal").unwrap_or_default();
    let graph = target_flow_graph(&value)?;
    let source_paths = flow_source_paths(&value);

    Ok(TargetFlow {
        flow_id,
        name,
        goal,
        relative_path: relative_path.to_string(),
        digest: canonical_text_digest(text),
        graph,
        source_paths,
        coverage_scenarios: Vec::new(),
    })
}

fn parse_target_flow_proposal(
    relative_path: &str,
    text: &str,
    value: Value,
) -> Result<TargetFlowProposal, String> {
    let proposal_id = required_json_string(&value, "id")?;
    let flow_id = required_json_string(&value, "flowId")?;
    let summary = optional_json_string(&value, "summary").unwrap_or_else(|| proposal_id.clone());
    let confidence =
        optional_json_string(&value, "confidence").unwrap_or_else(|| "medium".to_string());
    let operation_count = value
        .get("operations")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or_default();

    Ok(TargetFlowProposal {
        proposal_id,
        flow_id,
        summary,
        confidence,
        relative_path: relative_path.to_string(),
        digest: canonical_text_digest(text),
        operation_count,
    })
}

fn parse_target_flow_coverage(
    relative_path: &str,
    text: &str,
    value: Value,
) -> Result<ParsedFlowCoverageDocument, String> {
    if value.get("version").and_then(Value::as_i64) != Some(1) {
        return Err("Flowguard coverage version must be 1".to_string());
    }
    let scenario_id = required_json_string(&value, "id")?;
    let flow_id = required_json_string(&value, "flowId")?;
    let title = required_json_string(&value, "title")?;
    let description = required_json_string(&value, "description")?;
    let gate = required_json_string(&value, "gate")?;
    if gate != "e2e" {
        return Err("Flowguard coverage supports only e2e gates".to_string());
    }
    let covers = value
        .get("covers")
        .and_then(Value::as_array)
        .ok_or_else(|| "Flowguard coverage is missing covers".to_string())?;
    let evidence = value
        .get("evidence")
        .and_then(Value::as_array)
        .ok_or_else(|| "Flowguard coverage is missing evidence".to_string())?;
    if covers.is_empty() || evidence.is_empty() {
        return Err("Flowguard coverage must include covers and evidence".to_string());
    }

    let mut targets = Vec::new();
    let mut scenario_covers = Vec::new();
    let mut seen_targets = HashSet::new();
    for cover in covers {
        let kind = required_json_string(cover, "kind")?;
        if !matches!(kind.as_str(), "state" | "transition") {
            return Err("Unsupported Flowguard coverage target kind".to_string());
        }
        let id = required_json_string(cover, "id")?;
        let behavior = required_json_string(cover, "behavior")?;
        let required = required_json_bool(cover, "required")?;
        if !seen_targets.insert(format!("{kind}:{id}")) {
            return Err("Duplicate Flowguard coverage target".to_string());
        }
        targets.push(ParsedFlowCoverageTarget {
            kind: kind.clone(),
            id: id.clone(),
            behavior: behavior.clone(),
            required,
        });
        scenario_covers.push(TargetFlowCoverageCover {
            kind,
            id,
            behavior,
            required,
            covered: false,
        });
    }

    let mut expected_evidence = Vec::new();
    for item in evidence {
        let kind = required_json_string(item, "kind")?;
        if !matches!(kind.as_str(), "screenshot" | "playwrightTrace" | "assertions") {
            return Err("Unsupported Flowguard coverage evidence kind".to_string());
        }
        expected_evidence.push(TargetFlowCoverageExpectedEvidence {
            kind,
            label: required_json_string(item, "label")?,
            required: required_json_bool(item, "required")?,
        });
    }

    Ok(ParsedFlowCoverageDocument {
        scenario: TargetFlowCoverageScenario {
            scenario_id,
            flow_id,
            title,
            description,
            gate,
            relative_path: relative_path.to_string(),
            digest: canonical_text_digest(text),
            covers: scenario_covers,
            expected_evidence,
            evidence: Vec::new(),
            latest_session: None,
        },
        targets,
    })
}

fn target_flow_graph(value: &Value) -> Result<TargetFlowGraph, String> {
    let states = value
        .get("states")
        .and_then(Value::as_array)
        .ok_or_else(|| "Flowguard flow is missing states".to_string())?;
    let transitions = value
        .get("transitions")
        .and_then(Value::as_array)
        .ok_or_else(|| "Flowguard flow is missing transitions".to_string())?;
    let mut state_ids = HashSet::new();
    let mut nodes = Vec::new();

    for state in states {
        let state_id = required_json_string(state, "id")?;
        state_ids.insert(state_id.clone());
        nodes.push(TargetFlowNode {
            id: format!("state:{state_id}"),
            state_id,
            label: optional_json_string(state, "name")
                .unwrap_or_else(|| "Unnamed state".to_string()),
            kind: optional_json_string(state, "kind").unwrap_or_else(|| "system".to_string()),
            route: optional_json_string(state, "route"),
            status: "unchanged".to_string(),
            coverage: empty_flow_coverage_summary(),
        });
    }

    let mut edges = Vec::new();
    let mut issues = Vec::new();
    for transition in transitions {
        let transition_id = required_json_string(transition, "id")?;
        let from = required_json_string(transition, "from")?;
        let to = required_json_string(transition, "to")?;
        if !state_ids.contains(&from) || !state_ids.contains(&to) {
            issues.push(TargetFlowIssue {
                severity: "error".to_string(),
                code: "MISSING_STATE".to_string(),
                message: format!("Transition {transition_id} references a missing state."),
            });
        }
        edges.push(TargetFlowEdge {
            id: format!("transition:{transition_id}"),
            transition_id,
            source: format!("state:{from}"),
            target: format!("state:{to}"),
            label: optional_json_string(transition, "action")
                .unwrap_or_else(|| "transition".to_string()),
            actor: optional_json_string(transition, "actor")
                .unwrap_or_else(|| "system".to_string()),
            status: "unchanged".to_string(),
            coverage: empty_flow_coverage_summary(),
        });
    }

    Ok(TargetFlowGraph {
        nodes,
        edges,
        issues,
    })
}

#[derive(Clone)]
struct StoredCoverageRow {
    session_id: String,
    request: String,
    session_status: String,
    flow_id: String,
    scenario_id: String,
    target_kind: String,
    target_id: String,
    status: String,
    evidence_artifacts: Vec<Artifact>,
    verified_at: i64,
}

fn load_target_flow_coverage_rows(
    data_dir: &Path,
    repository_id: &str,
    target_id: &str,
) -> Result<Vec<StoredCoverageRow>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT coverage.session_id,
                    sessions.request,
                    sessions.status,
                    coverage.flow_id,
                    coverage.scenario_id,
                    coverage.target_kind,
                    coverage.target_id,
                    coverage.status,
                    coverage.evidence_artifact_ids_json,
                    coverage.verified_at
             FROM session_flow_coverage coverage
             JOIN change_sessions sessions ON sessions.id = coverage.session_id
             WHERE sessions.repository_id = ?1
               AND sessions.target_id = ?2
               AND sessions.status IN ('verified', 'accepted')
             ORDER BY coverage.verified_at DESC, coverage.id DESC",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map(params![repository_id, target_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, i64>(9)?,
            ))
        })
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;

    rows.into_iter()
        .map(
            |(
                session_id,
                request,
                session_status,
                flow_id,
                scenario_id,
                target_kind,
                target_id,
                status,
                artifact_ids,
                verified_at,
            )| {
                let evidence_artifact_ids = serde_json::from_str::<Vec<String>>(&artifact_ids)
                    .map_err(display_error)?;
                let evidence_artifact_ids = evidence_artifact_ids.into_iter().collect::<HashSet<_>>();
                let evidence_artifacts = load_artifacts(data_dir, &session_id)?
                    .into_iter()
                    .filter(|artifact| evidence_artifact_ids.contains(&artifact.id))
                    .collect::<Vec<_>>();
                Ok(StoredCoverageRow {
                    session_id,
                    request,
                    session_status,
                    flow_id,
                    scenario_id,
                    target_kind,
                    target_id,
                    status,
                    evidence_artifacts,
                    verified_at,
                })
            },
        )
        .collect()
}

fn apply_flow_coverage(
    flow: &mut TargetFlow,
    documents: Option<Vec<ParsedFlowCoverageDocument>>,
    rows: &[StoredCoverageRow],
) {
    let documents = documents.unwrap_or_default();
    if documents.is_empty() {
        return;
    }
    let mut scenario_by_id = HashMap::<String, TargetFlowCoverageScenario>::new();
    let mut target_refs = HashMap::<String, Vec<TargetFlowCoverageScenarioReference>>::new();

    for document in documents {
        let mut scenario = document.scenario;
        let scenario_rows = rows
            .iter()
            .filter(|row| row.flow_id == scenario.flow_id && row.scenario_id == scenario.scenario_id)
            .collect::<Vec<_>>();
        let mut latest_session = scenario_rows.first().map(|row| TargetFlowCoverageSession {
            session_id: row.session_id.clone(),
            request: row.request.clone(),
            status: row.session_status.clone(),
            verified_at: row.verified_at,
        });
        let mut evidence = Vec::new();
        for row in &scenario_rows {
            for artifact in &row.evidence_artifacts {
                evidence.push(TargetFlowCoverageEvidence {
                    scenario_id: scenario.scenario_id.clone(),
                    session_id: row.session_id.clone(),
                    artifact_id: artifact.id.clone(),
                    kind: artifact.kind.clone(),
                    label: artifact.label.clone(),
                    path: artifact.path.clone(),
                    created_at: artifact.created_at,
                    verified_at: row.verified_at,
                });
            }
            if latest_session
                .as_ref()
                .is_some_and(|session| row.verified_at > session.verified_at)
            {
                latest_session = Some(TargetFlowCoverageSession {
                    session_id: row.session_id.clone(),
                    request: row.request.clone(),
                    status: row.session_status.clone(),
                    verified_at: row.verified_at,
                });
            }
        }
        evidence.sort_by(|left, right| {
            left.kind
                .cmp(&right.kind)
                .then(left.created_at.cmp(&right.created_at))
        });
        evidence.dedup_by(|left, right| left.artifact_id == right.artifact_id);
        scenario.evidence = evidence;
        scenario.latest_session = latest_session;
        for cover in &mut scenario.covers {
            cover.covered = scenario_rows.iter().any(|row| {
                row.target_kind == cover.kind
                    && row.target_id == cover.id
                    && row.status == "passed"
            });
        }
        for target in document.targets {
            let covered = scenario.covers.iter().any(|cover| {
                cover.kind == target.kind && cover.id == target.id && cover.covered
            });
            target_refs
                .entry(format!("{}:{}", target.kind, target.id))
                .or_default()
                .push(TargetFlowCoverageScenarioReference {
                    scenario_id: scenario.scenario_id.clone(),
                    title: scenario.title.clone(),
                    behavior: target.behavior,
                    required: target.required,
                    covered,
                });
        }
        scenario_by_id.insert(scenario.scenario_id.clone(), scenario);
    }

    for node in &mut flow.graph.nodes {
        node.coverage =
            coverage_summary_for_refs(target_refs.remove(&format!("state:{}", node.state_id)));
    }
    for edge in &mut flow.graph.edges {
        edge.coverage = coverage_summary_for_refs(
            target_refs.remove(&format!("transition:{}", edge.transition_id)),
        );
    }
    let mut scenarios = scenario_by_id.into_values().collect::<Vec<_>>();
    scenarios.sort_by(|left, right| {
        left.title
            .cmp(&right.title)
            .then(left.scenario_id.cmp(&right.scenario_id))
    });
    flow.coverage_scenarios = scenarios;
}

fn coverage_summary_for_refs(
    refs: Option<Vec<TargetFlowCoverageScenarioReference>>,
) -> TargetFlowCoverageSummary {
    let mut scenarios = refs.unwrap_or_default();
    scenarios.sort_by(|left, right| {
        left.title
            .cmp(&right.title)
            .then(left.scenario_id.cmp(&right.scenario_id))
    });
    let required = scenarios.iter().filter(|item| item.required).count();
    let covered = scenarios
        .iter()
        .filter(|item| item.required && item.covered)
        .count();
    let missing = required.saturating_sub(covered);
    let optional = scenarios.iter().filter(|item| !item.required).count();
    let status = if required == 0 {
        if scenarios.iter().any(|item| item.covered) {
            "covered"
        } else {
            "missing"
        }
    } else if covered == required {
        "covered"
    } else if covered > 0 {
        "partial"
    } else {
        "missing"
    };

    TargetFlowCoverageSummary {
        status: status.to_string(),
        required,
        covered,
        missing,
        optional,
        scenarios,
    }
}

fn empty_flow_coverage_summary() -> TargetFlowCoverageSummary {
    TargetFlowCoverageSummary {
        status: "missing".to_string(),
        required: 0,
        covered: 0,
        missing: 0,
        optional: 0,
        scenarios: Vec::new(),
    }
}

fn flow_source_paths(value: &Value) -> Vec<String> {
    let mut sources = HashSet::new();
    for key in ["states", "transitions"] {
        if let Some(items) = value.get(key).and_then(Value::as_array) {
            for item in items {
                if let Some(paths) = item.get("sources").and_then(Value::as_array) {
                    for path in paths.iter().filter_map(Value::as_str) {
                        let path = normalize_source_path(path);
                        if !path.is_empty() {
                            sources.insert(path);
                        }
                    }
                }
            }
        }
    }
    let mut paths = sources.into_iter().collect::<Vec<_>>();
    paths.sort();
    paths
}

fn source_matches_target(target_path: &str, source_path: &str) -> bool {
    if target_path == "." {
        true
    } else {
        source_path == target_path
            || source_path
                .strip_prefix(target_path)
                .is_some_and(|suffix| suffix.starts_with('/'))
    }
}

fn normalize_source_path(path: &str) -> String {
    path.trim()
        .trim_start_matches("./")
        .trim_start_matches('/')
        .replace('\\', "/")
}

fn required_json_string(value: &Value, key: &str) -> Result<String, String> {
    optional_json_string(value, key).ok_or_else(|| format!("Missing JSON string field: {key}"))
}

fn required_json_bool(value: &Value, key: &str) -> Result<bool, String> {
    value
        .get(key)
        .and_then(Value::as_bool)
        .ok_or_else(|| format!("Missing JSON boolean field: {key}"))
}

fn optional_json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn canonical_text_digest(text: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(text.as_bytes()))
}

async fn target_flow_timeline(
    repository: &Path,
    flow_directory: &str,
    flow_names: &HashMap<String, (String, String)>,
) -> Result<Vec<TargetFlowTimelineItem>, String> {
    let output = git_text(
        repository,
        &[
            "log",
            "-n",
            "80",
            "--date=unix",
            "--name-status",
            "--format=__CODE_COMMIT__%H%x1f%ct%x1f%s",
            "--",
            flow_directory,
        ],
    )
    .await?;
    let mut items = Vec::new();
    let mut current_sha = String::new();
    let mut current_timestamp = 0;
    let mut current_subject = String::new();

    for line in output.lines() {
        if let Some(metadata) = line.strip_prefix("__CODE_COMMIT__") {
            let mut parts = metadata.splitn(3, '\x1f');
            current_sha = parts.next().unwrap_or_default().to_string();
            current_timestamp = parts
                .next()
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or_default()
                * 1000;
            current_subject = parts.next().unwrap_or_default().to_string();
            continue;
        }
        if line.trim().is_empty() || current_sha.is_empty() {
            continue;
        }
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() < 2 {
            continue;
        }
        let status = columns[0];
        let relative_path = columns.last().copied().unwrap_or_default();
        if !relative_path.ends_with(".json") || !relative_path.starts_with(flow_directory) {
            continue;
        }
        let known_flow = flow_names.get(relative_path);
        if known_flow.is_none() && !status.starts_with('D') {
            continue;
        }
        let change_type = flow_change_type(status);
        let flow_name = known_flow.map(|(_, name)| name.clone());
        let flow_id = known_flow.map(|(id, _)| id.clone());
        items.push(TargetFlowTimelineItem {
            id: format!("{}:{relative_path}:{status}", current_sha),
            flow_id,
            flow_name: flow_name.clone(),
            relative_path: relative_path.to_string(),
            change_type: change_type.to_string(),
            commit_sha: current_sha.clone(),
            commit_subject: current_subject.clone(),
            committed_at: current_timestamp,
            summary: format_flow_change_summary(change_type, flow_name.as_deref(), relative_path),
        });
    }

    Ok(items)
}

fn flow_change_type(status: &str) -> &'static str {
    match status.chars().next() {
        Some('A') => "added",
        Some('D') => "deleted",
        Some('M') => "modified",
        Some('R') => "renamed",
        _ => "uncertain",
    }
}

fn format_flow_change_summary(
    change_type: &str,
    flow_name: Option<&str>,
    relative_path: &str,
) -> String {
    let subject = flow_name.unwrap_or(relative_path);
    match change_type {
        "added" => format!("Added {subject}"),
        "deleted" => format!("Deleted {subject}"),
        "renamed" => format!("Renamed {subject}"),
        "modified" => format!("Updated {subject}"),
        _ => format!("Changed {subject}"),
    }
}

#[cfg(test)]
fn default_manifest(scripts: &BTreeMap<String, String>) -> VerificationManifest {
    default_manifest_with_filter(scripts, None)
}

fn default_manifest_with_filter(
    scripts: &BTreeMap<String, String>,
    package_name: Option<&str>,
) -> VerificationManifest {
    let mut gates = BTreeMap::new();
    gates.insert(
        "install".to_string(),
        VerificationCommand {
            command: "bun".to_string(),
            args: vec!["install".to_string(), "--frozen-lockfile".to_string()],
            timeout_ms: 300_000,
            required: true,
            network: "enabled".to_string(),
            env: None,
        },
    );
    let candidates = [
        ("typecheck", "typecheck", 180_000),
        ("lint", "lint", 180_000),
        ("build", "build", 300_000),
        (
            "unit",
            if scripts.contains_key("test:unit") {
                "test:unit"
            } else {
                "test"
            },
            300_000,
        ),
        ("integration", "test:integration", 600_000),
        ("coverage", "test:coverage", 600_000),
        ("accessibility", "test:accessibility", 600_000),
        ("e2e", "test:e2e", 600_000),
        ("visual", "test:visual", 600_000),
    ];
    for (kind, script, timeout_ms) in candidates {
        if scripts.contains_key(script) {
            gates.insert(
                kind.to_string(),
                VerificationCommand {
                    command: "bun".to_string(),
                    args: filtered_bun_run_args(script, package_name),
                    timeout_ms,
                    required: true,
                    network: "disabled".to_string(),
                    env: None,
                },
            );
        }
    }
    VerificationManifest {
        version: 2,
        runtime: RuntimeConfig {
            package_manager: "bun".to_string(),
            bun_version: "1.3.5".to_string(),
        },
        gates,
        app_server: None,
    }
}

fn filtered_bun_run_args(script: &str, package_name: Option<&str>) -> Vec<String> {
    if let Some(package_name) = package_name {
        vec![
            "run".to_string(),
            "--filter".to_string(),
            package_name.to_string(),
            script.to_string(),
        ]
    } else {
        vec!["run".to_string(), script.to_string()]
    }
}

fn validate_manifest(manifest: &VerificationManifest) -> Result<(), String> {
    if manifest.version != 2 {
        return Err("manifest.version must be 2".to_string());
    }
    if manifest.runtime.package_manager != "bun"
        || manifest.runtime.bun_version != VERIFIER_BUN_VERSION
    {
        return Err(format!(
            "The MVP requires Bun {VERIFIER_BUN_VERSION} from the pinned verifier image"
        ));
    }
    if !manifest.gates.values().any(|gate| gate.required) {
        return Err("At least one verification gate must be required".to_string());
    }
    for (kind, gate) in &manifest.gates {
        if !GATE_ORDER.contains(&kind.as_str()) {
            return Err(format!("Unsupported verification gate: {kind}"));
        }
        if gate.command.trim().is_empty()
            || gate.command.contains('/')
            || gate.command.contains('\\')
            || gate.command.contains('\0')
        {
            return Err(format!("{kind} command must be a PATH executable name"));
        }
        if !(1_000..=1_800_000).contains(&gate.timeout_ms) {
            return Err(format!(
                "{kind} timeout must be between 1000 and 1800000 ms"
            ));
        }
        validate_environment(kind, gate.env.as_ref())?;
        validate_gate_network(kind, gate)?;
    }
    if let Some(server) = &manifest.app_server {
        let health = reqwest::Url::parse(&server.health_url).map_err(display_error)?;
        let browser = reqwest::Url::parse(&server.browser_base_url).map_err(display_error)?;
        if server.command.trim().is_empty()
            || server.command.contains('/')
            || server.command.contains('\\')
            || server.command.contains('\0')
        {
            return Err("App server command must be a PATH executable name".to_string());
        }
        if !(1_000..=1_800_000).contains(&server.timeout_ms)
            || !(1_000..=1_800_000).contains(&server.health_timeout_ms)
        {
            return Err("App server timeouts must be between 1000 and 1800000 ms".to_string());
        }
        validate_environment("app server", server.env.as_ref())?;
        if health.scheme() != "http"
            || browser.scheme() != "http"
            || !is_localhost(health.host_str())
            || !is_localhost(browser.host_str())
            || health.origin() != browser.origin()
        {
            return Err("App server URLs must share one http localhost origin".to_string());
        }
    }
    Ok(())
}

fn validate_environment(
    label: &str,
    environment: Option<&BTreeMap<String, String>>,
) -> Result<(), String> {
    for (key, value) in environment.into_iter().flatten() {
        let valid_name = !key.is_empty()
            && key.chars().enumerate().all(|(index, character)| {
                character == '_'
                    || character.is_ascii_uppercase()
                    || (index > 0 && character.is_ascii_digit())
            });
        if !valid_name || value.trim().is_empty() {
            return Err(format!("{label} has an invalid environment variable"));
        }
    }
    Ok(())
}

fn validate_gate_network(kind: &str, gate: &VerificationCommand) -> Result<(), String> {
    if gate.network != "enabled" && gate.network != "disabled" {
        return Err(format!("{kind} network must be enabled or disabled"));
    }
    if gate.network == "enabled"
        && !(kind == "install"
            && gate.command == "bun"
            && gate.args == ["install", "--frozen-lockfile"])
    {
        return Err("Only `bun install --frozen-lockfile` may enable network access".to_string());
    }
    Ok(())
}

fn is_localhost(host: Option<&str>) -> bool {
    matches!(host, Some("localhost" | "127.0.0.1" | "::1"))
}

fn fingerprint_paths(repository: &Path) -> Result<Vec<String>, String> {
    let mut paths = ["bun.lock", "package.json", "bunfig.toml"]
        .into_iter()
        .filter(|relative| repository.join(relative).is_file())
        .map(str::to_string)
        .collect::<Vec<_>>();
    for entry in WalkDir::new(repository)
        .into_iter()
        .filter_entry(include_repository_entry)
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() || entry.file_name() != "package.json" {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(repository)
            .map_err(display_error)?
            .to_string_lossy()
            .into_owned();
        if relative != "package.json" {
            paths.push(relative);
        }
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}

async fn committed_fingerprint_paths(repository: &Path) -> Result<Vec<String>, String> {
    let mut paths = git_text(repository, &["ls-tree", "-r", "--name-only", "HEAD"])
        .await?
        .lines()
        .filter(|relative| {
            matches!(*relative, "bun.lock" | "bunfig.toml" | "package.json")
                || relative.ends_with("/package.json")
        })
        .map(str::to_string)
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

async fn fingerprint_files(repository: &Path, paths: &[String]) -> Result<String, String> {
    let mut hasher = Sha256::new();
    for relative in paths {
        hasher.update(relative.as_bytes());
        let path = repository.join(relative);
        if path.is_file() {
            hasher.update(fs::read(path).await.map_err(display_error)?);
        } else {
            hasher.update(b"<missing>");
        }
    }
    Ok(format!("{:x}", hasher.finalize()))
}

async fn fingerprint_committed_files(
    repository: &Path,
    paths: &[String],
) -> Result<String, String> {
    let mut hasher = Sha256::new();
    for relative in paths {
        hasher.update(relative.as_bytes());
        hasher.update(git_blob(repository, relative).await?);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

async fn ensure_policy_valid(repository: &Path, policy: &PolicyRow) -> Result<(), String> {
    validate_manifest(&policy.manifest)?;
    let paths = committed_fingerprint_paths(repository).await?;
    let current = fingerprint_committed_files(repository, &paths).await?;
    if paths != policy.fingerprint_paths || current != policy.fingerprint {
        return Err(
            "Repository configuration changed after policy approval; review and approve it again"
                .to_string(),
        );
    }
    Ok(())
}

async fn repository_view(data_dir: &Path, row: RepositoryRow) -> Result<Repository, String> {
    let policy = load_policy_row(data_dir, &row.id)?;
    let policy = match policy {
        Some(policy) => Some(policy_view(&row.path, policy).await?),
        None => None,
    };
    Ok(Repository {
        id: row.id,
        path: row.path.to_string_lossy().into_owned(),
        name: row.name,
        head_sha: row.head_sha,
        branch: row.branch,
        dirty: row.dirty,
        compatible: row.compatible,
        compatibility_detail: row.compatibility_detail,
        created_at: row.created_at,
        updated_at: row.updated_at,
        policy,
    })
}

async fn policy_view(repository: &Path, row: PolicyRow) -> Result<RepositoryPolicy, String> {
    let valid = match committed_fingerprint_paths(repository).await {
        Ok(paths) if paths == row.fingerprint_paths => {
            fingerprint_committed_files(repository, &paths)
                .await
                .is_ok_and(|fingerprint| fingerprint == row.fingerprint)
        }
        _ => false,
    };
    Ok(RepositoryPolicy {
        repository_id: row.repository_id,
        manifest: row.manifest,
        fingerprint: row.fingerprint,
        fingerprint_paths: row.fingerprint_paths,
        approved_at: row.approved_at,
        valid,
    })
}

fn repository_target_view(row: RepositoryTargetRow) -> RepositoryTarget {
    RepositoryTarget {
        id: row.id,
        repository_id: row.repository_id,
        name: row.name,
        path: row.path,
        kind: normalize_target_kind(&row.kind),
        package_name: row.package_name,
        scripts: row.scripts,
        source: row.source,
        selected: row.selected,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn load_target_rows(
    data_dir: &Path,
    repository_id: &str,
) -> Result<Vec<RepositoryTargetRow>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT id, repository_id, name, path, kind, package_name, scripts_json,
                    source, selected, created_at, updated_at
             FROM repository_targets
             WHERE repository_id = ?1
             ORDER BY selected DESC, kind, name",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map([repository_id], target_from_row)
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    Ok(rows)
}

fn load_target_row(data_dir: &Path, id: &str) -> Result<Option<RepositoryTargetRow>, String> {
    super::database(data_dir)?
        .query_row(
            "SELECT id, repository_id, name, path, kind, package_name, scripts_json,
                    source, selected, created_at, updated_at
             FROM repository_targets WHERE id = ?1",
            [id],
            target_from_row,
        )
        .optional()
        .map_err(display_error)
}

fn target_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RepositoryTargetRow> {
    let scripts_json = row.get::<_, String>(6)?;
    let scripts = serde_json::from_str(&scripts_json).unwrap_or_default();
    Ok(RepositoryTargetRow {
        id: row.get(0)?,
        repository_id: row.get(1)?,
        name: row.get(2)?,
        path: row.get(3)?,
        kind: row.get(4)?,
        package_name: row.get(5)?,
        scripts,
        source: row.get(7)?,
        selected: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn replace_targets(
    data_dir: &Path,
    repository_id: &str,
    rows: &[RepositoryTargetRow],
) -> Result<(), String> {
    let mut connection = super::database(data_dir)?;
    let transaction = connection.transaction().map_err(display_error)?;
    transaction
        .execute("DELETE FROM repository_targets WHERE repository_id = ?1", [repository_id])
        .map_err(display_error)?;
    for row in rows {
        transaction
            .execute(
                "INSERT INTO repository_targets
                 (id, repository_id, name, path, kind, package_name, scripts_json, source,
                  selected, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    &row.id,
                    &row.repository_id,
                    &row.name,
                    &row.path,
                    &row.kind,
                    &row.package_name,
                    serde_json::to_string(&row.scripts).map_err(display_error)?,
                    &row.source,
                    row.selected,
                    row.created_at,
                    row.updated_at,
                ],
            )
            .map_err(display_error)?;
    }
    transaction.commit().map_err(display_error)
}

fn load_repository_rows(data_dir: &Path) -> Result<Vec<RepositoryRow>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT id, path, name, head_sha, branch, dirty, compatible,
                    compatibility_detail, created_at, updated_at
             FROM repositories ORDER BY updated_at DESC",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map([], repository_from_row)
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    Ok(rows)
}

fn load_repository_row(data_dir: &Path, id: &str) -> Result<Option<RepositoryRow>, String> {
    super::database(data_dir)?
        .query_row(
            "SELECT id, path, name, head_sha, branch, dirty, compatible,
                    compatibility_detail, created_at, updated_at
             FROM repositories WHERE id = ?1",
            [id],
            repository_from_row,
        )
        .optional()
        .map_err(display_error)
}

fn repository_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RepositoryRow> {
    Ok(RepositoryRow {
        id: row.get(0)?,
        path: PathBuf::from(row.get::<_, String>(1)?),
        name: row.get(2)?,
        head_sha: row.get(3)?,
        branch: row.get(4)?,
        dirty: row.get(5)?,
        compatible: row.get(6)?,
        compatibility_detail: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn load_policy_row(data_dir: &Path, repository_id: &str) -> Result<Option<PolicyRow>, String> {
    let row = super::database(data_dir)?
        .query_row(
            "SELECT repository_id, manifest_json, fingerprint, fingerprint_paths_json, approved_at
             FROM repository_policies WHERE repository_id = ?1",
            [repository_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            },
        )
        .optional()
        .map_err(display_error)?;
    row.map(
        |(repository_id, manifest_json, fingerprint, fingerprint_paths_json, approved_at)| {
            Ok(PolicyRow {
                repository_id,
                manifest: serde_json::from_str(&manifest_json).map_err(display_error)?,
                fingerprint,
                fingerprint_paths: serde_json::from_str(&fingerprint_paths_json)
                    .map_err(display_error)?,
                approved_at,
            })
        },
    )
    .transpose()
}

fn load_session_row(data_dir: &Path, id: &str) -> Result<Option<SessionRow>, String> {
    super::database(data_dir)?
        .query_row(
            "SELECT id, repository_id, target_id, request, base_sha, worktree_path, branch_name,
                    codex_thread_id, status, attempt, verification_digest, terminal_reason,
                    created_at, updated_at
             FROM change_sessions WHERE id = ?1",
            [id],
            |row| {
                Ok(SessionRow {
                    id: row.get(0)?,
                    repository_id: row.get(1)?,
                    target_id: row.get(2)?,
                    request: row.get(3)?,
                    base_sha: row.get(4)?,
                    worktree_path: PathBuf::from(row.get::<_, String>(5)?),
                    branch_name: row.get(6)?,
                    codex_thread_id: row.get(7)?,
                    status: row.get(8)?,
                    attempt: row.get(9)?,
                    verification_digest: row.get(10)?,
                    terminal_reason: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        )
        .optional()
        .map_err(display_error)
}

fn session_view(
    repository_name: &str,
    row: SessionRow,
    target: Option<&RepositoryTargetRow>,
) -> ChangeSession {
    ChangeSession {
        id: row.id,
        repository_id: row.repository_id,
        repository_name: repository_name.to_string(),
        target_id: row.target_id,
        target_name: target.map(|target| target.name.clone()),
        target_path: target.map(|target| target.path.clone()),
        request: row.request,
        base_sha: row.base_sha,
        worktree_path: row.worktree_path.to_string_lossy().into_owned(),
        branch_name: row.branch_name,
        codex_thread_id: row.codex_thread_id,
        status: row.status,
        attempt: row.attempt,
        verification_digest: row.verification_digest,
        terminal_reason: row.terminal_reason,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn load_events(data_dir: &Path, session_id: &str) -> Result<Vec<SessionEvent>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT id, kind, message, created_at FROM session_events
             WHERE session_id = ?1 ORDER BY id",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map([session_id], |row| {
            Ok(SessionEvent {
                id: row.get(0)?,
                session_id: session_id.to_string(),
                kind: row.get(1)?,
                message: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    Ok(rows)
}

fn load_gate_results(data_dir: &Path, session_id: &str) -> Result<Vec<GateResult>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT id, kind, required, status, attempt, duration_ms, exit_code,
                    worktree_digest, artifact_ids_json
             FROM session_gate_results WHERE session_id = ?1 ORDER BY id",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map([session_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, bool>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, u32>(4)?,
                row.get::<_, u64>(5)?,
                row.get::<_, Option<i32>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    rows.into_iter()
        .map(
            |(
                id,
                kind,
                required,
                status,
                attempt,
                duration_ms,
                exit_code,
                worktree_digest,
                artifacts,
            )| {
                Ok(GateResult {
                    id,
                    session_id: session_id.to_string(),
                    kind,
                    required,
                    status,
                    attempt,
                    duration_ms,
                    exit_code,
                    worktree_digest,
                    artifact_ids: serde_json::from_str(&artifacts).map_err(display_error)?,
                })
            },
        )
        .collect()
}

fn load_approvals(data_dir: &Path, session_id: &str) -> Result<Vec<SessionApproval>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT request_id_json, method, detail, status, created_at
             FROM session_approvals WHERE session_id = ?1 ORDER BY created_at",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map([session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    rows.into_iter()
        .map(|(request_id, method, detail, status, created_at)| {
            Ok(SessionApproval {
                request_id: serde_json::from_str(&request_id).map_err(display_error)?,
                method,
                detail,
                status,
                created_at,
            })
        })
        .collect()
}

fn load_artifacts(data_dir: &Path, session_id: &str) -> Result<Vec<Artifact>, String> {
    let connection = super::database(data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT id, kind, path, label, created_at FROM session_artifacts
             WHERE session_id = ?1 ORDER BY created_at",
        )
        .map_err(display_error)?;
    let rows = statement
        .query_map([session_id], |row| {
            Ok(Artifact {
                id: row.get(0)?,
                session_id: session_id.to_string(),
                kind: row.get(1)?,
                path: row.get(2)?,
                label: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(display_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(display_error)?;
    Ok(rows)
}

fn load_snapshot(
    data_dir: &Path,
    session_id: &str,
) -> Result<Option<VerificationSnapshot>, String> {
    super::database(data_dir)?
        .query_row(
            "SELECT worktree_digest, required, passed, failed, missing, has_diff, verified_at
             FROM verification_snapshots WHERE session_id = ?1",
            [session_id],
            |row| {
                Ok(VerificationSnapshot {
                    session_id: session_id.to_string(),
                    worktree_digest: row.get(0)?,
                    required: row.get(1)?,
                    passed: row.get(2)?,
                    failed: row.get(3)?,
                    missing: row.get(4)?,
                    has_diff: row.get(5)?,
                    verified_at: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(display_error)
}

fn update_session(
    data_dir: &Path,
    session_id: &str,
    status: &str,
    branch_name: Option<&str>,
    terminal_reason: Option<&str>,
    verification_digest: Option<&str>,
) -> Result<(), String> {
    super::database(data_dir)?
        .execute(
            "UPDATE change_sessions SET
               status = ?2,
               branch_name = COALESCE(?3, branch_name),
               terminal_reason = ?4,
               verification_digest = ?5,
               updated_at = ?6
             WHERE id = ?1",
            params![
                session_id,
                status,
                branch_name,
                terminal_reason,
                verification_digest,
                now_ms()
            ],
        )
        .map_err(display_error)?;
    Ok(())
}

fn transition(
    runtime: &SessionRuntime,
    session_id: &str,
    status: &str,
    attempt: u32,
) -> Result<(), String> {
    let mut connection = super::database(&runtime.data_dir)?;
    let transaction = connection.transaction().map_err(display_error)?;
    transaction
        .execute(
            "UPDATE change_sessions SET status = ?2, attempt = ?3,
             terminal_reason = NULL, verification_digest = NULL, updated_at = ?4
             WHERE id = ?1",
            params![session_id, status, attempt, now_ms()],
        )
        .map_err(display_error)?;
    transaction
        .execute(
            "DELETE FROM verification_snapshots WHERE session_id = ?1",
            [session_id],
        )
        .map_err(display_error)?;
    transaction.commit().map_err(display_error)?;
    append_event(
        &runtime.data_dir,
        session_id,
        "lifecycle",
        &format!("Session entered {status}"),
    )?;
    runtime.emit(session_id)
}

fn append_event(
    data_dir: &Path,
    session_id: &str,
    kind: &str,
    message: &str,
) -> Result<(), String> {
    super::database(data_dir)?
        .execute(
            "INSERT INTO session_events(session_id, kind, message, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![session_id, kind, trim_output(message), now_ms()],
        )
        .map_err(display_error)?;
    Ok(())
}

fn commit_verification_attempt(
    data_dir: &Path,
    session_id: &str,
    attempt: u32,
    digest: &str,
    results: &[PendingGateResult],
    expected_required: &HashSet<String>,
    has_diff: bool,
    verified: bool,
) -> Result<(), String> {
    let mut kinds = HashSet::new();
    for result in results {
        if result.attempt != attempt || result.worktree_digest != digest {
            return Err("Verification result has a stale attempt or digest".to_string());
        }
        if !matches!(result.status.as_str(), "passed" | "failed" | "skipped") {
            return Err(format!(
                "Verification result `{}` has an invalid status",
                result.kind
            ));
        }
        if !kinds.insert(result.kind.clone()) {
            return Err(format!(
                "Verification result `{}` is duplicated",
                result.kind
            ));
        }
    }
    let required_results = results
        .iter()
        .filter(|result| result.required)
        .map(|result| result.kind.clone())
        .collect::<HashSet<_>>();
    if required_results != *expected_required {
        return Err(
            "Verification results are missing or contain unexpected required checks".to_string(),
        );
    }
    let required = expected_required.len();
    let passed = results
        .iter()
        .filter(|result| result.required && result.status == "passed")
        .count();
    let failed = results
        .iter()
        .filter(|result| result.required && result.status == "failed")
        .count();
    let missing = required.saturating_sub(passed + failed);
    if verified && (!has_diff || passed != required || failed != 0 || missing != 0) {
        return Err(
            "A verification snapshot requires one passing result for every required check"
                .to_string(),
        );
    }

    let mut connection = super::database(data_dir)?;
    let transaction = connection.transaction().map_err(display_error)?;
    transaction
        .execute(
            "DELETE FROM session_gate_results WHERE session_id = ?1 AND attempt = ?2",
            params![session_id, attempt],
        )
        .map_err(display_error)?;
    for result in results {
        transaction
            .execute(
                "INSERT INTO session_gate_results
             (session_id, kind, required, status, attempt, duration_ms, exit_code,
              worktree_digest, artifact_ids_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    session_id,
                    result.kind,
                    result.required,
                    result.status,
                    result.attempt,
                    result.duration_ms,
                    result.exit_code,
                    result.worktree_digest,
                    serde_json::to_string(&result.artifact_ids).map_err(display_error)?
                ],
            )
            .map_err(display_error)?;
    }
    if verified {
        transaction
            .execute(
                "INSERT INTO verification_snapshots
                 (session_id, worktree_digest, required, passed, failed, missing, has_diff,
                  verified_at)
                 VALUES (?1, ?2, ?3, ?4, 0, 0, 1, ?5)
                 ON CONFLICT(session_id) DO UPDATE SET
                   worktree_digest = excluded.worktree_digest,
                   required = excluded.required,
                   passed = excluded.passed,
                   failed = excluded.failed,
                   missing = excluded.missing,
                   has_diff = excluded.has_diff,
                   verified_at = excluded.verified_at",
                params![session_id, digest, required, passed, now_ms()],
            )
            .map_err(display_error)?;
        transaction
            .execute(
                "UPDATE change_sessions SET status = 'verified', terminal_reason = NULL,
                 verification_digest = ?2, updated_at = ?3 WHERE id = ?1",
                params![session_id, digest, now_ms()],
            )
            .map_err(display_error)?;
    } else {
        transaction
            .execute(
                "DELETE FROM verification_snapshots WHERE session_id = ?1",
                [session_id],
            )
            .map_err(display_error)?;
    }
    transaction.commit().map_err(display_error)
}

fn insert_artifact(
    data_dir: &Path,
    session_id: &str,
    kind: &str,
    path: &Path,
    label: &str,
) -> Result<String, String> {
    validate_artifact_kind(kind)?;
    ensure_artifact_path_confined(data_dir, session_id, path)?;
    let id = Uuid::new_v4().to_string();
    super::database(data_dir)?
        .execute(
            "INSERT INTO session_artifacts(id, session_id, kind, path, label, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                session_id,
                kind,
                path.to_string_lossy(),
                label,
                now_ms()
            ],
        )
        .map_err(display_error)?;
    Ok(id)
}

async fn ingest_flow_coverage_report(
    data_dir: &Path,
    session_id: &str,
    attempt: u32,
    worktree_digest: &str,
    artifact_root: &Path,
) -> Result<Vec<String>, String> {
    let report_path = artifact_root.join(FLOW_COVERAGE_REPORT_FILE);
    if !fs::try_exists(&report_path).await.map_err(display_error)? {
        clear_flow_coverage_attempt(data_dir, session_id, attempt)?;
        return Ok(Vec::new());
    }
    ensure_artifact_path_confined(data_dir, session_id, &report_path)?;
    let text = fs::read_to_string(&report_path).await.map_err(display_error)?;
    let report: FlowCoverageRuntimeReport = serde_json::from_str(&text).map_err(display_error)?;
    if report.version != 1 {
        return Err("coverage report version must be 1".to_string());
    }

    {
        let mut connection = super::database(data_dir)?;
        let transaction = connection.transaction().map_err(display_error)?;
        transaction
            .execute(
                "DELETE FROM session_flow_coverage WHERE session_id = ?1 AND attempt = ?2",
                params![session_id, attempt],
            )
            .map_err(display_error)?;
        transaction.commit().map_err(display_error)?;
    }

    let mut inserted_artifact_ids = Vec::new();
    for scenario in report.scenarios {
        if scenario.flow_id.trim().is_empty() || scenario.scenario_id.trim().is_empty() {
            return Err("coverage scenario flowId and scenarioId are required".to_string());
        }
        let scenario_passed = scenario.status.as_deref().unwrap_or("passed") == "passed";
        let mut evidence_artifact_ids = Vec::new();
        for evidence in scenario.evidence {
            if !matches!(
                evidence.kind.as_str(),
                "screenshot" | "playwrightTrace" | "assertions"
            ) {
                return Err(format!("unsupported coverage evidence kind `{}`", evidence.kind));
            }
            let relative_path = safe_artifact_relative_path(&evidence.path)?;
            let path = artifact_root.join(relative_path);
            ensure_artifact_path_confined(data_dir, session_id, &path)?;
            if !fs::try_exists(&path).await.map_err(display_error)? {
                return Err(format!("coverage evidence file does not exist: {}", evidence.path));
            }
            let artifact_id =
                insert_artifact(data_dir, session_id, &evidence.kind, &path, &evidence.label)?;
            evidence_artifact_ids.push(artifact_id.clone());
            inserted_artifact_ids.push(artifact_id);
        }
        let evidence_json = serde_json::to_string(&evidence_artifact_ids).map_err(display_error)?;
        for cover in scenario.covers {
            if !matches!(cover.kind.as_str(), "state" | "transition") {
                return Err(format!("unsupported coverage target kind `{}`", cover.kind));
            }
            if cover.id.trim().is_empty() {
                return Err("coverage target id is required".to_string());
            }
            let cover_passed =
                scenario_passed && cover.status.as_deref().unwrap_or("passed") == "passed";
            super::database(data_dir)?
                .execute(
                    "INSERT INTO session_flow_coverage
                     (id, session_id, attempt, flow_id, scenario_id, target_kind, target_id,
                      status, evidence_artifact_ids_json, worktree_digest, verified_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        Uuid::new_v4().to_string(),
                        session_id,
                        attempt,
                        &scenario.flow_id,
                        &scenario.scenario_id,
                        cover.kind,
                        cover.id,
                        if cover_passed { "passed" } else { "failed" },
                        &evidence_json,
                        worktree_digest,
                        now_ms()
                    ],
                )
                .map_err(display_error)?;
        }
    }

    Ok(inserted_artifact_ids)
}

fn clear_flow_coverage_attempt(
    data_dir: &Path,
    session_id: &str,
    attempt: u32,
) -> Result<(), String> {
    super::database(data_dir)?
        .execute(
            "DELETE FROM session_flow_coverage WHERE session_id = ?1 AND attempt = ?2",
            params![session_id, attempt],
        )
        .map_err(display_error)?;
    Ok(())
}

fn clear_flow_coverage_session(data_dir: &Path, session_id: &str) -> Result<(), String> {
    super::database(data_dir)?
        .execute(
            "DELETE FROM session_flow_coverage WHERE session_id = ?1",
            [session_id],
        )
        .map_err(display_error)?;
    Ok(())
}

fn safe_artifact_relative_path(value: &str) -> Result<PathBuf, String> {
    let value = value.trim();
    let bytes = value.as_bytes();
    let windows_drive = bytes.len() > 1 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic();
    if value.is_empty()
        || value.starts_with('/')
        || value.starts_with('\\')
        || value.contains('\\')
        || value.contains('\0')
        || windows_drive
    {
        return Err("coverage evidence path must be relative to /artifacts".to_string());
    }
    let path = PathBuf::from(value);
    if path.components().any(|component| {
        matches!(
            component,
            Component::RootDir | Component::ParentDir | Component::CurDir | Component::Prefix(_)
        )
    }) {
        return Err("coverage evidence path must not contain dot or parent segments".to_string());
    }
    Ok(path)
}

fn validate_artifact_kind(kind: &str) -> Result<(), String> {
    if matches!(
        kind,
        "patch" | "commandLog" | "screenshot" | "playwrightTrace" | "assertions" | "report"
    ) {
        Ok(())
    } else {
        Err(format!("Unsupported artifact kind: {kind}"))
    }
}

fn ensure_artifact_path_confined(
    data_dir: &Path,
    session_id: &str,
    path: &Path,
) -> Result<(), String> {
    let root = normalize_path(&artifact_directory(data_dir, session_id));
    let confined_path = normalize_path(path);
    if !confined_path.starts_with(&root) {
        return Err("Artifact path is outside app-managed session storage".to_string());
    }
    Ok(())
}

fn session_id_for_thread(data_dir: &Path, thread_id: &str) -> Result<Option<String>, String> {
    super::database(data_dir)?
        .query_row(
            "SELECT id FROM change_sessions WHERE codex_thread_id = ?1",
            [thread_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(display_error)
}

fn repository_path(data_dir: &Path, repository_id: &str) -> Result<PathBuf, String> {
    load_repository_row(data_dir, repository_id)?
        .map(|row| row.path)
        .ok_or_else(|| "Repository not found".to_string())
}

fn artifact_directory(data_dir: &Path, session_id: &str) -> PathBuf {
    data_dir.join("sessions").join(session_id).join("artifacts")
}

async fn git_text(repository: &Path, args: &[&str]) -> Result<String, String> {
    command_text("git", args, Some(repository), Duration::from_secs(30))
        .await
        .map(|value| value.trim().to_string())
}

async fn git_blob(repository: &Path, relative: &str) -> Result<Vec<u8>, String> {
    let object = format!("HEAD:{relative}");
    let output = timeout(
        Duration::from_secs(30),
        Command::new("git")
            .args(["show", &object])
            .current_dir(repository)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "git show timed out".to_string())?
    .map_err(display_error)?;
    if !output.status.success() {
        return Err(format!(
            "git show failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(output.stdout)
}

async fn command_text(
    program: &str,
    args: &[&str],
    cwd: Option<&Path>,
    command_timeout: Duration,
) -> Result<String, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if program == "git" {
        command.env("GIT_CONFIG_GLOBAL", "/dev/null");
        command.env("GIT_CONFIG_SYSTEM", "/dev/null");
        command.env("GIT_AUTHOR_NAME", "Code");
        command.env("GIT_AUTHOR_EMAIL", "code@localhost");
        command.env("GIT_COMMITTER_NAME", "Code");
        command.env("GIT_COMMITTER_EMAIL", "code@localhost");
    }
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let output = timeout(command_timeout, command.output())
        .await
        .map_err(|_| format!("{program} timed out"))?
        .map_err(display_error)?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Err(format!("{program} failed: {}", trim_output(&text)));
    }
    Ok(text)
}

fn restricted_docker_args(worktree: &Path, network: &str, artifacts: Option<&Path>) -> Vec<String> {
    let mut args = vec![
        "run".to_string(),
        "--rm".to_string(),
        "--init".to_string(),
        "--network".to_string(),
        if network == "enabled" {
            "bridge".to_string()
        } else {
            "none".to_string()
        },
        "--cpus".to_string(),
        "4".to_string(),
        "--memory".to_string(),
        "8g".to_string(),
        "--pids-limit".to_string(),
        "512".to_string(),
        "--security-opt".to_string(),
        "no-new-privileges".to_string(),
        "-e".to_string(),
        "HOME=/tmp".to_string(),
        "-v".to_string(),
        format!("{}:/workspace", worktree.display()),
        "-w".to_string(),
        "/workspace".to_string(),
    ];
    if let Some(artifacts) = artifacts {
        args.extend([
            "-v".to_string(),
            format!("{}:/artifacts", artifacts.display()),
        ]);
    }
    args
}

fn add_docker_labels(args: &mut Vec<String>, session_id: &str, purpose: &str) {
    args.extend([
        "--label".to_string(),
        format!("code.session={session_id}"),
        "--label".to_string(),
        format!("code.purpose={purpose}"),
    ]);
}

fn docker_container_name(session_id: &str, purpose: &str) -> String {
    let session = session_id
        .chars()
        .filter(|value| value.is_ascii_alphanumeric())
        .take(20)
        .collect::<String>();
    let purpose = purpose
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value
            } else {
                '-'
            }
        })
        .take(24)
        .collect::<String>();
    format!("code-{session}-{purpose}")
}

pub(crate) async fn worktree_digest(worktree: &Path) -> Result<String, String> {
    let statuses = changed_paths(worktree).await?;
    let mut hasher = Sha256::new();
    for (_, relative) in statuses {
        hasher.update(relative.as_bytes());
        let path = worktree.join(&relative);
        match fs::symlink_metadata(&path).await {
            Ok(metadata) => {
                hash_metadata(&mut hasher, &metadata);
                if metadata.file_type().is_symlink() {
                    hasher.update(
                        fs::read_link(&path)
                            .await
                            .map_err(display_error)?
                            .to_string_lossy()
                            .as_bytes(),
                    );
                } else if metadata.is_file() {
                    hasher.update(fs::read(&path).await.map_err(display_error)?);
                }
            }
            Err(_) => hasher.update(b"<deleted>"),
        }
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn hash_metadata(hasher: &mut Sha256, metadata: &Metadata) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        hasher.update(metadata.mode().to_le_bytes());
    }
    #[cfg(not(unix))]
    hasher.update(metadata.len().to_le_bytes());
}

async fn changed_paths(worktree: &Path) -> Result<Vec<(String, String)>, String> {
    let output = command_text(
        "git",
        &["status", "--porcelain=v1", "--untracked-files=all"],
        Some(worktree),
        Duration::from_secs(30),
    )
    .await?;
    let mut entries = Vec::new();
    for line in output.lines() {
        if line.len() < 4 {
            continue;
        }
        let status = line[..2].to_string();
        let raw = line[3..].split(" -> ").last().unwrap_or(&line[3..]);
        entries.push((status, raw.trim_matches('"').to_string()));
    }
    entries.sort_by(|left, right| left.1.cmp(&right.1));
    Ok(entries)
}

async fn session_diff(worktree: &Path) -> Result<String, String> {
    let _ = command_text(
        "git",
        &["add", "--intent-to-add", "."],
        Some(worktree),
        Duration::from_secs(30),
    )
    .await;
    command_text(
        "git",
        &["diff", "--binary", "--no-ext-diff", "HEAD"],
        Some(worktree),
        Duration::from_secs(60),
    )
    .await
}

fn escaping_symlinks(
    worktree: &Path,
    statuses: &[(String, String)],
) -> Result<Vec<String>, String> {
    let root = worktree.canonicalize().map_err(display_error)?;
    let mut failures = Vec::new();
    for (_, relative) in statuses {
        let path = root.join(relative);
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.file_type().is_symlink() {
            continue;
        }
        let target = std::fs::read_link(&path).map_err(display_error)?;
        let resolved = if target.is_absolute() {
            normalize_path(&target)
        } else {
            normalize_path(
                &path
                    .parent()
                    .ok_or_else(|| "Invalid symlink path".to_string())?
                    .join(target),
            )
        };
        if !resolved.starts_with(&root) {
            failures.push(format!(
                "Safety check `symlinks` failed: `{relative}` escapes the worktree"
            ));
        }
    }
    Ok(failures)
}

fn oversized_added_files(
    worktree: &Path,
    statuses: &[(String, String)],
) -> Result<Vec<String>, String> {
    let mut failures = Vec::new();
    for (status, relative) in statuses {
        if !status.contains('A') && status != "??" {
            continue;
        }
        let path = worktree.join(relative);
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.is_file() && metadata.len() > MAX_ADDED_FILE_SIZE {
            failures.push(format!(
                "Safety check `fileSize` failed: `{relative}` exceeds 5 MiB"
            ));
        }
    }
    Ok(failures)
}

async fn unsafe_file_mode_changes(worktree: &Path) -> Result<Vec<String>, String> {
    let output = command_text(
        "git",
        &["diff", "--raw", "--no-abbrev", "HEAD"],
        Some(worktree),
        Duration::from_secs(30),
    )
    .await?;
    let mut failures = Vec::new();
    for line in output.lines().filter(|line| line.starts_with(':')) {
        let mut fields = line.split_whitespace();
        let old_mode = fields.next().unwrap_or_default().trim_start_matches(':');
        let new_mode = fields.next().unwrap_or_default();
        if old_mode == "000000" || new_mode == "000000" || old_mode == new_mode {
            continue;
        }
        let relative = line
            .split_once('\t')
            .map(|(_, path)| path)
            .unwrap_or("tracked file");
        failures.push(format!(
            "Safety check `fileMode` failed: `{relative}` changed mode"
        ));
    }
    Ok(failures)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            other => result.push(other.as_os_str()),
        }
    }
    result
}

fn include_repository_entry(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy();
    !matches!(
        name.as_ref(),
        ".git" | "node_modules" | "target" | "dist" | "dist-ssr" | ".cache"
    )
}

fn claim_active_session(state: &AppState, session_id: &str) -> Result<(), String> {
    if !state
        .active
        .lock()
        .map_err(display_error)?
        .insert(session_id.to_string())
    {
        return Err("The change session is already running".to_string());
    }
    Ok(())
}

fn ensure_session_inactive(state: &AppState, session_id: &str) -> Result<(), String> {
    if state
        .active
        .lock()
        .map_err(display_error)?
        .contains(session_id)
    {
        return Err("Wait for the active session cycle to stop first".to_string());
    }
    Ok(())
}

fn ensure_not_cancelled(runtime: &SessionRuntime, session_id: &str) -> Result<(), String> {
    if runtime.is_cancelled(session_id)? {
        Err("Session cancelled".to_string())
    } else {
        Ok(())
    }
}

fn ensure_cycle_time(runtime: &SessionRuntime, started: Instant) -> Result<(), String> {
    if runtime.clock.elapsed(started) >= MAX_CYCLE_TIME {
        Err("Session exceeded the 30 minute cycle limit".to_string())
    } else {
        Ok(())
    }
}

fn browser_tool_specs() -> Vec<Value> {
    vec![
        tool(
            "browser_open",
            "Open a path relative to the approved localhost application origin.",
            json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"],
                "additionalProperties": false
            }),
        ),
        tool(
            "browser_inspect",
            "Inspect visible text, roles, labels, controls, URL, and browser errors.",
            json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        ),
        tool(
            "browser_click",
            "Click an element using a Playwright role, label, text, or test id locator.",
            locator_schema(false),
        ),
        tool(
            "browser_fill",
            "Fill a form control using a Playwright role, label, text, or test id locator.",
            locator_schema(true),
        ),
        tool(
            "browser_press",
            "Press a keyboard key on the page or on a located element.",
            json!({
                "type": "object",
                "properties": {
                    "key": { "type": "string" },
                    "locator": locator_properties()
                },
                "required": ["key"],
                "additionalProperties": false
            }),
        ),
        tool(
            "browser_wait",
            "Wait for visible text or a bounded duration.",
            json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string" },
                    "timeoutMs": { "type": "number", "minimum": 100, "maximum": 10000 }
                },
                "additionalProperties": false
            }),
        ),
        tool(
            "browser_screenshot",
            "Capture the current page and return it as image input.",
            json!({
                "type": "object",
                "properties": { "fullPage": { "type": "boolean" } },
                "additionalProperties": false
            }),
        ),
        tool(
            "browser_errors",
            "Return uncaught page errors and console.error messages.",
            json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        ),
    ]
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema
    })
}

fn locator_schema(with_value: bool) -> Value {
    let mut properties = locator_properties();
    if with_value {
        properties
            .as_object_mut()
            .expect("locator properties")
            .insert("value".to_string(), json!({ "type": "string" }));
    }
    let mut required = vec![json!("locator")];
    if with_value {
        required.push(json!("value"));
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false
    })
}

fn locator_properties() -> Value {
    json!({
        "locator": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["role", "label", "text", "testId"]
                },
                "value": { "type": "string" },
                "name": { "type": "string" }
            },
            "required": ["kind", "value"],
            "additionalProperties": false
        }
    })
}

fn branch_name(request: &str, id: &str) -> String {
    let slug = request
        .to_ascii_lowercase()
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|value| !value.is_empty())
        .take(6)
        .collect::<Vec<_>>()
        .join("-");
    let suffix = id.chars().take(8).collect::<String>();
    format!(
        "code/{}-{}",
        if slug.is_empty() { "change" } else { &slug },
        suffix
    )
}

fn compact_title(request: &str) -> String {
    let title = request.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.chars().count() > 72 {
        format!("{}...", title.chars().take(69).collect::<String>())
    } else {
        title
    }
}

fn trim_output(value: &str) -> String {
    const LIMIT: usize = 8_000;
    if value.chars().count() <= LIMIT {
        return value.trim().to_string();
    }
    format!(
        "{}\n...[output truncated]",
        value.chars().take(LIMIT).collect::<String>().trim()
    )
}

pub(crate) fn approval_result(method: &str, decision: &str) -> Result<Value, String> {
    const METHODS: [&str; 6] = [
        "item/commandExecution/requestApproval",
        "item/fileChange/requestApproval",
        "item/networkAccess/requestApproval",
        "item/externalPath/requestApproval",
        "item/secretAccess/requestApproval",
        "item/privilegedOperation/requestApproval",
    ];
    if !METHODS.contains(&method) {
        return Err(format!("Unsupported approval request: {method}"));
    }
    if !matches!(decision, "accept" | "acceptForSession" | "decline") {
        return Err(format!("Unsupported approval decision: {decision}"));
    }
    Ok(json!({ "decision": decision }))
}

fn codex_notification_key(thread_id: &str, message: &Value) -> String {
    let mut hasher = Sha256::new();
    hasher.update(thread_id.as_bytes());
    hasher.update(serde_json::to_vec(message).unwrap_or_default());
    format!("{:x}", hasher.finalize())
}

fn redact_sensitive_text(value: &str) -> String {
    trim_output(
        &value
            .lines()
            .map(|line| {
                if line_contains_sensitive_value(line) {
                    "[redacted sensitive output]".to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
    )
}

fn line_contains_sensitive_value(line: &str) -> bool {
    let lowercase = line.to_ascii_lowercase();
    if [
        "-----begin ",
        "ghp_",
        "github_pat_",
        "akia",
        "asia",
        "xoxb-",
        "xoxp-",
        "sk_live_",
        "rk_live_",
    ]
    .iter()
    .any(|pattern| lowercase.contains(pattern))
    {
        return true;
    }
    let has_secret_assignment = [
        "api_key",
        "apikey",
        "secret",
        "access_token",
        "auth_token",
        "password",
        "passwd",
    ]
    .iter()
    .any(|name| lowercase.contains(name))
        && (line.contains('=') || line.contains(':'));
    if has_secret_assignment {
        return true;
    }
    line.split(|character: char| {
        !(character.is_ascii_alphanumeric() || matches!(character, '+' | '/' | '_' | '-' | '='))
    })
    .any(|candidate| {
        let looks_like_uuid = candidate.len() == 36
            && candidate.chars().enumerate().all(|(index, value)| {
                if matches!(index, 8 | 13 | 18 | 23) {
                    value == '-'
                } else {
                    value.is_ascii_hexdigit()
                }
            });
        candidate.len() >= 24
            && !looks_like_uuid
            && candidate.chars().collect::<HashSet<_>>().len() >= 10
            && [
                candidate.chars().any(|value| value.is_ascii_lowercase()),
                candidate.chars().any(|value| value.is_ascii_uppercase()),
                candidate.chars().any(|value| value.is_ascii_digit()),
                candidate
                    .chars()
                    .any(|value| matches!(value, '+' | '/' | '_' | '-')),
            ]
            .into_iter()
            .filter(|present| *present)
            .count()
                >= 3
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        collections::VecDeque,
        process::Command as StdCommand,
        sync::{Arc, Mutex},
    };

    use crate::session_engine::test_support::{
        EngineRequest, EngineStep, FakeImplementationEngine, FileEdit,
    };

    fn temporary_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("code-{label}-{}", Uuid::new_v4()))
    }

    fn run(repository: &Path, args: &[&str]) {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repository)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", "Code Test")
            .env("GIT_AUTHOR_EMAIL", "code-test@example.com")
            .env("GIT_COMMITTER_NAME", "Code Test")
            .env("GIT_COMMITTER_EMAIL", "code-test@example.com")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[derive(Clone, Default)]
    struct FakeProcessExecutor {
        outputs: Arc<Mutex<VecDeque<ProcessOutput>>>,
        requests: Arc<Mutex<Vec<(String, String, Vec<String>)>>>,
        scanner_output: Arc<Mutex<Option<ProcessOutput>>>,
    }

    impl FakeProcessExecutor {
        fn scripted(outputs: Vec<ProcessOutput>) -> Self {
            Self {
                outputs: Arc::new(Mutex::new(outputs.into())),
                requests: Arc::new(Mutex::new(Vec::new())),
                scanner_output: Arc::new(Mutex::new(None)),
            }
        }

        fn with_scanner_output(outputs: Vec<ProcessOutput>, scanner_output: ProcessOutput) -> Self {
            let executor = Self::scripted(outputs);
            *executor.scanner_output.lock().unwrap() = Some(scanner_output);
            executor
        }

        fn assert_exhausted(&self) {
            assert!(
                self.outputs.lock().unwrap().is_empty(),
                "unconsumed process outputs"
            );
        }

        fn requests(&self) -> Vec<(String, String, Vec<String>)> {
            self.requests.lock().unwrap().clone()
        }
    }

    impl ProcessExecutor for FakeProcessExecutor {
        fn run(
            &self,
            _cancelled: Arc<Mutex<HashSet<String>>>,
            registry: ProcessRegistry,
            _session_id: String,
            purpose: String,
            program: String,
            args: Vec<String>,
            _cwd: Option<PathBuf>,
            _process_timeout: Duration,
        ) -> EngineFuture<'_, ProcessOutput> {
            let _ = registry;
            if args.iter().any(|value| value == "code-secret-scanner") {
                if let Some(result) = self.scanner_output.lock().unwrap().clone() {
                    return Box::pin(async move { Ok(result) });
                }
                let result = fake_secret_scanner(&args);
                return Box::pin(async move { result });
            }
            self.requests.lock().unwrap().push((purpose, program, args));
            let result =
                self.outputs.lock().unwrap().pop_front().ok_or_else(|| {
                    "Unexpected process request after script completion".to_string()
                });
            Box::pin(async move { result })
        }
    }

    #[derive(Clone)]
    struct MutatingProcessExecutor {
        relative_path: PathBuf,
        contents: Vec<u8>,
    }

    impl ProcessExecutor for MutatingProcessExecutor {
        fn run(
            &self,
            _cancelled: Arc<Mutex<HashSet<String>>>,
            registry: ProcessRegistry,
            _session_id: String,
            _purpose: String,
            _program: String,
            args: Vec<String>,
            _cwd: Option<PathBuf>,
            _process_timeout: Duration,
        ) -> EngineFuture<'_, ProcessOutput> {
            let _ = registry;
            if args.iter().any(|value| value == "code-secret-scanner") {
                let result = fake_secret_scanner(&args);
                return Box::pin(async move { result });
            }
            let mutation = args
                .windows(2)
                .find(|pair| pair[0] == "-v" && pair[1].ends_with(":/workspace"))
                .and_then(|pair| pair[1].strip_suffix(":/workspace"))
                .map(PathBuf::from)
                .map(|worktree| worktree.join(&self.relative_path))
                .ok_or_else(|| "Fixture could not locate the mounted worktree".to_string())
                .and_then(|path| {
                    if let Some(parent) = path.parent() {
                        std::fs::create_dir_all(parent).map_err(display_error)?;
                    }
                    std::fs::write(path, &self.contents).map_err(display_error)
                })
                .map(|()| passing_process());
            Box::pin(async move { mutation })
        }
    }

    fn fake_secret_scanner(args: &[String]) -> Result<ProcessOutput, String> {
        let diff_path = args
            .windows(2)
            .find(|pair| pair[0] == "-v" && pair[1].ends_with(":/tmp/change.patch:ro"))
            .and_then(|pair| pair[1].strip_suffix(":/tmp/change.patch:ro"))
            .ok_or_else(|| "Secret scanner fixture input was not mounted".to_string())?;
        let scanner = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("secret-scanner-v1.cjs");
        let output = StdCommand::new("node")
            .args([scanner.to_string_lossy().as_ref(), diff_path])
            .output()
            .map_err(display_error)?;
        Ok(ProcessOutput {
            exit_code: output.status.code(),
            output: String::from_utf8_lossy(&output.stdout).into_owned(),
            timed_out: false,
            cancelled: false,
        })
    }

    fn passing_process() -> ProcessOutput {
        ProcessOutput {
            exit_code: Some(0),
            output: "passed".to_string(),
            timed_out: false,
            cancelled: false,
        }
    }

    fn failing_process(message: &str) -> ProcessOutput {
        ProcessOutput {
            exit_code: Some(1),
            output: message.to_string(),
            timed_out: false,
            cancelled: false,
        }
    }

    struct SessionHarnessFixture {
        root: PathBuf,
        repository: PathBuf,
        worktree: PathBuf,
        data_dir: PathBuf,
        manifest: VerificationManifest,
    }

    impl SessionHarnessFixture {
        fn new() -> Self {
            let root = temporary_directory("session-harness");
            let repository = root.join("repository");
            let data_dir = root.join("data");
            let worktree = data_dir.join("worktrees").join("session-1");
            std::fs::create_dir_all(&repository).unwrap();
            std::fs::create_dir_all(worktree.parent().unwrap()).unwrap();
            std::fs::write(
                repository.join("package.json"),
                r#"{"scripts":{"test:unit":"bun test"}}"#,
            )
            .unwrap();
            std::fs::write(repository.join("bun.lock"), "fixture lock").unwrap();
            std::fs::write(repository.join("source.txt"), "committed").unwrap();
            run(&repository, &["init"]);
            run(&repository, &["add", "."]);
            run(&repository, &["commit", "-m", "fixture"]);
            run(
                &repository,
                &[
                    "worktree",
                    "add",
                    "--detach",
                    worktree.to_str().unwrap(),
                    "HEAD",
                ],
            );

            migrate(&data_dir).unwrap();
            let runtime = tokio::runtime::Runtime::new().unwrap();
            let proposal = runtime.block_on(propose_policy(&repository, None)).unwrap();
            let head = runtime
                .block_on(git_text(&repository, &["rev-parse", "HEAD"]))
                .unwrap();
            let connection = super::super::database(&data_dir).unwrap();
            connection
                .execute(
                    "INSERT INTO repositories
                     (id, path, name, head_sha, dirty, compatible, created_at, updated_at)
                     VALUES ('repo-1', ?1, 'fixture', ?2, 0, 1, 1, 1)",
                    params![repository.to_string_lossy(), head.trim()],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO repository_policies
                     (repository_id, manifest_json, fingerprint, fingerprint_paths_json, approved_at)
                     VALUES ('repo-1', ?1, ?2, ?3, 1)",
                    params![
                        serde_json::to_string(&proposal.manifest).unwrap(),
                        proposal.fingerprint,
                        serde_json::to_string(&proposal.fingerprint_paths).unwrap()
                    ],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO change_sessions
                     (id, repository_id, request, base_sha, worktree_path, status, attempt,
                      created_at, updated_at)
                     VALUES ('session-1', 'repo-1', 'Change source', ?1, ?2, 'preparing', 0, 1, 1)",
                    params![head.trim(), worktree.to_string_lossy()],
                )
                .unwrap();
            drop(connection);

            Self {
                root,
                repository,
                worktree,
                data_dir,
                manifest: proposal.manifest,
            }
        }

        fn runtime(
            &self,
            engine: FakeImplementationEngine,
            processes: FakeProcessExecutor,
        ) -> SessionRuntime {
            SessionRuntime::harness(self.data_dir.clone(), Arc::new(engine), Arc::new(processes))
        }

        fn cleanup(self) {
            if self.worktree.exists() {
                run(
                    &self.repository,
                    &[
                        "worktree",
                        "remove",
                        "--force",
                        self.worktree.to_str().unwrap(),
                    ],
                );
            } else {
                run(&self.repository, &["worktree", "prune"]);
            }
            let worktrees = StdCommand::new("git")
                .args(["worktree", "list", "--porcelain"])
                .current_dir(&self.repository)
                .env("GIT_CONFIG_GLOBAL", "/dev/null")
                .env("GIT_CONFIG_SYSTEM", "/dev/null")
                .output()
                .unwrap();
            assert!(!String::from_utf8_lossy(&worktrees.stdout)
                .contains(self.worktree.to_string_lossy().as_ref()));
            std::fs::remove_dir_all(&self.root).unwrap();
            assert!(!self.root.exists());
        }
    }

    fn passing_engine() -> FakeImplementationEngine {
        FakeImplementationEngine::scripted(vec![
            EngineStep::StartThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                edits: vec![FileEdit {
                    path: PathBuf::from("source.txt"),
                    contents: b"implemented".to_vec(),
                }],
            },
            EngineStep::TurnStatus {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                status: EngineTurnStatus::Completed,
            },
        ])
    }

    #[derive(Clone, Default)]
    struct CancellationProcessExecutor;

    impl ProcessExecutor for CancellationProcessExecutor {
        fn run(
            &self,
            cancelled: Arc<Mutex<HashSet<String>>>,
            registry: ProcessRegistry,
            session_id: String,
            purpose: String,
            _program: String,
            _args: Vec<String>,
            _cwd: Option<PathBuf>,
            _process_timeout: Duration,
        ) -> EngineFuture<'_, ProcessOutput> {
            Box::pin(async move {
                let record_id = registry.register(&session_id, &purpose, "process", None, None)?;
                loop {
                    if cancelled
                        .lock()
                        .map_err(display_error)?
                        .contains(&session_id)
                    {
                        registry.finish(&record_id)?;
                        return Ok(ProcessOutput {
                            exit_code: None,
                            output: String::new(),
                            timed_out: false,
                            cancelled: true,
                        });
                    }
                    sleep(Duration::from_millis(5)).await;
                }
            })
        }
    }

    struct FixedElapsedClock(Duration);

    impl SessionClock for FixedElapsedClock {
        fn elapsed(&self, _started: Instant) -> Duration {
            self.0
        }
    }

    fn verify_fixture_change(
        fixture: &SessionHarnessFixture,
        processes: Arc<dyn ProcessExecutor>,
    ) -> Result<(), String> {
        let runtime = SessionRuntime::harness(
            fixture.data_dir.clone(),
            Arc::new(FakeImplementationEngine::default()),
            processes,
        );
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            false,
        ));
        finish_session_cycle(&runtime, "session-1", result.clone());
        result
    }

    #[test]
    fn session_harness_reaches_verified_without_codex_credentials() {
        let fixture = SessionHarnessFixture::new();
        let engine = passing_engine();
        let processes = FakeProcessExecutor::scripted(vec![passing_process(), passing_process()]);
        let runtime = fixture.runtime(engine.clone(), processes.clone());
        let tokio = tokio::runtime::Runtime::new().unwrap();

        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            true,
        ));
        finish_session_cycle(&runtime, "session-1", result);

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        let snapshot = load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "verified");
        assert_eq!(session.codex_thread_id.as_deref(), Some("thread-1"));
        assert!(snapshot.has_diff);
        assert_eq!(snapshot.required, snapshot.passed);
        assert_eq!(snapshot.failed, 0);
        assert_eq!(
            std::fs::read_to_string(fixture.worktree.join("source.txt")).unwrap(),
            "implemented"
        );
        engine.assert_exhausted();
        processes.assert_exhausted();
        fixture.cleanup();
    }

    #[test]
    fn session_harness_repairs_on_the_same_thread_with_structured_failure() {
        let fixture = SessionHarnessFixture::new();
        let engine = FakeImplementationEngine::scripted(vec![
            EngineStep::StartThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                edits: vec![FileEdit {
                    path: PathBuf::from("source.txt"),
                    contents: b"first attempt".to_vec(),
                }],
            },
            EngineStep::TurnStatus {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                status: EngineTurnStatus::Completed,
            },
            EngineStep::ResumeThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-2".to_string(),
                edits: vec![FileEdit {
                    path: PathBuf::from("source.txt"),
                    contents: b"repaired".to_vec(),
                }],
            },
            EngineStep::TurnStatus {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-2".to_string(),
                status: EngineTurnStatus::Completed,
            },
        ]);
        let processes = FakeProcessExecutor::scripted(vec![
            passing_process(),
            failing_process("unit assertion failed"),
            passing_process(),
            passing_process(),
        ]);
        let runtime = fixture.runtime(engine.clone(), processes.clone());
        let tokio = tokio::runtime::Runtime::new().unwrap();

        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            true,
        ));
        finish_session_cycle(&runtime, "session-1", result);

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "verified");
        let prompts = engine
            .requests()
            .into_iter()
            .filter_map(|request| match request {
                EngineRequest::StartTurn {
                    thread_id, prompt, ..
                } => Some((thread_id, prompt)),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(prompts.len(), 2);
        assert!(prompts.iter().all(|(thread_id, _)| thread_id == "thread-1"));
        assert!(prompts[1]
            .1
            .contains("Verification failed against worktree digest"));
        assert!(prompts[1].1.contains("redacted command log"));
        engine.assert_exhausted();
        processes.assert_exhausted();
        fixture.cleanup();
    }

    #[test]
    fn session_harness_malformed_engine_response_is_recoverable() {
        let fixture = SessionHarnessFixture::new();
        let engine = FakeImplementationEngine::scripted(vec![
            EngineStep::StartThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::Malformed("not-json".to_string()),
        ]);
        let runtime = fixture.runtime(engine, FakeProcessExecutor::default());
        let tokio = tokio::runtime::Runtime::new().unwrap();

        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            true,
        ));
        assert!(result.as_ref().unwrap_err().contains("Unexpected protocol"));
        finish_session_cycle(&runtime, "session-1", result);

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session
            .terminal_reason
            .unwrap()
            .contains("Unexpected protocol"));
        fixture.cleanup();
    }

    #[test]
    fn session_harness_interrupted_turn_is_recoverable() {
        let fixture = SessionHarnessFixture::new();
        let engine = FakeImplementationEngine::scripted(vec![
            EngineStep::StartThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                edits: Vec::new(),
            },
            EngineStep::TurnStatus {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                status: EngineTurnStatus::Interrupted,
            },
        ]);
        let runtime = fixture.runtime(engine, FakeProcessExecutor::default());
        let tokio = tokio::runtime::Runtime::new().unwrap();

        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            true,
        ));
        finish_session_cycle(&runtime, "session-1", result);

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session.terminal_reason.unwrap().contains("interrupted"));
        fixture.cleanup();
    }

    #[test]
    fn session_harness_dynamic_tool_can_return_text_and_image() {
        let engine = FakeImplementationEngine::scripted(vec![EngineStep::DynamicTool {
            result: json!({
                "success": true,
                "contentItems": [
                    { "type": "inputText", "text": "Form submitted" },
                    { "type": "inputImage", "imageUrl": "data:image/png;base64,aW1hZ2U=" }
                ]
            }),
        }]);
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let response = tokio
            .block_on(engine.dynamic_tool_call(json!({ "tool": "browser_screenshot" })))
            .unwrap();

        assert_eq!(response["contentItems"][0]["type"], "inputText");
        assert_eq!(response["contentItems"][1]["type"], "inputImage");
        engine.assert_exhausted();
    }

    #[test]
    fn session_harness_fixture_runs_are_equivalent() {
        fn run_once() -> (String, Vec<(String, String)>, VerificationSnapshot) {
            let fixture = SessionHarnessFixture::new();
            let manifest = serde_json::to_string(&fixture.manifest).unwrap();
            let engine = passing_engine();
            let processes =
                FakeProcessExecutor::scripted(vec![passing_process(), passing_process()]);
            let runtime = fixture.runtime(engine, processes);
            let tokio = tokio::runtime::Runtime::new().unwrap();
            let result = tokio.block_on(run_session_cycle_with_runtime(
                &runtime,
                "session-1",
                None,
                true,
            ));
            finish_session_cycle(&runtime, "session-1", result);
            let gates = load_gate_results(&fixture.data_dir, "session-1")
                .unwrap()
                .into_iter()
                .map(|gate| (gate.kind, gate.status))
                .collect();
            let snapshot = load_snapshot(&fixture.data_dir, "session-1")
                .unwrap()
                .unwrap();
            fixture.cleanup();
            (manifest, gates, snapshot)
        }

        let first = run_once();
        let second = run_once();
        assert_eq!(first.0, second.0);
        assert_eq!(first.1, second.1);
        assert_eq!(first.2.required, second.2.required);
        assert_eq!(first.2.passed, second.2.passed);
        assert_eq!(first.2.failed, second.2.failed);
        assert_eq!(first.2.missing, second.2.missing);
        assert_eq!(first.2.has_diff, second.2.has_diff);
    }

    #[test]
    fn verification_fixtures_tracked_gate_mutation_cannot_verify() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "before gate").unwrap();
        let result = verify_fixture_change(
            &fixture,
            Arc::new(MutatingProcessExecutor {
                relative_path: PathBuf::from("source.txt"),
                contents: b"changed by gate".to_vec(),
            }),
        );

        assert!(result.is_ok());
        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session
            .terminal_reason
            .unwrap()
            .contains("gate `install` changed the worktree"));
        assert!(load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .is_none());
        assert!(load_gate_results(&fixture.data_dir, "session-1")
            .unwrap()
            .is_empty());
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_untracked_gate_mutation_cannot_verify() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "before gate").unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(MutatingProcessExecutor {
                relative_path: PathBuf::from("gate-output.txt"),
                contents: b"generated".to_vec(),
            }),
        )
        .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .is_none());
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_database_failure_rolls_back_snapshot_and_results() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "changed").unwrap();
        super::super::database(&fixture.data_dir)
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER fail_snapshot BEFORE INSERT ON verification_snapshots
                 BEGIN SELECT RAISE(ABORT, 'simulated snapshot failure'); END;",
            )
            .unwrap();
        let result = verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        );

        assert!(result.unwrap_err().contains("simulated snapshot failure"));
        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session.verification_digest.is_none());
        assert!(load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .is_none());
        assert!(load_gate_results(&fixture.data_dir, "session-1")
            .unwrap()
            .is_empty());
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_restart_before_commit_is_recoverable() {
        let fixture = SessionHarnessFixture::new();
        let runtime = SessionRuntime::harness(
            fixture.data_dir.clone(),
            Arc::new(FakeImplementationEngine::default()),
            Arc::new(FakeProcessExecutor::default()),
        );
        transition(&runtime, "session-1", "verifying", 1).unwrap();

        mark_interrupted(&fixture.data_dir).unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session.verification_digest.is_none());
        assert!(load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .is_none());
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_stale_and_duplicate_results_are_rejected() {
        let fixture = SessionHarnessFixture::new();
        let expected = HashSet::from(["diff".to_string()]);
        let stale = PendingGateResult {
            kind: "diff".to_string(),
            required: true,
            status: "passed".to_string(),
            attempt: 1,
            duration_ms: 0,
            exit_code: Some(0),
            worktree_digest: "old".to_string(),
            artifact_ids: Vec::new(),
        };
        assert!(commit_verification_attempt(
            &fixture.data_dir,
            "session-1",
            1,
            "new",
            std::slice::from_ref(&stale),
            &expected,
            true,
            true,
        )
        .unwrap_err()
        .contains("stale"));
        assert!(commit_verification_attempt(
            &fixture.data_dir,
            "session-1",
            1,
            "old",
            &[stale.clone(), stale],
            &expected,
            true,
            true,
        )
        .unwrap_err()
        .contains("duplicated"));
        assert!(load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .is_none());
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_post_verification_edit_blocks_acceptance() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "verified change").unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();
        let verified = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        let tokio = tokio::runtime::Runtime::new().unwrap();
        tokio
            .block_on(acceptance_digest(&fixture.data_dir, &verified))
            .unwrap();

        std::fs::write(fixture.worktree.join("source.txt"), "edited after verify").unwrap();
        assert!(tokio
            .block_on(acceptance_digest(&fixture.data_dir, &verified))
            .unwrap_err()
            .contains("stale"));
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_no_diff_never_verifies() {
        let fixture = SessionHarnessFixture::new();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();
        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session
            .terminal_reason
            .unwrap()
            .contains("produced no changes"));
        assert!(load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .is_none());
        fixture.cleanup();
    }

    #[cfg(unix)]
    #[test]
    fn verification_fixtures_file_mode_change_is_unsafe() {
        use std::os::unix::fs::PermissionsExt;

        let fixture = SessionHarnessFixture::new();
        let path = fixture.worktree.join("source.txt");
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session.terminal_reason.unwrap().contains("fileMode"));
        fixture.cleanup();
    }

    #[cfg(unix)]
    #[test]
    fn verification_fixtures_internal_symlink_and_exact_size_boundary_pass() {
        use std::os::unix::fs::symlink;

        let fixture = SessionHarnessFixture::new();
        symlink("source.txt", fixture.worktree.join("source-link")).unwrap();
        std::fs::write(
            fixture.worktree.join("exactly-5-mib.bin"),
            vec![0_u8; MAX_ADDED_FILE_SIZE as usize],
        )
        .unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(
            session.status, "verified",
            "terminal reason: {:?}",
            session.terminal_reason
        );
        fixture.cleanup();
    }

    #[cfg(unix)]
    #[test]
    fn verification_fixtures_escaping_symlink_is_unsafe() {
        use std::os::unix::fs::symlink;

        let fixture = SessionHarnessFixture::new();
        symlink("../../outside", fixture.worktree.join("escape")).unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session.terminal_reason.unwrap().contains("escapes"));
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_oversized_file_and_policy_mutation_are_unsafe() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(
            fixture.worktree.join("too-large.bin"),
            vec![0_u8; MAX_ADDED_FILE_SIZE as usize + 1],
        )
        .unwrap();
        std::fs::write(
            fixture.worktree.join("package.json"),
            r#"{"scripts":{"test:unit":"bun test","build":"bun build"}}"#,
        )
        .unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        let reason = session.terminal_reason.unwrap();
        assert!(reason.contains("exceeds 5 MiB"));
        assert!(reason.contains("package configuration changed"));
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_snapshot_has_one_result_per_required_check() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "verified").unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();

        let snapshot = load_snapshot(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        let results = load_gate_results(&fixture.data_dir, "session-1").unwrap();
        let latest = results
            .iter()
            .filter(|result| result.required && result.worktree_digest == snapshot.worktree_digest)
            .collect::<Vec<_>>();
        let kinds = latest
            .iter()
            .map(|result| result.kind.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(latest.len(), snapshot.required);
        assert_eq!(kinds.len(), snapshot.required);
        assert!(latest.iter().all(|result| result.status == "passed"));
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_secret_scanner_fails_redacted_for_supported_rules() {
        let cases = [
            ("token", format!("ghp_{}", "A".repeat(36))),
            (
                "private-key",
                "-----BEGIN OPENSSH PRIVATE KEY-----".to_string(),
            ),
            (
                "entropy",
                "const opaque = \"N7vQ2xL9pR4mT8kW3zC6sH1jF5uB0aYd\";".to_string(),
            ),
        ];

        for (label, secret) in cases {
            let fixture = SessionHarnessFixture::new();
            std::fs::write(
                fixture.worktree.join(format!("{label}.txt")),
                format!("{secret}\n"),
            )
            .unwrap();
            verify_fixture_change(
                &fixture,
                Arc::new(FakeProcessExecutor::scripted(vec![
                    passing_process(),
                    passing_process(),
                ])),
            )
            .unwrap();

            let session = load_session_row(&fixture.data_dir, "session-1")
                .unwrap()
                .unwrap();
            assert_eq!(session.status, "needs_input");
            assert!(session
                .terminal_reason
                .as_deref()
                .unwrap_or_default()
                .contains("redacted finding"));
            assert!(!session
                .terminal_reason
                .as_deref()
                .unwrap_or_default()
                .contains(&secret));
            assert!(load_events(&fixture.data_dir, "session-1")
                .unwrap()
                .iter()
                .all(|event| !event.message.contains(&secret)));
            let database = std::fs::read(fixture.data_dir.join("code-desktop.sqlite")).unwrap();
            assert!(!String::from_utf8_lossy(&database).contains(&secret));
            fixture.cleanup();
        }
    }

    #[test]
    fn verification_fixtures_secret_in_committed_base_is_ignored() {
        let fixture = SessionHarnessFixture::new();
        let base_secret = format!("ghp_{}", "B".repeat(36));
        std::fs::write(
            fixture.repository.join("base-secret.txt"),
            format!("{base_secret}\n"),
        )
        .unwrap();
        run(&fixture.repository, &["add", "base-secret.txt"]);
        run(&fixture.repository, &["commit", "-m", "add base fixture"]);
        let base_sha = StdCommand::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&fixture.repository)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .output()
            .unwrap();
        let base_sha = String::from_utf8(base_sha.stdout).unwrap();
        run(&fixture.worktree, &["reset", "--hard", base_sha.trim()]);
        std::fs::write(fixture.worktree.join("source.txt"), "safe changed value").unwrap();

        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "verified");
        fixture.cleanup();
    }

    #[test]
    fn verification_fixtures_secret_scanner_malformed_or_missing_fails_closed() {
        for scanner_output in [
            ProcessOutput {
                exit_code: Some(0),
                output: "not-json".to_string(),
                timed_out: false,
                cancelled: false,
            },
            ProcessOutput {
                exit_code: Some(127),
                output: "scanner unavailable".to_string(),
                timed_out: false,
                cancelled: false,
            },
        ] {
            let fixture = SessionHarnessFixture::new();
            std::fs::write(fixture.worktree.join("source.txt"), "safe changed value").unwrap();
            verify_fixture_change(
                &fixture,
                Arc::new(FakeProcessExecutor::with_scanner_output(
                    vec![passing_process(), passing_process()],
                    scanner_output,
                )),
            )
            .unwrap();

            let session = load_session_row(&fixture.data_dir, "session-1")
                .unwrap()
                .unwrap();
            assert_eq!(session.status, "needs_input");
            assert!(session
                .terminal_reason
                .as_deref()
                .unwrap_or_default()
                .contains("scanner failure"));
            fixture.cleanup();
        }
    }

    #[test]
    fn verification_fixtures_deleted_or_added_package_manifest_is_unsafe() {
        for mutate in ["delete-root-manifest", "add-package-manifest"] {
            let fixture = SessionHarnessFixture::new();
            if mutate == "delete-root-manifest" {
                std::fs::remove_file(fixture.worktree.join("package.json")).unwrap();
            } else {
                let package = fixture.worktree.join("packages/new/package.json");
                std::fs::create_dir_all(package.parent().unwrap()).unwrap();
                std::fs::write(package, r#"{"name":"new-package"}"#).unwrap();
            }
            verify_fixture_change(
                &fixture,
                Arc::new(FakeProcessExecutor::scripted(vec![
                    passing_process(),
                    passing_process(),
                ])),
            )
            .unwrap();

            let session = load_session_row(&fixture.data_dir, "session-1")
                .unwrap()
                .unwrap();
            assert_eq!(session.status, "needs_input");
            assert!(session
                .terminal_reason
                .as_deref()
                .unwrap_or_default()
                .contains("package configuration changed"));
            fixture.cleanup();
        }
    }

    #[test]
    fn process_fixtures_completed_process_is_removed_from_registry() {
        let root = temporary_directory("process-complete");
        std::fs::create_dir_all(&root).unwrap();
        migrate(&root).unwrap();
        let runtime = SessionRuntime::harness(
            root.clone(),
            Arc::new(FakeImplementationEngine::default()),
            Arc::new(SystemProcessExecutor),
        );
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let output = tokio
            .block_on(run_process(
                &runtime,
                "session-process",
                "ordinary-gate",
                "/bin/sh",
                &["-c".to_string(), "printf process-complete".to_string()],
                None,
                Duration::from_secs(5),
            ))
            .unwrap();

        assert_eq!(output.exit_code, Some(0));
        assert_eq!(output.output, "process-complete");
        assert!(runtime
            .process_registry
            .records("session-process")
            .unwrap()
            .is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn process_fixtures_cancellation_covers_every_active_purpose() {
        let tokio = tokio::runtime::Runtime::new().unwrap();
        tokio.block_on(async {
            for purpose in [
                "implementation",
                "install",
                "ordinary-gate",
                "application-server-startup",
                "browser-interaction",
                "repair",
            ] {
                let root = temporary_directory("process-cancel");
                std::fs::create_dir_all(&root).unwrap();
                migrate(&root).unwrap();
                let runtime = Arc::new(SessionRuntime::harness(
                    root.clone(),
                    Arc::new(FakeImplementationEngine::default()),
                    Arc::new(CancellationProcessExecutor),
                ));
                let task_runtime = runtime.clone();
                let purpose = purpose.to_string();
                let task = tokio::spawn(async move {
                    run_process(
                        &task_runtime,
                        "session-cancel",
                        &purpose,
                        "fixture",
                        &[],
                        None,
                        Duration::from_secs(5),
                    )
                    .await
                });
                timeout(Duration::from_secs(1), async {
                    loop {
                        if !runtime
                            .process_registry
                            .records("session-cancel")
                            .unwrap()
                            .is_empty()
                        {
                            break;
                        }
                        sleep(Duration::from_millis(5)).await;
                    }
                })
                .await
                .unwrap();
                runtime
                    .cancelled
                    .lock()
                    .unwrap()
                    .insert("session-cancel".to_string());
                let output = timeout(Duration::from_secs(1), task)
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap();
                assert!(output.cancelled);
                assert!(runtime
                    .process_registry
                    .records("session-cancel")
                    .unwrap()
                    .is_empty());
                std::fs::remove_dir_all(root).unwrap();
            }
        });
    }

    #[test]
    fn process_fixtures_cleanup_is_idempotent_and_preserves_recovery_metadata() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "recoverable change").unwrap();
        super::super::database(&fixture.data_dir)
            .unwrap()
            .execute(
                "UPDATE change_sessions SET codex_thread_id = 'thread-recovery',
                 status = 'cancelled' WHERE id = 'session-1'",
                [],
            )
            .unwrap();
        let registry = ProcessRegistry::new(fixture.data_dir.clone());
        registry
            .register("session-1", "repair", "codex-turn", None, None)
            .unwrap();
        let tokio = tokio::runtime::Runtime::new().unwrap();
        tokio
            .block_on(registry.cleanup_session("session-1"))
            .unwrap();
        tokio
            .block_on(registry.cleanup_session("session-1"))
            .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.codex_thread_id.as_deref(), Some("thread-recovery"));
        assert_eq!(
            std::fs::read_to_string(fixture.worktree.join("source.txt")).unwrap(),
            "recoverable change"
        );
        assert!(registry.records("session-1").unwrap().is_empty());
        fixture.cleanup();
    }

    #[test]
    fn process_fixtures_restart_reconciles_active_sessions_without_auto_resume() {
        let fixture = SessionHarnessFixture::new();
        super::super::database(&fixture.data_dir)
            .unwrap()
            .execute(
                "UPDATE change_sessions SET status = 'implementing',
                 codex_thread_id = 'thread-restart' WHERE id = 'session-1'",
                [],
            )
            .unwrap();
        let registry = ProcessRegistry::new(fixture.data_dir.clone());
        registry
            .register("session-1", "implementation", "codex-turn", None, None)
            .unwrap();

        mark_interrupted(&fixture.data_dir).unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert_eq!(session.codex_thread_id.as_deref(), Some("thread-restart"));
        assert!(session.worktree_path.exists());
        assert!(session
            .terminal_reason
            .as_deref()
            .unwrap_or_default()
            .contains("continue or discard"));
        assert!(registry.records("session-1").unwrap().is_empty());
        fixture.cleanup();
    }

    #[test]
    fn process_fixtures_restart_reports_missing_worktree_and_keeps_final_sessions() {
        let fixture = SessionHarnessFixture::new();
        run(
            &fixture.repository,
            &[
                "worktree",
                "remove",
                "--force",
                fixture.worktree.to_str().unwrap(),
            ],
        );
        super::super::database(&fixture.data_dir)
            .unwrap()
            .execute(
                "UPDATE change_sessions SET status = 'verifying' WHERE id = 'session-1'",
                [],
            )
            .unwrap();
        mark_interrupted(&fixture.data_dir).unwrap();
        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session
            .terminal_reason
            .as_deref()
            .unwrap_or_default()
            .contains("worktree is missing"));
        fixture.cleanup();

        for final_status in ["accepted", "discarded"] {
            let fixture = SessionHarnessFixture::new();
            super::super::database(&fixture.data_dir)
                .unwrap()
                .execute(
                    "UPDATE change_sessions SET status = ?1 WHERE id = 'session-1'",
                    [final_status],
                )
                .unwrap();
            mark_interrupted(&fixture.data_dir).unwrap();
            assert_eq!(
                load_session_row(&fixture.data_dir, "session-1")
                    .unwrap()
                    .unwrap()
                    .status,
                final_status
            );
            fixture.cleanup();
        }
    }

    #[test]
    fn process_fixtures_docker_runs_are_session_labeled() {
        let mut args = restricted_docker_args(Path::new("/tmp/worktree"), "disabled", None);
        add_docker_labels(&mut args, "session-123", "ordinary-gate");
        assert!(args.windows(2).any(|pair| {
            pair == [
                "--label".to_string(),
                "code.session=session-123".to_string(),
            ]
        }));
        assert!(args.windows(2).any(|pair| {
            pair == [
                "--label".to_string(),
                "code.purpose=ordinary-gate".to_string(),
            ]
        }));
        assert_eq!(
            docker_container_name("session-123", "application server"),
            "code-session123-application-server"
        );
    }

    #[test]
    fn lifecycle_fixtures_first_attempt_and_same_thread_repair_reach_verified() {
        let first = SessionHarnessFixture::new();
        let first_runtime = first.runtime(
            passing_engine(),
            FakeProcessExecutor::scripted(vec![passing_process(), passing_process()]),
        );
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let result = tokio.block_on(run_session_cycle_with_runtime(
            &first_runtime,
            "session-1",
            None,
            true,
        ));
        finish_session_cycle(&first_runtime, "session-1", result);
        assert_eq!(
            load_session_row(&first.data_dir, "session-1")
                .unwrap()
                .unwrap()
                .status,
            "verified"
        );
        first.cleanup();

        let repaired = SessionHarnessFixture::new();
        let engine = FakeImplementationEngine::scripted(vec![
            EngineStep::StartThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                edits: vec![FileEdit {
                    path: PathBuf::from("source.txt"),
                    contents: b"first attempt".to_vec(),
                }],
            },
            EngineStep::TurnStatus {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                status: EngineTurnStatus::Completed,
            },
            EngineStep::ResumeThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-2".to_string(),
                edits: vec![FileEdit {
                    path: PathBuf::from("source.txt"),
                    contents: b"repaired".to_vec(),
                }],
            },
            EngineStep::TurnStatus {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-2".to_string(),
                status: EngineTurnStatus::Completed,
            },
        ]);
        let runtime = repaired.runtime(
            engine.clone(),
            FakeProcessExecutor::scripted(vec![
                passing_process(),
                failing_process("unit failed"),
                passing_process(),
                passing_process(),
            ]),
        );
        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            true,
        ));
        finish_session_cycle(&runtime, "session-1", result);
        let session = load_session_row(&repaired.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "verified");
        assert_eq!(session.attempt, 2);
        let repair_prompt = engine
            .requests()
            .into_iter()
            .find_map(|request| match request {
                EngineRequest::StartTurn { prompt, .. }
                    if prompt.contains("Verification failed") =>
                {
                    Some(prompt)
                }
                _ => None,
            })
            .unwrap();
        assert!(repair_prompt.contains("worktree digest"));
        assert!(repair_prompt.contains("redacted command log"));
        repaired.cleanup();
    }

    #[test]
    fn lifecycle_fixtures_attempt_and_cycle_exhaustion_need_input() {
        let fixture = SessionHarnessFixture::new();
        let mut steps = vec![
            EngineStep::StartThread {
                thread_id: "thread-1".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                edits: vec![FileEdit {
                    path: PathBuf::from("source.txt"),
                    contents: b"never passes".to_vec(),
                }],
            },
            EngineStep::TurnStatus {
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                status: EngineTurnStatus::Completed,
            },
        ];
        for attempt in 2..=MAX_ATTEMPTS {
            steps.extend([
                EngineStep::ResumeThread {
                    thread_id: "thread-1".to_string(),
                },
                EngineStep::StartTurn {
                    thread_id: "thread-1".to_string(),
                    turn_id: format!("turn-{attempt}"),
                    edits: Vec::new(),
                },
                EngineStep::TurnStatus {
                    thread_id: "thread-1".to_string(),
                    turn_id: format!("turn-{attempt}"),
                    status: EngineTurnStatus::Completed,
                },
            ]);
        }
        let outputs = (0..MAX_ATTEMPTS)
            .flat_map(|_| [passing_process(), failing_process("still failing")])
            .collect();
        let runtime = fixture.runtime(
            FakeImplementationEngine::scripted(steps),
            FakeProcessExecutor::scripted(outputs),
        );
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            true,
        ));
        finish_session_cycle(&runtime, "session-1", result);
        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert_eq!(session.attempt, MAX_ATTEMPTS);
        fixture.cleanup();

        let fixture = SessionHarnessFixture::new();
        let mut runtime = fixture.runtime(
            FakeImplementationEngine::default(),
            FakeProcessExecutor::default(),
        );
        runtime.clock = Arc::new(FixedElapsedClock(MAX_CYCLE_TIME));
        let result = tokio.block_on(run_session_cycle_with_runtime(
            &runtime,
            "session-1",
            None,
            true,
        ));
        finish_session_cycle(&runtime, "session-1", result);
        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "needs_input");
        assert!(session
            .terminal_reason
            .as_deref()
            .unwrap_or_default()
            .contains("30 minute"));
        fixture.cleanup();
    }

    #[test]
    fn lifecycle_fixtures_no_change_agent_failure_and_malformed_never_verify() {
        let cases = [
            EngineStep::Failure("agent unavailable".to_string()),
            EngineStep::Malformed("broken response".to_string()),
        ];
        for failure in cases {
            let fixture = SessionHarnessFixture::new();
            let runtime = fixture.runtime(
                FakeImplementationEngine::scripted(vec![failure]),
                FakeProcessExecutor::default(),
            );
            let tokio = tokio::runtime::Runtime::new().unwrap();
            let result = tokio.block_on(run_session_cycle_with_runtime(
                &runtime,
                "session-1",
                None,
                true,
            ));
            finish_session_cycle(&runtime, "session-1", result);
            assert_eq!(
                load_session_row(&fixture.data_dir, "session-1")
                    .unwrap()
                    .unwrap()
                    .status,
                "needs_input"
            );
            fixture.cleanup();
        }

        let fixture = SessionHarnessFixture::new();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();
        assert_ne!(
            load_session_row(&fixture.data_dir, "session-1")
                .unwrap()
                .unwrap()
                .status,
            "verified"
        );
        fixture.cleanup();
    }

    #[test]
    fn lifecycle_fixtures_acceptance_creates_verified_local_branch() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.repository.join("source.txt"), "dirty source").unwrap();
        let source_before = std::fs::read(fixture.repository.join("source.txt")).unwrap();
        std::fs::write(fixture.worktree.join("source.txt"), "accepted content").unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();
        let session_before = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let branch = tokio
            .block_on(accept_session(&fixture.data_dir, "session-1"))
            .unwrap();

        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        assert_eq!(session.status, "accepted");
        assert_eq!(session.branch_name.as_deref(), Some(branch.as_str()));
        assert!(!fixture.worktree.exists());
        assert_eq!(
            std::fs::read(fixture.repository.join("source.txt")).unwrap(),
            source_before
        );
        let parent = StdCommand::new("git")
            .args(["rev-parse", &format!("{branch}^")])
            .current_dir(&fixture.repository)
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8(parent.stdout).unwrap().trim(),
            session_before.base_sha
        );
        let content = StdCommand::new("git")
            .args(["show", &format!("{branch}:source.txt")])
            .current_dir(&fixture.repository)
            .output()
            .unwrap();
        assert_eq!(
            String::from_utf8(content.stdout).unwrap(),
            "accepted content"
        );
        run(&fixture.repository, &["branch", "-D", &branch]);
        fixture.cleanup();
    }

    #[test]
    fn report_fixtures_export_verified_and_accepted_reports() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "reportable content").unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();
        let tokio = tokio::runtime::Runtime::new().unwrap();

        let verified_export = tokio
            .block_on(export_evidence_report_for_session(
                &fixture.data_dir,
                "session-1",
            ))
            .unwrap();
        assert!(verified_export.report.accepted_branch.is_none());
        assert_eq!(verified_export.json_artifact.kind, "report");
        assert_eq!(verified_export.markdown_artifact.kind, "report");
        let verified_json =
            std::fs::read_to_string(&verified_export.json_artifact.path).unwrap();
        let verified_value: Value = serde_json::from_str(&verified_json).unwrap();
        assert_eq!(verified_value["version"], 1);
        assert!(verified_value.get("acceptedBranch").is_none());
        assert!(verified_value["artifacts"]
            .as_array()
            .unwrap()
            .iter()
            .all(|artifact| artifact["kind"] != "report"));
        let verified_markdown =
            std::fs::read_to_string(&verified_export.markdown_artifact.path).unwrap();
        assert!(verified_markdown.contains("# Evidence Report"));
        assert!(verified_markdown.contains("## Verification Gates"));
        assert!(verified_markdown.contains("## Safety Checks"));

        let branch = tokio
            .block_on(accept_session(&fixture.data_dir, "session-1"))
            .unwrap();
        let accepted_export = tokio
            .block_on(export_evidence_report_for_session(
                &fixture.data_dir,
                "session-1",
            ))
            .unwrap();
        assert_eq!(accepted_export.report.accepted_branch.as_deref(), Some(branch.as_str()));
        let accepted_json =
            std::fs::read_to_string(&accepted_export.json_artifact.path).unwrap();
        let accepted_value: Value = serde_json::from_str(&accepted_json).unwrap();
        assert_eq!(accepted_value["acceptedBranch"].as_str(), Some(branch.as_str()));
        assert_eq!(
            load_artifacts(&fixture.data_dir, "session-1")
                .unwrap()
                .into_iter()
                .filter(|artifact| artifact.kind == "report")
                .count(),
            2
        );

        run(&fixture.repository, &["branch", "-D", &branch]);
        fixture.cleanup();
    }

    #[test]
    fn report_fixtures_reject_artifacts_outside_session_storage() {
        let fixture = SessionHarnessFixture::new();
        std::fs::write(fixture.worktree.join("source.txt"), "reportable content").unwrap();
        verify_fixture_change(
            &fixture,
            Arc::new(FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
            ])),
        )
        .unwrap();
        let outside = fixture.root.join("outside.log");
        std::fs::write(&outside, "outside").unwrap();
        let outside_text = outside.to_string_lossy().into_owned();
        super::super::database(&fixture.data_dir)
            .unwrap()
            .execute(
                "INSERT INTO session_artifacts(id, session_id, kind, path, label, created_at)
                 VALUES ('outside-artifact', 'session-1', 'commandLog', ?1, 'outside', 1)",
                [outside_text],
            )
            .unwrap();
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let error = match tokio.block_on(export_evidence_report_for_session(
            &fixture.data_dir,
            "session-1",
        )) {
            Ok(_) => panic!("report export should reject unconfined artifacts"),
            Err(error) => error,
        };

        assert!(error.contains("outside app-managed session storage"));
        assert!(load_artifacts(&fixture.data_dir, "session-1")
            .unwrap()
            .into_iter()
            .all(|artifact| artifact.kind != "report"));
        fixture.cleanup();
    }

    #[test]
    fn lifecycle_fixtures_acceptance_failures_remain_recoverable() {
        for scenario in ["branch-collision", "commit-failure", "removal-failure"] {
            let fixture = SessionHarnessFixture::new();
            std::fs::write(fixture.worktree.join("source.txt"), "verified change").unwrap();
            verify_fixture_change(
                &fixture,
                Arc::new(FakeProcessExecutor::scripted(vec![
                    passing_process(),
                    passing_process(),
                ])),
            )
            .unwrap();
            let branch = branch_name("Change source", "session-1");
            if scenario == "branch-collision" {
                run(&fixture.repository, &["branch", &branch, "HEAD"]);
            } else if scenario == "commit-failure" {
                super::super::database(&fixture.data_dir)
                    .unwrap()
                    .execute(
                        "UPDATE change_sessions SET base_sha = 'missing-base' WHERE id = 'session-1'",
                        [],
                    )
                    .unwrap();
            }
            let tokio = tokio::runtime::Runtime::new().unwrap();
            let result = tokio.block_on(accept_session_inner(
                &fixture.data_dir,
                "session-1",
                scenario == "removal-failure",
            ));
            assert!(result.is_err());
            let session = load_session_row(&fixture.data_dir, "session-1")
                .unwrap()
                .unwrap();
            assert_eq!(session.status, "verified");
            assert!(fixture.worktree.exists());
            if scenario == "branch-collision" {
                run(&fixture.repository, &["branch", "-D", &branch]);
            } else {
                let branch_check = StdCommand::new("git")
                    .args([
                        "show-ref",
                        "--verify",
                        "--quiet",
                        &format!("refs/heads/{branch}"),
                    ])
                    .current_dir(&fixture.repository)
                    .output()
                    .unwrap();
                assert!(!branch_check.status.success());
            }
            fixture.cleanup();
        }
    }

    #[test]
    fn lifecycle_fixtures_discard_is_scoped_and_idempotent() {
        for status in ["needs_input", "failed", "cancelled", "verified"] {
            let fixture = SessionHarnessFixture::new();
            super::super::database(&fixture.data_dir)
                .unwrap()
                .execute(
                    "UPDATE change_sessions SET status = ?1 WHERE id = 'session-1'",
                    [status],
                )
                .unwrap();
            let tokio = tokio::runtime::Runtime::new().unwrap();
            tokio
                .block_on(discard_session(&fixture.data_dir, "session-1"))
                .unwrap();
            tokio
                .block_on(discard_session(&fixture.data_dir, "session-1"))
                .unwrap();
            assert_eq!(
                load_session_row(&fixture.data_dir, "session-1")
                    .unwrap()
                    .unwrap()
                    .status,
                "discarded"
            );
            assert!(!fixture.worktree.exists());
            assert!(fixture.repository.exists());
            fixture.cleanup();
        }
    }

    #[test]
    fn browser_fixtures_manifest_blocks_unsafe_server_configuration() {
        let base = AppServerConfig {
            command: "bun".to_string(),
            args: vec!["run".to_string(), "dev".to_string()],
            timeout_ms: 30_000,
            health_url: "http://127.0.0.1:3000/health".to_string(),
            health_timeout_ms: 5_000,
            browser_base_url: "http://127.0.0.1:3000".to_string(),
            env: Some(BTreeMap::from([(
                "NODE_ENV".to_string(),
                "test".to_string(),
            )])),
        };
        let mut manifest = default_manifest(&BTreeMap::from([(
            "test".to_string(),
            "bun test".to_string(),
        )]));
        manifest.app_server = Some(base.clone());
        validate_manifest(&manifest).unwrap();

        for invalid in [
            AppServerConfig {
                command: "./server".to_string(),
                ..base.clone()
            },
            AppServerConfig {
                browser_base_url: "https://example.com".to_string(),
                ..base.clone()
            },
            AppServerConfig {
                browser_base_url: "http://localhost:3001".to_string(),
                ..base.clone()
            },
            AppServerConfig {
                env: Some(BTreeMap::from([(
                    "invalid-key".to_string(),
                    "value".to_string(),
                )])),
                ..base.clone()
            },
        ] {
            manifest.app_server = Some(invalid);
            assert!(validate_manifest(&manifest).is_err());
        }

        manifest.app_server = None;
        validate_manifest(&manifest).unwrap();
    }

    #[test]
    fn browser_fixtures_fake_agent_exercises_every_browser_tool() {
        let tools = [
            "browser_open",
            "browser_inspect",
            "browser_click",
            "browser_fill",
            "browser_press",
            "browser_wait",
            "browser_screenshot",
            "browser_errors",
        ];
        let engine = FakeImplementationEngine::scripted(
            tools
                .iter()
                .map(|tool| EngineStep::DynamicTool {
                    result: if *tool == "browser_screenshot" {
                        json!({
                            "success": true,
                            "contentItems": [
                                { "type": "inputText", "text": "captured" },
                                { "type": "inputImage", "imageUrl": "data:image/png;base64,aW1hZ2U=" }
                            ]
                        })
                    } else {
                        json!({
                            "success": true,
                            "contentItems": [{ "type": "inputText", "text": format!("{tool} complete") }]
                        })
                    },
                })
                .collect(),
        );
        let tokio = tokio::runtime::Runtime::new().unwrap();
        for tool in tools {
            let result = tokio
                .block_on(engine.dynamic_tool_call(json!({
                    "threadId": "thread-browser",
                    "tool": tool,
                    "arguments": {}
                })))
                .unwrap();
            assert_eq!(result["success"], true);
            if tool == "browser_screenshot" {
                assert_eq!(result["contentItems"][1]["type"], "inputImage");
            }
        }
        assert_eq!(
            engine
                .requests()
                .iter()
                .filter(|request| matches!(request, EngineRequest::DynamicTool(_)))
                .count(),
            tools.len()
        );
        let declared = browser_tool_specs()
            .into_iter()
            .filter_map(|tool| tool["name"].as_str().map(str::to_string))
            .collect::<Vec<_>>();
        assert_eq!(declared, tools);
    }

    #[test]
    fn browser_fixtures_authoritative_gate_always_cleans_application_server() {
        let cases = [
            ("passing", passing_process()),
            (
                "pageerror: fixture exploded",
                failing_process("pageerror: fixture exploded"),
            ),
            (
                "console.error: fixture exploded",
                failing_process("console.error: fixture exploded"),
            ),
            (
                "external navigation",
                failing_process("external navigation: https://example.com"),
            ),
            (
                "gate timeout",
                ProcessOutput {
                    exit_code: None,
                    output: "gate timed out".to_string(),
                    timed_out: true,
                    cancelled: false,
                },
            ),
        ];
        for (label, gate_output) in cases {
            let fixture = SessionHarnessFixture::new();
            let processes = FakeProcessExecutor::scripted(vec![
                passing_process(),
                passing_process(),
                passing_process(),
                gate_output,
                passing_process(),
                passing_process(),
            ]);
            let runtime = SessionRuntime::harness(
                fixture.data_dir.clone(),
                Arc::new(FakeImplementationEngine::default()),
                Arc::new(processes.clone()),
            );
            let session = load_session_row(&fixture.data_dir, "session-1")
                .unwrap()
                .unwrap();
            let server = AppServerConfig {
                command: "bun".to_string(),
                args: vec!["run".to_string(), "fixture-server".to_string()],
                timeout_ms: 30_000,
                health_url: "http://127.0.0.1:3000/health".to_string(),
                health_timeout_ms: 5_000,
                browser_base_url: "http://127.0.0.1:3000".to_string(),
                env: None,
            };
            let gate = VerificationCommand {
                command: "bun".to_string(),
                args: vec!["run".to_string(), "test:e2e".to_string()],
                timeout_ms: 30_000,
                required: true,
                network: "disabled".to_string(),
                env: None,
            };
            let tokio = tokio::runtime::Runtime::new().unwrap();
            let result = tokio
                .block_on(run_app_gate(
                    &runtime,
                    &session,
                    &server,
                    "e2e",
                    &gate,
                    Duration::from_secs(30),
                ))
                .unwrap();
            if label == "passing" {
                assert_eq!(result.exit_code, Some(0));
            } else {
                assert!(
                    result.exit_code != Some(0) || result.timed_out,
                    "{label} unexpectedly passed"
                );
            }
            let requests = processes.requests();
            assert!(requests.iter().any(|(purpose, _, args)| {
                purpose == "application-server-cleanup"
                    && args.first().is_some_and(|value| value == "rm")
            }));
            assert!(runtime
                .process_registry
                .records("session-1")
                .unwrap()
                .is_empty());
            fixture.cleanup();
        }
    }

    #[test]
    fn browser_fixtures_server_timeout_still_cleans_container() {
        let fixture = SessionHarnessFixture::new();
        let processes = FakeProcessExecutor::scripted(vec![
            passing_process(),
            failing_process("health unavailable"),
            passing_process(),
            passing_process(),
        ]);
        let runtime = SessionRuntime::harness(
            fixture.data_dir.clone(),
            Arc::new(FakeImplementationEngine::default()),
            Arc::new(processes.clone()),
        );
        let session = load_session_row(&fixture.data_dir, "session-1")
            .unwrap()
            .unwrap();
        let server = AppServerConfig {
            command: "bun".to_string(),
            args: vec!["run".to_string(), "fixture-server".to_string()],
            timeout_ms: 30_000,
            health_url: "http://127.0.0.1:3000/health".to_string(),
            health_timeout_ms: 0,
            browser_base_url: "http://127.0.0.1:3000".to_string(),
            env: None,
        };
        let gate = VerificationCommand {
            command: "bun".to_string(),
            args: vec!["run".to_string(), "test:e2e".to_string()],
            timeout_ms: 30_000,
            required: true,
            network: "disabled".to_string(),
            env: None,
        };
        let tokio = tokio::runtime::Runtime::new().unwrap();
        let result = tokio
            .block_on(run_app_gate(
                &runtime,
                &session,
                &server,
                "e2e",
                &gate,
                Duration::from_secs(30),
            ))
            .unwrap();
        assert_eq!(result.exit_code, Some(1));
        assert!(processes
            .requests()
            .iter()
            .any(|(purpose, _, _)| purpose == "application-server-cleanup"));
        fixture.cleanup();
    }

    #[test]
    fn product_fixtures_approval_methods_decisions_and_redaction_are_strict() {
        for method in [
            "item/commandExecution/requestApproval",
            "item/fileChange/requestApproval",
            "item/networkAccess/requestApproval",
            "item/externalPath/requestApproval",
            "item/secretAccess/requestApproval",
            "item/privilegedOperation/requestApproval",
        ] {
            for decision in ["accept", "acceptForSession", "decline"] {
                assert_eq!(
                    approval_result(method, decision).unwrap(),
                    json!({ "decision": decision })
                );
            }
        }
        assert!(approval_result("unsupported/requestApproval", "accept").is_err());
        assert!(approval_result("item/commandExecution/requestApproval", "always").is_err());

        let token = format!("ghp_{}", "A".repeat(36));
        let private_key = "-----BEGIN OPENSSH PRIVATE KEY-----";
        let entropy = "N7vQ2xL9pR4mT8kW3zC6sH1jF5uB0aYd";
        for secret in [&token, private_key, entropy] {
            let redacted = redact_sensitive_text(&format!("approval detail: {secret}"));
            assert_eq!(redacted, "[redacted sensitive output]");
            assert!(!redacted.contains(secret));
        }
    }

    #[test]
    fn product_fixtures_conversation_restarts_in_order_without_duplicates() {
        let fixture = SessionHarnessFixture::new();
        append_event(&fixture.data_dir, "session-1", "user", "Change source").unwrap();
        append_event(
            &fixture.data_dir,
            "session-1",
            "agent",
            "Implementation complete",
        )
        .unwrap();
        append_event(
            &fixture.data_dir,
            "session-1",
            "repair",
            "Verification failed against digest abc",
        )
        .unwrap();
        let notification = json!({
            "method": "item/completed",
            "params": { "threadId": "thread-1", "message": "Done" }
        });
        let first_key = codex_notification_key("thread-1", &notification);
        let second_key = codex_notification_key("thread-1", &notification);
        assert_eq!(first_key, second_key);
        let connection = super::super::database(&fixture.data_dir).unwrap();
        assert_eq!(
            connection
                .execute(
                    "INSERT OR IGNORE INTO session_notification_keys
                     (notification_key, session_id, created_at) VALUES (?1, 'session-1', 1)",
                    [&first_key],
                )
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .execute(
                    "INSERT OR IGNORE INTO session_notification_keys
                     (notification_key, session_id, created_at) VALUES (?1, 'session-1', 2)",
                    [&second_key],
                )
                .unwrap(),
            0
        );
        drop(connection);

        let before_restart = load_events(&fixture.data_dir, "session-1").unwrap();
        migrate(&fixture.data_dir).unwrap();
        let after_restart = load_events(&fixture.data_dir, "session-1").unwrap();
        assert_eq!(
            before_restart
                .iter()
                .map(|event| (&event.kind, &event.message))
                .collect::<Vec<_>>(),
            after_restart
                .iter()
                .map(|event| (&event.kind, &event.message))
                .collect::<Vec<_>>()
        );
        assert!(after_restart.iter().any(|event| event.kind == "repair"));
        fixture.cleanup();
    }

    #[test]
    fn product_fixtures_artifacts_are_confined_and_missing_files_are_clear() {
        let fixture = SessionHarnessFixture::new();
        let artifacts = artifact_directory(&fixture.data_dir, "session-1");
        std::fs::create_dir_all(&artifacts).unwrap();
        let text = artifacts.join("assertions.txt");
        std::fs::write(&text, "all assertions passed").unwrap();
        insert_artifact(
            &fixture.data_dir,
            "session-1",
            "assertions",
            &text,
            "Assertions",
        )
        .unwrap();
        assert!(insert_artifact(
            &fixture.data_dir,
            "session-1",
            "report",
            &fixture.root.join("outside.txt"),
            "Outside",
        )
        .unwrap_err()
        .contains("outside app-managed"));
        let missing = artifacts.join("missing.txt");
        insert_artifact(
            &fixture.data_dir,
            "session-1",
            "report",
            &missing,
            "Missing",
        )
        .unwrap();
        assert!(!missing.exists());
        let artifacts = load_artifacts(&fixture.data_dir, "session-1").unwrap();
        assert_eq!(artifacts.len(), 2);
        fixture.cleanup();
    }

    #[test]
    fn product_fixtures_declined_fake_approval_does_not_edit_worktree() {
        let fixture = SessionHarnessFixture::new();
        let before = std::fs::read(fixture.worktree.join("source.txt")).unwrap();
        let engine = FakeImplementationEngine::scripted(vec![EngineStep::Approval]);
        let tokio = tokio::runtime::Runtime::new().unwrap();
        tokio
            .block_on(engine.approval_response(
                json!(1),
                approval_result("item/privilegedOperation/requestApproval", "decline").unwrap(),
            ))
            .unwrap();
        assert_eq!(
            std::fs::read(fixture.worktree.join("source.txt")).unwrap(),
            before
        );
        fixture.cleanup();
    }

    fn fixture_repository() -> PathBuf {
        let repository = temporary_directory("repository");
        std::fs::create_dir_all(&repository).unwrap();
        std::fs::write(
            repository.join("package.json"),
            r#"{"scripts":{"test:unit":"bun test"}}"#,
        )
        .unwrap();
        std::fs::write(repository.join("bun.lock"), "fixture lock").unwrap();
        std::fs::write(repository.join("source.txt"), "committed").unwrap();
        run(&repository, &["init"]);
        run(&repository, &["config", "user.name", "Code Test"]);
        run(
            &repository,
            &["config", "user.email", "code-test@example.com"],
        );
        run(&repository, &["add", "."]);
        run(&repository, &["commit", "-m", "fixture"]);
        repository
    }

    #[test]
    fn target_fixtures_discover_workspace_apps_and_packages() {
        let repository = temporary_directory("target-discovery");
        std::fs::create_dir_all(repository.join("apps/trading")).unwrap();
        std::fs::create_dir_all(repository.join("packages/ui")).unwrap();
        std::fs::write(
            repository.join("package.json"),
            r#"{"private":true,"workspaces":["apps/*","packages/*"]}"#,
        )
        .unwrap();
        std::fs::write(repository.join("bun.lock"), "fixture lock").unwrap();
        std::fs::write(
            repository.join("apps/trading/package.json"),
            r#"{"name":"trading","scripts":{"dev":"vite dev","build":"vite build","typecheck":"tsc --noEmit"}}"#,
        )
        .unwrap();
        std::fs::write(repository.join("apps/trading/vite.config.ts"), "export default {}")
            .unwrap();
        std::fs::write(
            repository.join("packages/ui/package.json"),
            r#"{"name":"@workspace/ui","scripts":{"typecheck":"tsc --noEmit"}}"#,
        )
        .unwrap();
        run(&repository, &["init"]);
        run(&repository, &["config", "user.name", "Code Test"]);
        run(
            &repository,
            &["config", "user.email", "code-test@example.com"],
        );
        run(&repository, &["add", "."]);
        run(&repository, &["commit", "-m", "fixture"]);

        let row = RepositoryRow {
            id: "repo-1".to_string(),
            path: repository.clone(),
            name: "target-discovery".to_string(),
            head_sha: "head".to_string(),
            branch: Some("main".to_string()),
            dirty: false,
            compatible: true,
            compatibility_detail: None,
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let targets = runtime.block_on(discover_repository_targets(&row)).unwrap();

        assert!(targets
            .iter()
            .any(|target| target.path == "apps/trading" && target.kind == "app"));
        assert!(targets
            .iter()
            .any(|target| target.path == "packages/ui" && target.kind == "package"));
        assert!(targets.iter().all(|target| target.path != "."));
        assert!(targets.iter().all(|target| target.source == "detected"));

        std::fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn target_fixtures_persist_targets_and_reject_duplicate_paths() {
        let data_dir = temporary_directory("target-storage");
        std::fs::create_dir_all(&data_dir).unwrap();
        migrate(&data_dir).unwrap();
        let timestamp = now_ms();
        let row = RepositoryTargetRow {
            id: "target-1".to_string(),
            repository_id: "repo-1".to_string(),
            name: "trading".to_string(),
            path: "apps/trading".to_string(),
            kind: "app".to_string(),
            package_name: Some("trading".to_string()),
            scripts: BTreeMap::from([("build".to_string(), "vite build".to_string())]),
            source: "detected".to_string(),
            selected: true,
            created_at: timestamp,
            updated_at: timestamp,
        };

        replace_targets(&data_dir, "repo-1", std::slice::from_ref(&row)).unwrap();
        let stored = load_target_rows(&data_dir, "repo-1").unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].scripts.get("build").map(String::as_str), Some("vite build"));

        let mut duplicate = row.clone();
        duplicate.id = "target-2".to_string();
        assert!(replace_targets(&data_dir, "repo-1", &[row, duplicate])
            .unwrap_err()
            .contains("UNIQUE"));

        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn target_fixtures_normalize_legacy_manual_kind() {
        let data_dir = temporary_directory("target-legacy-kind");
        std::fs::create_dir_all(&data_dir).unwrap();
        migrate(&data_dir).unwrap();
        let timestamp = now_ms();
        let row = RepositoryTargetRow {
            id: "target-legacy".to_string(),
            repository_id: "repo-1".to_string(),
            name: "docs".to_string(),
            path: "docs".to_string(),
            kind: "manual".to_string(),
            package_name: None,
            scripts: BTreeMap::new(),
            source: "manual".to_string(),
            selected: true,
            created_at: timestamp,
            updated_at: timestamp,
        };

        replace_targets(&data_dir, "repo-1", std::slice::from_ref(&row)).unwrap();
        migrate(&data_dir).unwrap();
        let stored = load_target_rows(&data_dir, "repo-1").unwrap();
        assert_eq!(stored[0].kind, "other");
        assert_eq!(repository_target_view(row).kind, "other");

        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn target_fixtures_repository_mapping_modes_are_explicit() {
        assert_eq!(
            RepositoryMappingMode::parse(None).unwrap(),
            RepositoryMappingMode::Code
        );
        assert_eq!(
            RepositoryMappingMode::parse(Some("code")).unwrap(),
            RepositoryMappingMode::Code
        );
        assert_eq!(
            RepositoryMappingMode::parse(Some("claude")).unwrap(),
            RepositoryMappingMode::Claude
        );
        assert_eq!(
            RepositoryMappingMode::parse(Some("cloudApi")).unwrap(),
            RepositoryMappingMode::CloudApi
        );
        assert!(RepositoryMappingMode::parse(Some("manual")).is_err());
        assert!(repository_mapping_detail(RepositoryMappingMode::Claude).contains("planned"));
        assert!(repository_mapping_detail(RepositoryMappingMode::CloudApi).contains("planned"));
    }

    #[test]
    fn target_fixtures_parse_strict_ai_repository_map() {
        let repository = RepositoryRow {
            id: "repo-1".to_string(),
            path: PathBuf::from("/repo"),
            name: "repo".to_string(),
            head_sha: "head".to_string(),
            branch: Some("main".to_string()),
            dirty: false,
            compatible: true,
            compatibility_detail: None,
            created_at: now_ms(),
            updated_at: now_ms(),
        };

        let targets = parse_ai_repository_map_document(
            &repository,
            RepositoryMappingMode::Code,
            r#"{
              "version": 1,
              "mode": "code",
              "targets": [
                {
                  "name": "trading",
                  "path": "apps/trading",
                  "kind": "app",
                  "packageName": "trading",
                  "scripts": { "dev": "vite dev" }
                }
              ]
            }"#,
        )
        .unwrap();

        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].path, "apps/trading");
        assert_eq!(targets[0].kind, "app");
        assert_eq!(targets[0].source, "codex");
        assert!(targets[0].selected);
        assert!(parse_ai_repository_map_document(
            &repository,
            RepositoryMappingMode::Claude,
            r#"{"version":1,"mode":"code","targets":[{"name":"x","path":"apps/x","kind":"app"}]}"#,
        )
        .is_err());
        assert!(parse_ai_repository_map_document(
            &repository,
            RepositoryMappingMode::Code,
            r#"{"version":1,"mode":"code","targets":[{"name":"x","path":"../x","kind":"app"}]}"#,
        )
        .is_err());
        assert!(parse_ai_repository_map_document(
            &repository,
            RepositoryMappingMode::Code,
            r#"{"version":1,"mode":"code","targets":[{"name":"x","path":"apps/x","kind":"app","extra":true}]}"#,
        )
        .is_err());
    }

    #[test]
    fn target_fixtures_code_mapping_uses_ai_output_from_temp_workspace() {
        let repository_path = temporary_directory("target-code-map-repo");
        let data_dir = temporary_directory("target-code-map-data");
        std::fs::create_dir_all(repository_path.join("apps/trading")).unwrap();
        std::fs::create_dir_all(&data_dir).unwrap();
        std::fs::write(
            repository_path.join("apps/trading/package.json"),
            r#"{"name":"trading","scripts":{"dev":"vite dev","test:e2e":"playwright test"}}"#,
        )
        .unwrap();
        run(&repository_path, &["init"]);
        run(&repository_path, &["add", "."]);
        run(&repository_path, &["commit", "-m", "fixture"]);
        let head = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(git_text(&repository_path, &["rev-parse", "HEAD"]))
            .unwrap();
        let repository = RepositoryRow {
            id: "repo-1".to_string(),
            path: repository_path.clone(),
            name: "repo".to_string(),
            head_sha: head.trim().to_string(),
            branch: Some("main".to_string()),
            dirty: false,
            compatible: true,
            compatibility_detail: None,
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let engine = FakeImplementationEngine::scripted(vec![
            EngineStep::StartThread {
                thread_id: "mapping-thread".to_string(),
            },
            EngineStep::StartTurn {
                thread_id: "mapping-thread".to_string(),
                turn_id: "mapping-turn".to_string(),
                edits: vec![FileEdit {
                    path: PathBuf::from(REPOSITORY_MAPPING_OUTPUT_FILE),
                    contents: br#"{
                      "version": 1,
                      "mode": "code",
                      "targets": [
                        {
                          "name": "Trading",
                          "path": "apps/trading",
                          "kind": "app",
                          "packageName": "trading",
                          "scripts": { "dev": "vite dev", "test:e2e": "playwright test" }
                        }
                      ]
                    }"#
                    .to_vec(),
                }],
            },
            EngineStep::TurnStatus {
                thread_id: "mapping-thread".to_string(),
                turn_id: "mapping-turn".to_string(),
                status: EngineTurnStatus::Completed,
            },
        ]);

        let mapping = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(map_repository_targets(
                &data_dir,
                Arc::new(engine.clone()),
                &repository,
                &[],
                RepositoryMappingMode::Code,
            ))
            .unwrap();

        assert!(mapping.assisted);
        assert_eq!(mapping.targets.len(), 1);
        assert_eq!(mapping.targets[0].name, "Trading");
        assert_eq!(mapping.targets[0].source, "codex");
        let requests = engine.requests();
        match &requests[0] {
            EngineRequest::StartThread { cwd, tools } => {
                assert!(cwd.starts_with(&data_dir));
                assert!(!cwd.starts_with(&repository_path));
                assert!(tools.is_empty());
            }
            request => panic!("expected start-thread request, got {request:?}"),
        }
        match &requests[1] {
            EngineRequest::StartTurn { cwd, prompt, .. } => {
                assert!(cwd.starts_with(&data_dir));
                assert!(prompt.contains(REPOSITORY_MAPPING_SUMMARY_FILE));
                assert!(prompt.contains(REPOSITORY_MAPPING_OUTPUT_FILE));
            }
            request => panic!("expected start-turn request, got {request:?}"),
        }

        std::fs::remove_dir_all(repository_path).unwrap();
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn target_fixtures_code_mapping_falls_back_to_deterministic_detection() {
        let repository_path = temporary_directory("target-code-map-fallback-repo");
        let data_dir = temporary_directory("target-code-map-fallback-data");
        std::fs::create_dir_all(repository_path.join("packages/ui")).unwrap();
        std::fs::create_dir_all(&data_dir).unwrap();
        std::fs::write(
            repository_path.join("packages/ui/package.json"),
            r#"{"name":"@repo/ui","scripts":{"test":"vitest run"}}"#,
        )
        .unwrap();
        run(&repository_path, &["init"]);
        run(&repository_path, &["add", "."]);
        run(&repository_path, &["commit", "-m", "fixture"]);
        let head = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(git_text(&repository_path, &["rev-parse", "HEAD"]))
            .unwrap();
        let repository = RepositoryRow {
            id: "repo-1".to_string(),
            path: repository_path.clone(),
            name: "repo".to_string(),
            head_sha: head.trim().to_string(),
            branch: Some("main".to_string()),
            dirty: false,
            compatible: true,
            compatibility_detail: None,
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let engine = FakeImplementationEngine::scripted(vec![EngineStep::Failure(
            "Codex unavailable".to_string(),
        )]);

        let mapping = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(map_repository_targets(
                &data_dir,
                Arc::new(engine),
                &repository,
                &[],
                RepositoryMappingMode::Code,
            ))
            .unwrap();

        assert!(!mapping.assisted);
        assert_eq!(mapping.targets[0].path, "packages/ui");
        assert_eq!(mapping.targets[0].source, "detected");
        assert!(mapping
            .assistance_detail
            .as_deref()
            .is_some_and(|detail| detail.contains("deterministic")));

        std::fs::remove_dir_all(repository_path).unwrap();
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn target_fixtures_read_flowguard_overview_and_timeline() {
        let repository = temporary_directory("target-flowguard");
        let data_dir = temporary_directory("target-flowguard-data");
        std::fs::create_dir_all(repository.join(".flowguard/flows")).unwrap();
        std::fs::create_dir_all(repository.join(".flowguard/proposals")).unwrap();
        std::fs::create_dir_all(repository.join(".flowguard/coverage")).unwrap();
        std::fs::create_dir_all(repository.join("apps/trading/src")).unwrap();
        std::fs::create_dir_all(&data_dir).unwrap();
        migrate(&data_dir).unwrap();
        std::fs::write(
            repository.join(".flowguard/config.json"),
            r#"{"version":1,"flowDirectory":"flows","proposalDirectory":"proposals"}"#,
        )
        .unwrap();
        std::fs::write(
            repository.join(".flowguard/flows/login.json"),
            r#"{"version":1,"id":"login","name":"Login","goal":"Sign in","entryStateId":"start","states":[{"id":"start","name":"Start","kind":"page","route":"/login","sources":["apps/trading/src/Login.tsx"]},{"id":"done","name":"Done","kind":"page"}],"transitions":[{"id":"submit","from":"start","to":"done","actor":"user","action":"Submit","sources":["apps/trading/src/Login.tsx"]}]}"#,
        )
        .unwrap();
        std::fs::write(
            repository.join(".flowguard/coverage/login-e2e.json"),
            r#"{"version":1,"id":"login-e2e","flowId":"login","title":"Login happy path","description":"User can sign in with valid credentials.","gate":"e2e","covers":[{"kind":"state","id":"start","behavior":"Login form is visible.","required":true},{"kind":"transition","id":"submit","behavior":"Valid credentials submit successfully.","required":true}],"evidence":[{"kind":"screenshot","label":"Signed-in dashboard","required":true}]}"#,
        )
        .unwrap();
        std::fs::write(
            repository.join(".flowguard/coverage/broken.json"),
            r#"{"version":1,"id":"broken"}"#,
        )
        .unwrap();
        std::fs::write(
            repository.join("apps/trading/src/Login.tsx"),
            "export default {}",
        )
        .unwrap();
        run(&repository, &["init"]);
        run(&repository, &["config", "user.name", "Code Test"]);
        run(
            &repository,
            &["config", "user.email", "code-test@example.com"],
        );
        run(&repository, &["add", "."]);
        run(&repository, &["commit", "-m", "add login flow"]);
        std::fs::write(
            repository.join(".flowguard/proposals/password-reset.json"),
            r#"{"version":1,"id":"password-reset","flowId":"login","baseDigest":"sha256:fixture","createdAt":"2026-06-24T00:00:00.000Z","producer":{"kind":"test","label":"Test"},"summary":"Add reset","confidence":"high","operations":[]}"#,
        )
        .unwrap();
        std::fs::write(
            repository.join(".flowguard/flows/login.json"),
            r#"{"version":1,"id":"login","name":"Login","goal":"Sign in safely","entryStateId":"start","states":[{"id":"start","name":"Start","kind":"page","route":"/login","sources":["apps/trading/src/Login.tsx"]},{"id":"done","name":"Done","kind":"page"}],"transitions":[{"id":"submit","from":"start","to":"done","actor":"user","action":"Submit valid credentials","sources":["apps/trading/src/Login.tsx"]}]}"#,
        )
        .unwrap();
        run(&repository, &["add", "."]);
        run(&repository, &["commit", "-m", "update login flow"]);

        let row = RepositoryRow {
            id: "repo-1".to_string(),
            path: repository.clone(),
            name: "target-flowguard".to_string(),
            head_sha: "head".to_string(),
            branch: Some("main".to_string()),
            dirty: false,
            compatible: true,
            compatibility_detail: None,
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let target = RepositoryTargetRow {
            id: "target-trading".to_string(),
            repository_id: "repo-1".to_string(),
            name: "trading".to_string(),
            path: "apps/trading".to_string(),
            kind: "app".to_string(),
            package_name: Some("trading".to_string()),
            scripts: BTreeMap::new(),
            source: "detected".to_string(),
            selected: true,
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let artifact_root = artifact_directory(&data_dir, "session-covered");
        std::fs::create_dir_all(&artifact_root).unwrap();
        let screenshot = artifact_root.join("login.png");
        std::fs::write(&screenshot, "png").unwrap();
        let evidence_id = "artifact-login-screenshot";
        let connection = super::super::database(&data_dir).unwrap();
        connection
            .execute(
                "INSERT INTO change_sessions
                 (id, repository_id, target_id, request, base_sha, worktree_path, status, attempt,
                  verification_digest, created_at, updated_at)
                 VALUES ('session-covered', 'repo-1', 'target-trading', 'Cover login', 'head',
                  ?1, 'verified', 1, 'digest-current', 1, 1)",
                params![repository.to_string_lossy()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO change_sessions
                 (id, repository_id, target_id, request, base_sha, worktree_path, status, attempt,
                  verification_digest, created_at, updated_at)
                 VALUES ('session-stale', 'repo-1', 'target-trading', 'Old failed login', 'head',
                  ?1, 'implementing', 1, NULL, 1, 1)",
                params![repository.to_string_lossy()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO session_artifacts(id, session_id, kind, path, label, created_at)
                 VALUES (?1, 'session-covered', 'screenshot', ?2, 'Signed-in dashboard', 1)",
                params![evidence_id, screenshot.to_string_lossy()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO session_flow_coverage
                 (id, session_id, attempt, flow_id, scenario_id, target_kind, target_id, status,
                  evidence_artifact_ids_json, worktree_digest, verified_at)
                 VALUES ('coverage-state', 'session-covered', 1, 'login', 'login-e2e', 'state',
                  'start', 'passed', ?1, 'digest-current', 2)",
                params![serde_json::to_string(&vec![evidence_id]).unwrap()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO session_flow_coverage
                 (id, session_id, attempt, flow_id, scenario_id, target_kind, target_id, status,
                  evidence_artifact_ids_json, worktree_digest, verified_at)
                 VALUES ('coverage-transition', 'session-covered', 1, 'login', 'login-e2e',
                  'transition', 'submit', 'passed', ?1, 'digest-current', 2)",
                params![serde_json::to_string(&vec![evidence_id]).unwrap()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO session_flow_coverage
                 (id, session_id, attempt, flow_id, scenario_id, target_kind, target_id, status,
                  evidence_artifact_ids_json, worktree_digest, verified_at)
                 VALUES ('coverage-stale', 'session-stale', 1, 'login', 'login-e2e', 'state',
                  'done', 'passed', '[]', 'digest-old', 3)",
                [],
            )
            .unwrap();
        drop(connection);
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let overview = runtime
            .block_on(target_flow_overview(&data_dir, &row, target))
            .unwrap();

        assert_eq!(overview.snapshot.flows.len(), 1);
        assert_eq!(overview.snapshot.flows[0].flow_id, "login");
        assert_eq!(overview.snapshot.flows[0].graph.nodes.len(), 2);
        assert_eq!(overview.snapshot.flows[0].coverage_scenarios.len(), 1);
        assert_eq!(
            overview.snapshot.flows[0].coverage_scenarios[0].latest_session.as_ref().map(
                |session| session.session_id.as_str()
            ),
            Some("session-covered")
        );
        assert_eq!(
            overview.snapshot.flows[0].coverage_scenarios[0]
                .evidence
                .first()
                .map(|artifact| artifact.artifact_id.as_str()),
            Some(evidence_id)
        );
        assert_eq!(overview.snapshot.flows[0].graph.nodes[0].coverage.status, "covered");
        assert_eq!(overview.snapshot.flows[0].graph.edges[0].coverage.status, "covered");
        assert_eq!(overview.snapshot.proposals.len(), 1);
        assert!(overview
            .snapshot
            .invalid_documents
            .iter()
            .any(|document| document.kind == "coverage"
                && document.relative_path.ends_with("broken.json")));
        assert!(overview
            .timeline
            .iter()
            .any(|item| item.change_type == "added"));
        assert!(overview
            .timeline
            .iter()
            .any(|item| item.change_type == "modified"));

        std::fs::remove_dir_all(repository).unwrap();
        std::fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn branch_names_are_local_and_bounded() {
        let name = branch_name(
            "Add verified local sessions with browser interaction and deterministic checks",
            "12345678-abcd",
        );
        assert_eq!(
            name,
            "code/add-verified-local-sessions-with-browser-12345678"
        );
    }

    #[test]
    fn manifest_rejects_networked_non_install_gates() {
        let mut manifest = default_manifest(&BTreeMap::from([(
            "test".to_string(),
            "bun test".to_string(),
        )]));
        manifest.gates.get_mut("unit").unwrap().network = "enabled".to_string();
        assert!(validate_manifest(&manifest)
            .unwrap_err()
            .contains("Only `bun install --frozen-lockfile`"));
    }

    #[test]
    fn manifest_accepts_one_localhost_application_origin() {
        let mut manifest = default_manifest(&BTreeMap::from([(
            "test:e2e".to_string(),
            "playwright test".to_string(),
        )]));
        manifest.app_server = Some(AppServerConfig {
            command: "bun".to_string(),
            args: vec!["run".to_string(), "dev".to_string()],
            timeout_ms: 300_000,
            health_url: "http://127.0.0.1:3000/health".to_string(),
            health_timeout_ms: 30_000,
            browser_base_url: "http://127.0.0.1:3000".to_string(),
            env: None,
        });

        validate_manifest(&manifest).unwrap();
    }

    #[test]
    fn dirty_source_changes_are_excluded_from_a_head_worktree() {
        let repository = fixture_repository();
        let worktree = temporary_directory("worktree");
        std::fs::write(repository.join("source.txt"), "dirty source").unwrap();

        run(
            &repository,
            &[
                "worktree",
                "add",
                "--detach",
                worktree.to_str().unwrap(),
                "HEAD",
            ],
        );

        assert_eq!(
            std::fs::read_to_string(worktree.join("source.txt")).unwrap(),
            "committed"
        );
        assert_eq!(
            std::fs::read_to_string(repository.join("source.txt")).unwrap(),
            "dirty source"
        );

        run(
            &repository,
            &["worktree", "remove", "--force", worktree.to_str().unwrap()],
        );
        std::fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn policy_fingerprint_changes_with_package_configuration() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let repository = fixture_repository();
        let proposal = runtime.block_on(propose_policy(&repository, None)).unwrap();
        let policy = PolicyRow {
            repository_id: "repo-1".to_string(),
            manifest: proposal.manifest,
            fingerprint: proposal.fingerprint,
            fingerprint_paths: proposal.fingerprint_paths,
            approved_at: now_ms(),
        };

        runtime
            .block_on(ensure_policy_valid(&repository, &policy))
            .unwrap();
        std::fs::write(
            repository.join("package.json"),
            r#"{"scripts":{"test:unit":"bun test","build":"vite build"}}"#,
        )
        .unwrap();
        runtime
            .block_on(ensure_policy_valid(&repository, &policy))
            .unwrap();
        run(&repository, &["add", "package.json"]);
        run(
            &repository,
            &["commit", "-m", "change package configuration"],
        );
        assert!(runtime
            .block_on(ensure_policy_valid(&repository, &policy))
            .unwrap_err()
            .contains("changed after policy approval"));

        std::fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn worktree_policy_fingerprint_detects_new_package_manifests() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let repository = fixture_repository();
        let proposal = runtime.block_on(propose_policy(&repository, None)).unwrap();

        std::fs::create_dir_all(repository.join("packages/new-package")).unwrap();
        std::fs::write(
            repository.join("packages/new-package/package.json"),
            r#"{"scripts":{"test:unit":"bun test"}}"#,
        )
        .unwrap();

        let paths = fingerprint_paths(&repository).unwrap();
        let fingerprint = runtime
            .block_on(fingerprint_files(&repository, &paths))
            .unwrap();
        assert_ne!(paths, proposal.fingerprint_paths);
        assert_ne!(fingerprint, proposal.fingerprint);

        std::fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn worktree_digest_changes_after_a_verified_edit() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let repository = fixture_repository();
        std::fs::write(repository.join("source.txt"), "first change").unwrap();
        let first = runtime.block_on(worktree_digest(&repository)).unwrap();
        std::fs::write(repository.join("source.txt"), "second change").unwrap();
        let second = runtime.block_on(worktree_digest(&repository)).unwrap();

        assert_ne!(first, second);
        std::fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn interrupted_change_sessions_become_recoverable() {
        let data_dir = temporary_directory("data");
        std::fs::create_dir_all(&data_dir).unwrap();
        migrate(&data_dir).unwrap();
        let connection = super::super::database(&data_dir).unwrap();
        connection
            .execute(
                "INSERT INTO repositories
                 (id, path, name, head_sha, dirty, compatible, created_at, updated_at)
                 VALUES ('repo-1', '/tmp/repo', 'repo', 'abc123', 0, 1, 1, 1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO change_sessions
                 (id, repository_id, request, base_sha, worktree_path, status, attempt,
                  created_at, updated_at)
                 VALUES ('session-1', 'repo-1', 'Change', 'abc123', '/tmp/worktree',
                         'implementing', 1, 1, 1)",
                [],
            )
            .unwrap();
        drop(connection);

        mark_interrupted(&data_dir).unwrap();
        let session = load_session_row(&data_dir, "session-1").unwrap().unwrap();

        assert_eq!(session.status, "needs_input");
        assert!(session
            .terminal_reason
            .unwrap()
            .contains("worktree is missing"));
        std::fs::remove_dir_all(data_dir).unwrap();
    }
}

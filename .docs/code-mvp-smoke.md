# Code MVP authenticated smoke report

Stage 8 is a manual authentication gate with automatic report qualification. From the repository
root, the runner invokes only the packaged Code executable at:

```text
apps/code-desktop/src-tauri/target/release/bundle/macos/Code.app/Contents/MacOS/code-desktop
```

The package must already exist and implement the native `--mvp-smoke` protocol. The runner uses the
existing Codex authentication under `HOME` or `CODEX_HOME`; it does not perform login:

```sh
bun run code:mvp:smoke
bun run code:mvp:smoke:verify
```

The default report directory is
`~/Library/Application Support/Code/mvp-smoke` on macOS. Override it with
`CODE_MVP_SMOKE_REPORT_DIR`; the directory must remain outside the source repository.

## Safety properties

- The declaration repository's Git-visible state, packaged executable bytes, and verifier image ID
  must be unchanged afterward.
- The fixed packaged executable is resolved as a regular, executable, non-symbolic file inside the
  repository. On macOS, the containing app must pass strict `codesign` verification and Gatekeeper
  assessment. There is no executable-path or argument-string override.
- The executable is started directly without a shell. Its environment is limited to `HOME`,
  `CODEX_HOME`, `PATH`, and platform essentials such as temporary-directory, locale, terminal, user,
  shell, timezone, and Windows process variables.
- Every scenario has a bounded timeout. Timeout or interruption sends `SIGTERM`, then `SIGKILL`
  after five seconds.
- The native cleanup call runs after success, scenario failure, timeout, or interruption.
- A report is promoted only after every scenario, artifact checksum, and cleanup result validates.
- Existing output is replaced only when it contains the runner's managed-directory marker.

The JSON report is metadata-only. Its strict schema has no fields for prompts, repository names,
paths, contents, command output, credentials, environment variables, or secret values. Evidence
files stay local beside the report; the report records only canonical IDs, byte counts, and SHA-256
checksums. The native process receives isolated result and artifact directories for each scenario.
Treat evidence files themselves as sensitive.

## Native protocol

The packaged application owns the authenticated Codex and browser integration. It must use the
production Codex path and production browser tools, not the fake engine. The runner calls it once
per scenario:

```text
apps/code-desktop/src-tauri/target/release/bundle/macos/Code.app/Contents/MacOS/code-desktop
  --mvp-smoke
  --protocol 1
  --scenario <scenario-id>
  --output <result-json>
  --artifact-directory <directory>
  --repository-root <clean-repository>
  --commit <full-sha>
  --verifier-image-reference <reference>
  --verifier-image-id <sha256:id>
```

The native command must write this narrow result shape. It must not add logs, prompts, repository
data, or other fields:

```json
{
  "id": "browser-e2e",
  "status": "passed",
  "terminalState": "accepted",
  "verifiedDigest": "<64 lowercase hex>",
  "acceptedDigest": "<same 64 lowercase hex>",
  "checks": [
    "accepted_digest_matches_verified",
    "authoritative_e2e",
    "persistent_thread",
    "screenshot_response",
    "source_state_unchanged"
  ],
  "artifacts": [{ "kind": "screenshot", "file": "screenshot.png" }]
}
```

Artifact paths are relative to `--artifact-directory`. The runner copies them to canonical,
non-descriptive names and computes checksums itself.

After all scenarios, or after the first failure, the runner calls:

```text
apps/code-desktop/src-tauri/target/release/bundle/macos/Code.app/Contents/MacOS/code-desktop
  --mvp-smoke
  --protocol 1
  --cleanup
  --output <cleanup-json>
  --repository-root <clean-repository>
```

The cleanup result must be:

```json
{
  "status": "passed",
  "remaining": {
    "worktrees": 0,
    "childProcesses": 0,
    "labeledContainers": 0,
    "temporaryBranches": 0
  }
}
```

Required scenario IDs, checks, terminal states, and artifact kinds are pinned in
`scripts/code-mvp-smoke/config.json`. The report structure is documented by
`scripts/code-mvp-smoke/report.schema.json`.

## Verification

`bun run code:mvp:smoke:verify` is noninteractive. It fails unless:

- `report.json.sha256` matches the report;
- the current checkout is clean and the report commit equals its Git `HEAD`;
- Docker resolves `code-agent-verifier:1` to the recorded image ID;
- the report is no more than seven days old and is not future-dated;
- all five scenarios contain exactly their required checks and valid terminal states;
- accepted digests equal verified digests;
- all referenced evidence files match their recorded size and SHA-256 checksum;
- cleanup reports zero worktrees, child processes, labeled containers, and temporary branches.

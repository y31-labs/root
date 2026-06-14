# Code MVP Completion Plan

## Purpose

This document converts the remaining MVP work into ordered, independently verifiable stages.

A stage is complete only when:

1. Every listed deliverable exists.
2. Every qualifier is covered by an automated assertion.
3. The stage command exits successfully from a clean checkout.
4. The command leaves no worktrees, containers, child processes, branches, or test artifacts behind.
5. The stage command is included in the final `bun run code:mvp:verify` command.

Commands marked **to add** are part of the deliverable. Existing passing commands are:

- `bun run code:check`
- `bun run code:verify`

## Status Vocabulary

| Status        | Meaning                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `verified`    | Deliverables exist and the automated qualifier passes.                                                 |
| `in_progress` | Some deliverables exist, but the complete qualifier does not pass.                                     |
| `pending`     | Work has not started or is represented only by narrow unit coverage.                                   |
| `manual_gate` | Execution needs local credentials or signing identity, but produces an automatically validated report. |

## Stage 0: Foundation Baseline

**Status:** `verified`

### Deliverables

- Local repository, policy, session, event, gate, approval, and artifact contracts.
- SQLite persistence and app-managed Git worktrees.
- Persistent Codex app-server integration.
- Localhost-only browser tools.
- Manifest v2 and pinned Bun/Playwright verification image.
- Repository and change-session desktop surfaces.
- Contract, component, Rust, browser, and Docker checks.

### Completion Qualifier

- TypeScript and Rust checks pass.
- The verifier image builds on Apple Silicon.
- The mocked-native browser flow passes.
- The current Rust fixture tests pass.

### Automatic Verification

```sh
bun run code:verify
```

This remains the baseline command. Later stages extend it rather than weakening or replacing it.

## Stage 1: Deterministic Session Harness

**Status:** `verified`

**Goal:** Exercise the real session orchestration without an authenticated model.

### 1.1 Extract The Implementation Engine Boundary

Deliverables:

- Define an internal engine interface for thread start, resume, turn start, turn status, interrupt,
  dynamic-tool calls, and approval responses.
- Keep Codex app-server as the only production implementation.
- Inject the engine into session orchestration without changing production behavior.

Qualifiers:

- Production construction selects the Codex engine.
- Tests can select a deterministic engine without environment variables or global mutable state.
- Session orchestration does not call Codex-specific functions directly.

Automatic verification:

```sh
bun run code:mvp:stage-1
```

### 1.2 Add A Deterministic Fake Agent

Deliverables:

- Add a JSONL-compatible fake app-server or in-process equivalent.
- Script file edits, tool calls, approvals, failures, repair turns, completion, interruption, and
  malformed responses.
- Record every request so tests can assert thread reuse and prompt contents.

Qualifiers:

- A repair uses the same thread ID as the initial turn.
- A browser tool result can include text and an image.
- An interrupted or failed turn produces the expected recoverable state.
- Unexpected protocol messages fail the test instead of being ignored.

### 1.3 Add Fixture Repository Builders

Deliverables:

- Build temporary Bun repositories with configurable scripts, app server, lockfile, dirty source,
  passing gates, failing gates, and unsafe changes.
- Give each fixture isolated Git identity, SQLite storage, worktree storage, and artifact storage.

Qualifiers:

- Fixtures never read or write the developer's Git configuration.
- Fixture teardown proves all temporary paths and branches were removed.
- Repeated runs produce equivalent manifests and outcomes.

### Stage 1 Completion Qualifier

The harness completes a no-browser session from request through `verified` without Codex credentials.

### Stage 1 Command To Add

```json
{
  "code:mvp:stage-1": "bun run --filter code-desktop test:session-harness"
}
```

## Stage 2: Atomic Verification And Safety

**Status:** `verified`

**Goal:** Make verification an atomic claim about one immutable worktree digest.

### 2.1 Enforce Stable Digests

Deliverables:

- Compute the digest before safety checks.
- Recompute it after every gate and once before writing the snapshot.
- Abort the attempt when any command changes the worktree.
- Record every result against the final matching digest only.

Qualifiers:

- A gate that edits a tracked file cannot pass verification.
- A gate that creates an untracked file cannot pass verification.
- A post-verification edit blocks acceptance.
- Results from previous digests cannot satisfy the current snapshot.

### 2.2 Make Snapshot Creation Transactional

Deliverables:

- Write gate results and the verification snapshot in one SQLite transaction after stability checks.
- Reject missing, skipped, stale, duplicate, or failed required results.
- Do not expose `verified` until the transaction commits.

Qualifiers:

- Simulated database failure leaves the session unverified.
- Restart between the last gate and snapshot write leaves a recoverable session.
- Every required safety check and gate has exactly one latest result for the snapshot digest.

### 2.3 Replace The Heuristic Secret Check

Deliverables:

- Add a pinned, diff-scoped secret scanner to the verifier image.
- Consume machine-readable findings.
- Store only redacted rule, file, and line metadata.
- Never include detected values in events, logs, repair prompts, or telemetry.

Qualifiers:

- Known token, private-key, and high-entropy fixtures fail.
- A secret present only in committed base content does not fail the change.
- Logs and SQLite contain no raw fixture secret.
- Scanner absence or malformed output fails closed.

### 2.4 Complete Safety Scenario Coverage

Deliverables:

- Add scenarios for no diff, escaping symlink, oversized added file, policy mutation, deleted
  manifest, added package manifest, file mode change, and stale verification.

Qualifiers:

- Every unsafe scenario remains outside `verified`.
- Every failure has a redacted, actionable terminal reason.
- Safe boundary cases pass, including an exactly 5 MiB file and an internal symlink.

### Stage 2 Completion Qualifier

All safety scenarios execute through the real verification orchestrator and prove that one stable
digest is used from the first safety result through acceptance eligibility.

### Stage 2 Command To Add

```json
{
  "code:mvp:stage-2": "bun run --filter code-desktop test:verification-fixtures"
}
```

## Stage 3: Process Ownership, Cancellation, And Recovery

**Status:** `verified`

**Goal:** Ensure Code owns and cleans every process it starts.

### 3.1 Add A Session Process Registry

Deliverables:

- Track Codex turns, gate processes, browser controllers, application servers, and containers by
  session.
- Label Docker containers with the session ID and process purpose.
- Centralize graceful termination, timeout, forced termination, and cleanup.

Qualifiers:

- Every started process is registered before session state advances.
- Process completion removes its registry entry.
- Cleanup is idempotent.

### 3.2 Prove Cancellation

Deliverables:

- Add cancellation fixtures for implementation, install, ordinary gate, app-server startup,
  browser interaction, and repair.

Qualifiers:

- Cancellation reaches `cancelled` within a bounded timeout.
- No process or labeled container remains.
- The worktree and conversation remain recoverable.
- Continuing uses the same worktree and thread metadata.

### 3.3 Prove Restart Recovery

Deliverables:

- Simulate process termination in every active lifecycle state.
- On startup, reconcile SQLite, worktrees, registered processes, and labeled containers.
- Never resume execution without an explicit user action.

Qualifiers:

- Active sessions become `needs_input`.
- Orphaned processes and containers are terminated.
- Missing worktrees produce an actionable failure rather than silent recreation.
- Accepted and discarded sessions remain unchanged.

### Stage 3 Completion Qualifier

Every cancellation and crash fixture ends with zero matching processes and containers, while
recoverable sessions retain their worktree and persisted history.

### Stage 3 Command To Add

```json
{
  "code:mvp:stage-3": "bun run --filter code-desktop test:process-fixtures"
}
```

## Stage 4: Lifecycle, Repair, And Acceptance

**Status:** `verified`

**Goal:** Prove every terminal path and the verified local branch contract.

### 4.1 Complete Session Outcome Fixtures

Deliverables:

- Passing first attempt.
- Failing then repaired.
- Permanently failing after five attempts.
- Thirty-minute cycle exhaustion using a fake clock.
- No-change implementation.
- Agent failure and malformed response.

Qualifiers:

- Repair prompts contain structured, redacted failures and the failed digest.
- Repair uses the same thread.
- Attempts never exceed five.
- Exhausted sessions become `needs_input`.
- No-change sessions never become `verified`.

### 4.2 Complete Acceptance Fixtures

Deliverables:

- Test fresh acceptance, stale acceptance, empty diff, failed gate, missing snapshot, dirty source
  tree, branch collision, commit failure, and worktree-removal failure.
- Define deterministic branch-collision behavior.

Qualifiers:

- Successful acceptance creates one commit whose tree matches the verified digest.
- The commit parent is the captured base SHA.
- The source working tree remains byte-for-byte unchanged.
- The app-managed worktree is removed.
- The local branch remains available.
- A partial failure stays recoverable and never reports `accepted`.

### 4.3 Complete Discard Fixtures

Deliverables:

- Test discard from `needs_input`, `failed`, `cancelled`, and `verified`.
- Test repeated discard and missing worktree behavior.

Qualifiers:

- Discard removes only app-managed state.
- It never deletes an accepted branch.
- It is idempotent after successful cleanup.

### Stage 4 Completion Qualifier

The deterministic harness proves all lifecycle and acceptance contracts using temporary real Git
repositories and real SQLite.

### Stage 4 Command To Add

```json
{
  "code:mvp:stage-4": "bun run --filter code-desktop test:lifecycle-fixtures"
}
```

## Stage 5: Browser Verification And Repository Policy UX

**Status:** `verified`

**Goal:** Make agentic browser use configurable, contained, and deterministically tested.

### 5.1 Add Structured App-Server Configuration

Deliverables:

- Replace raw JSON-only configuration with fields for command, arguments, environment, health URL,
  browser URL, and timeouts.
- Propose likely app-server scripts without silently approving them.
- Show the exact origin and network restrictions before approval.

Qualifiers:

- Invalid commands, external origins, mismatched origins, and invalid environment keys are blocked.
- Editing app-server configuration requires policy reapproval.
- A repository without an app server can still use non-browser gates.

### 5.2 Complete Browser Tool Fixtures

Deliverables:

- Exercise open, inspect, click, fill, key press, wait, screenshot, and error inspection through the
  fake agent.
- Preserve context within an implementation or repair turn.
- Reset context before deterministic browser verification.

Qualifiers:

- A fixture proves the agent can complete a multi-step form.
- Screenshot and trace artifacts are persisted and associated with the session.
- External navigation and requests are blocked and recorded.
- Uncaught errors and unexpected `console.error` fail browser verification.
- Browser exploration alone never marks a session verified.

### 5.3 Complete Browser Gate Fixtures

Deliverables:

- Passing accessibility, E2E, and visual examples.
- Page-error, console-error, external-navigation, server-timeout, and gate-timeout examples.

Qualifiers:

- Each failure reaches repair with relevant evidence.
- The application-server container always stops.
- Browser state from exploration cannot leak into authoritative verification.

### Stage 5 Completion Qualifier

A deterministic session uses browser tools to interact with a fixture application, repairs a
browser-visible failure, passes an authoritative browser gate, and reaches `verified`.

### Stage 5 Command To Add

```json
{
  "code:mvp:stage-5": "bun run --filter code-desktop test:browser-fixtures"
}
```

## Stage 6: Approvals, Review, And Product E2E

**Status:** `verified`

**Goal:** Make the complete session understandable and controllable from the desktop surface.

### 6.1 Complete Approval Handling

Deliverables:

- Cover command, file, network, external-path, secret, and privileged-operation requests.
- Persist pending and resolved approval states.
- Redact sensitive request details before persistence.
- Reject unsupported approval methods.

Qualifiers:

- Allow once, allow for session, and decline produce the expected protocol responses.
- Restart preserves pending approvals.
- Declined operations cannot modify the worktree.
- Secrets never appear in SQLite, events, UI snapshots, or logs.

### 6.2 Persist The Reviewable Conversation

Deliverables:

- Persist user messages, Codex messages, tool calls, repair prompts, and terminal reasons as
  structured local records.
- Render the ordered conversation alongside compact activity.

Qualifiers:

- Restart reconstructs the same review history.
- Repair attempts are visibly grouped.
- Streaming or repeated notifications do not duplicate messages.

### 6.3 Add In-App Evidence Review

Deliverables:

- Preview screenshots, text logs, patches, and assertions in the app.
- Show trace metadata with an explicit reveal/open action.
- Show artifact creation failure as a verification failure when the artifact is required.

Qualifiers:

- Missing artifact files are reported clearly.
- Artifact paths remain confined to app storage.
- Binary and oversized text artifacts do not freeze the UI.

### 6.4 Expand Mocked-Native Playwright Coverage

Deliverables:

- Repository registration and dirty warning.
- Policy proposal, edit, approval, and invalidation.
- Session creation, active state, approval, repair, verification, stale warning, acceptance, and
  discard.
- Setup failures and actionable guidance.

Qualifiers:

- Each primary user flow has at least one E2E scenario.
- Tests assert visible outcomes rather than implementation details.
- No test depends on real Codex, GitHub, Convex, or WorkOS.

### Stage 6 Completion Qualifier

The browser-tested React surface covers the complete MVP happy path and every user-recoverable
terminal state using an injected native API.

### Stage 6 Command To Add

```json
{
  "code:mvp:stage-6": "bun run --filter code-desktop test:product-e2e"
}
```

The native product fixtures and all nine mocked-native Playwright scenarios pass.

## Stage 7: Runtime Readiness And Distribution

**Status:** `manual_gate`

**Goal:** Make the MVP installable and fail clearly on unsupported local environments.

### 7.1 Enforce The Pinned Runtime

Deliverables:

- Bind manifest Bun version to an exact verifier image identifier.
- Reject version mismatches.
- Build or install the image automatically with progress and actionable failures.
- Verify image architecture, labels, Bun version, Playwright version, and browser availability.

Qualifiers:

- Modified image contents or version labels fail readiness.
- Missing Docker, stopped Docker, wrong architecture, and missing image each produce distinct
  guidance.
- Only the pinned install gate receives network access.

### 7.2 Probe Codex App-Server Compatibility

Deliverables:

- Replace the `--help` check with a protocol handshake.
- Verify thread lifecycle, approval requests, dynamic tools, and image tool responses.
- Return a precise upgrade requirement when a capability is missing.

Qualifiers:

- A fake incompatible server fails each capability independently.
- A compatible fake server passes without model credentials.
- Production readiness never reports browser tools available based only on command existence.

### 7.3 Remove The Dormant Runtime Surface

Deliverables:

- Move or remove inactive WorkOS, cloud-run, clone, and standalone-chat Rust code from the desktop
  MVP binary.
- Remove unused authentication state and dependencies from the active desktop runtime.
- Keep future architecture in plans or isolated post-MVP modules, not registered commands.

Qualifiers:

- The desktop binary exposes only MVP Tauri commands.
- Rust builds without legacy dead-code warnings.
- No desktop startup path initializes WorkOS, Convex, GitHub, or cloud coordination.

### 7.4 Harden The Packaged Application

Deliverables:

- Define a production CSP.
- Build the `.app` and `.dmg` on Apple Silicon.
- Add signing and notarization configuration for distributable builds.
- Document app-data, worktree, image, and cleanup locations.

Qualifiers:

- Tauri production build succeeds.
- The bundle passes `codesign --verify --deep --strict`.
- The notarized artifact passes `spctl --assess`.
- A packaged-app smoke test can register a fixture repository and display setup health.

### Stage 7 Completion Qualifier

The packaged application passes runtime readiness checks and contains no active dependency on
post-MVP cloud architecture.

### Stage 7 Commands To Add

```json
{
  "code:mvp:stage-7": "bun run code:mvp:runtime && bun run code:mvp:package"
}
```

Signing and notarization may use CI secrets, but verification must remain a non-interactive command.

Current manual gate: the Apple Silicon `.app` and `.dmg` build successfully, and an ad hoc signature
passes strict structural verification. `spctl --assess` remains blocked until a Developer ID
Application identity and notarization credentials are supplied. Runtime readiness now generates and
validates the installed Codex app-server schemas, performs a live credential-free lifecycle
handshake against the installed binary, and verifies the pinned Docker runtime contents.

## Stage 8: Authenticated Dogfood And MVP Declaration

**Status:** `manual_gate`

**Goal:** Prove the production Codex path against real repositories before declaring MVP.

### 8.1 Add An Automated Smoke Runner

Deliverables:

- Add `bun run code:mvp:smoke` for an already authenticated developer machine.
- Run production Codex and production browser tools; do not use the fake engine.
- Emit a machine-readable report containing commit SHA, verifier image ID, scenarios, durations,
  terminal states, artifact checksums, and cleanup result.
- Never include prompts, repository contents, credentials, or secret values in the report.

### 8.2 Run Required Dogfood Scenarios

Scenarios:

1. Clean repository, first-attempt passing change, acceptance.
2. Dirty source repository, failed gate, same-thread repair, acceptance.
3. Browser interaction, screenshot response, authoritative E2E verification, acceptance.
4. Cancellation during an active process followed by continuation or discard.
5. Post-verification edit followed by blocked acceptance and successful re-verification.

Qualifiers:

- Every accepted branch matches its verified digest.
- Dirty source changes remain unchanged.
- Repair and browser scenarios use one persistent thread per session.
- Cleanup reports zero remaining worktrees, child processes, and labeled containers.
- The report matches the exact commit being declared.

### 8.3 Validate The Smoke Report

Deliverables:

- Add a non-interactive report validator.
- Require all scenarios, a matching Git commit, a matching verifier image ID, and a maximum report
  age of seven days.

Automatic verification:

```sh
bun run code:mvp:smoke:verify
```

The smoke execution requires local Codex authentication. Its result qualification is automatic.

Current manual gate: the smoke runner now invokes only the packaged Code executable through its
native `--mvp-smoke` mode. That mode uses isolated application data and disposable repositories,
drives the production Codex, browser, verification, cancellation, stale-check, acceptance, and
cleanup paths, and checks embedded build provenance. The runner also requires a signed,
Gatekeeper-approved app, rejects environment-overridden provenance, pins the verifier image ID,
hashes accepted branch contents independently, requires a real verifier process for cancellation,
confines and bounds artifacts, and promotes only allowlisted report files. A development dogfood run
exercised a real Codex edit, atomic verification failure, and same-thread repair. The exact
five-scenario report still requires a clean distributable commit, Developer ID signing and
notarization, and available authenticated Codex quota.

## Final MVP Gate

### Command To Add

```json
{
  "code:mvp:verify": "bun run code:verify && bun run code:mvp:stage-1 && bun run code:mvp:stage-2 && bun run code:mvp:stage-3 && bun run code:mvp:stage-4 && bun run code:mvp:stage-5 && bun run code:mvp:stage-6 && bun run code:mvp:stage-7 && bun run code:mvp:smoke:verify"
}
```

### MVP Declaration Qualifiers

Code may be labeled MVP only when:

- `bun run code:mvp:verify` passes on Apple Silicon macOS.
- The exact distributable commit has a valid authenticated smoke report.
- No required test is skipped, quarantined, retried into passing, or dependent on test order.
- No test leaves app-managed worktrees, temporary branches, processes, or containers behind.
- All verification failures fail closed and remain recoverable where the lifecycle permits.
- The source working tree is unchanged after every fixture and dogfood scenario.
- The release bundle is signed and notarized for distribution.

## Recommended Execution Order

1. Stage 1: deterministic harness.
2. Stage 2: atomic verification and safety.
3. Stage 3: process ownership and recovery.
4. Stage 4: lifecycle and acceptance.
5. Stage 5: browser and policy UX.
6. Stage 6: approvals and review surface.
7. Stage 7: runtime and packaging.
8. Stage 8: authenticated dogfood and declaration.

Stages 2 through 5 depend on Stage 1. Stage 6 can begin after the Stage 1 API stabilizes. Stage 7 can
run in parallel with Stages 5 and 6, but cannot complete before process cleanup and runtime
fingerprinting are final.

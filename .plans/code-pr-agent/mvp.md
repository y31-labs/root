# Code MVP

Implementation is not considered complete until every qualifier in
[mvp-completion-plan.md](./mvp-completion-plan.md) passes.

## Included

- Apple Silicon macOS Tauri desktop application.
- Local Git repository registration and compatibility checks.
- Repository policy discovery for Bun TypeScript projects.
- Policy fingerprints covering `bun.lock`, root package configuration, and gate package manifests.
- App-managed Git worktrees created from the selected repository's committed `HEAD`.
- Persistent Codex app-server sessions with workspace-scoped autonomy and explicit approvals.
- Localhost-only Playwright tools for inspection, interaction, screenshots, and console diagnostics.
- A pinned Bun and Playwright verification container.
- Deterministic install, typecheck, lint, build, unit, integration, coverage, accessibility, E2E, and
  visual gates when approved scripts exist.
- Diff safety checks for empty changes, stale verification, policy mutation, secrets, escaping
  symlinks, and newly added files larger than 5 MiB.
- Up to five implementation and repair attempts within each 30-minute cycle.
- Local SQLite state and app-managed logs, screenshots, assertions, traces, and patches.
- Review, continue, cancel, verify again, accept, and discard actions.
- Squashed local branch creation after fresh verification.

## Experience

1. **Prepare:** show actionable readiness for Git, Codex, authentication, container runtime, and
   app-server browser-tool compatibility.
2. **Open repository:** select a local Git repository and show its `HEAD` and dirty-state warning.
3. **Approve policy:** inspect discovered scripts and approve the exact policy fingerprint.
4. **Start change:** enter a request and create an isolated worktree from committed `HEAD`.
5. **Implement:** stream one persistent Codex conversation and activity timeline.
6. **Explore:** let Codex operate only the approved localhost application origin.
7. **Verify:** run safety checks and approved gates against one worktree digest.
8. **Repair:** return structured failures and evidence to Codex within bounded attempts.
9. **Review:** inspect the conversation, diff, evidence, and results together.
10. **Accept or discard:** create a verified local branch or explicitly remove the temporary state.

## Boundaries

- Codex is the only production agent provider.
- Bun TypeScript repositories are the only repository profile.
- The verification container is pinned and managed by Code.
- Only the install gate may use network access.
- Browser tools may navigate only within the session application server's configured origin.
- Browser exploration does not satisfy verification.
- Uncommitted source changes are never included in the session base.
- Packaged Tauri GUI automation, other package managers, other language profiles, Windows, Linux,
  cloud synchronization, team queues, and pull-request publishing are excluded.

## Exit Criteria

- A clean fixture completes request, browser exploration, deterministic verification, and acceptance.
- Dirty source changes remain untouched and absent from the session worktree.
- Relevant package or lockfile changes invalidate repository policy approval.
- Failed gates trigger bounded repair and eventually become recoverable `needs_input`.
- Cancellation terminates Codex, application-server, browser, and container processes.
- Restart restores incomplete sessions as recoverable without silently resuming them.
- External paths, network, secrets, and privileged operations require approval or fail closed.
- Any post-verification edit prevents acceptance until verification succeeds again.
- Missing, stale, skipped, failed, or empty verification can never be labeled verified or accepted.
- Code's React surface, Rust orchestration, and deterministic fixture sessions have automated coverage.

# Local Code Agent Roadmap

## Phase 1: Local Verification Workbench

- Root Convex schema and ownership-checked setup/task/run APIs.
- Shared manifest, lifecycle, engine, and workbench presentation contracts.
- Tauri app with Keychain auth, SQLite persistence, Codex JSONL, Docker gates, and local evidence.
- Setup-only web app and desktop onboarding.

## Phase 2: Local Hardening

- Fixture repositories for passing, failing, flaky, authenticated-browser, console-error, and no-change runs.
- Full app-server health orchestration, richer Playwright evidence, retention controls, and export.
- Signed verification image, stricter Docker network policy, and deeper crash/cancellation tests.

## Phase 3: GitHub Publishing

- Create a deterministic branch and commit from a verified patch.
- Open or update a pull request linked to the task and verification summary.
- Require explicit override records for any unverified publication.

## Deferred Providers

The platform-neutral engine interface may later support API-funded or hosted engines. Those providers
must preserve the same Docker-authoritative verification contract and cannot reuse Codex subscription
credentials outside the user's machine.

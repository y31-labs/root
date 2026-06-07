# Local Codex Desktop MVP

## Included

- Apple Silicon macOS Tauri workbench using React, TanStack Router/Query, and shared UI.
- Installed Codex CLI with ChatGPT authentication and machine-readable `codex exec` events.
- Docker Desktop and pinned Bun/Playwright verification image checks.
- Exact-SHA disposable GitHub checkout and up to five repair attempts within 30 minutes.
- Local SQLite timelines plus local patches, logs, screenshots, assertions, and traces.
- Root Code Convex deployment for setup data, tasks, desktop registrations, and compact run summaries.
- Setup-only web experience for account, GitHub, repositories, manifest approval, and desktop onboarding.
- Menu-bar/background continuation, cancellation, guarded quit, and crash recovery.

## Excluded

- Hosted workers, OpenRouter, remote artifact storage, and worker leases.
- Branch push, pull-request creation, merge, or production deployment.
- User working-directory mutation, arbitrary package managers, or non-Bun language profiles.
- Windows/Linux packaging and automatic background daemons.
- Live third-party identity-provider login during browser verification.

## Exit Criteria

- Root Convex codegen, shared contracts, desktop frontend, Rust tests, and web production build pass.
- Failed or missing required gates cannot produce `verified`.
- Cancellation terminates active Codex/Docker processes.
- Restart marks incomplete local runs recoverable rather than silently resuming them.
- One authenticated developer-machine smoke test completes task-to-patch verification.

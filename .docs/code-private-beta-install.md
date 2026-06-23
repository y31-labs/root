# Code Private Beta Install And Runbook

Last updated: 2026-06-23

This runbook covers the first private-beta loop: local Bun TypeScript repository to verified local
branch with Markdown and JSON evidence reports.

## Supported Beta Shape

- Apple Silicon macOS 13 or newer.
- Local Git repository with a committed `HEAD`.
- Bun TypeScript repository with root `package.json` and `bun.lock`.
- Clean source working tree before opening a session.
- Docker Desktop running locally.
- Existing Codex CLI authentication.
- Local verifier image `code-agent-verifier:1`.

Out of scope for this beta: hosted runners, GitHub PR creation, team workflows, billing,
marketplace features, non-Bun package managers, Windows, and Linux.

## Developer Setup

From the monorepo root:

```sh
bun install
bun run code:mvp:runtime
```

`code:mvp:runtime` builds the pinned verifier image and runs the runtime readiness checks. If you
only need to rebuild the Docker image, run:

```sh
bun run desktop:image
```

For a local development build of the desktop app:

```sh
bun run desktop:dev
```

For a packaged MVP build:

```sh
bun run code:mvp:package
```

Local ad hoc builds are expected to fail Gatekeeper assessment. Distribution builds require the
Developer ID signing and notarization environment described in `.docs/code-desktop-runtime.md`.

## First-Run Product Loop

1. Open Code Desktop.
2. Confirm Docker Desktop is running and Codex is authenticated.
3. Register a supported local repository.
4. Review the detected Bun verification policy.
5. Approve the policy for the current committed package configuration.
6. Start a bounded change session with a concrete task.
7. Let the agent work in its app-managed worktree.
8. Review approvals, activity, diff, gates, and artifacts.
9. When verification passes, choose **Export report**.
10. Preview or reveal `Evidence report (Markdown)` and `Evidence report (JSON)` from Artifacts.
11. Accept the verified session into a local branch.
12. Review or push the accepted branch from the source repository.

Acceptance is blocked unless the latest verification snapshot is fresh, complete, and has a diff.
Export is available for verified sessions and accepted sessions.

## Deterministic Demo Repo

Create a standalone demo repository outside this monorepo:

```sh
bun run code:demo:create
```

To replace an existing demo repo or choose a specific location:

```sh
bun run code:demo:create -- --output "$HOME/Code/code-private-beta-demo" --force
```

Open the generated repository in Code and use this task:

```text
Fix checkoutTotalCents so it respects item quantity, and keep the unit tests passing.
```

The generated repo has a committed failing unit test and a `test:unit` script, so the default
policy can verify the repair with `bun run test:unit`.

## Evidence Report Contents

The generated JSON and Markdown reports include:

- Session id and task summary.
- Repository name, path, and source branch.
- Base commit and accepted branch when available.
- Verification digest and required check summary.
- Verification gates and safety checks by attempt.
- Artifact index with local paths for patch, redacted command logs, screenshots, traces,
  assertions, and reports.
- Privacy notes confirming source contents are not embedded.

Report artifacts are stored under the app-managed session artifact directory:

```text
~/Library/Application Support/dev.root.code/sessions/<session-id>/artifacts/
```

## Pilot Task Guidance

Use bounded tasks with deterministic verification:

- Fix one failing unit test.
- Add missing test coverage for one function or component.
- Repair a typecheck, lint, build, or unit failure.
- Make a small UI fix with screenshot or browser evidence.
- Upgrade one dependency only when tests are clear and fast.

Avoid broad product work, multi-repo migrations, production operations, and tasks that require
external credentials.

## Reset And Cleanup

Discarding a session removes its app-managed worktree and unaccepted session state. Accepted local
branches remain in the source repository.

After quitting Code, a full local reset is:

```sh
rm -rf "$HOME/Library/Application Support/dev.root.code"
docker image rm code-agent-verifier:1
```

Review accepted branches before deleting app data. They are intentionally not removed by reset.

## Beta Limitations

- Reports are local-only.
- GitHub PR creation is not part of the required loop.
- The web control plane is not linked to local desktop sessions.
- The verifier image is Docker-based and must be available before sessions can verify.
- Policy approval is tied to committed package configuration fingerprints.
- Verification commands are limited to the Bun gate policy detected or approved for the repo.
- Command logs are redacted, but pilots should still avoid tasks involving secrets.

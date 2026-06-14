# Code: Verified Local Change Sessions

## Vision

Code turns a developer request into a verified, reviewable local branch without modifying the
developer's active working tree. It uses the installed Codex CLI and existing ChatGPT login for
implementation, while deterministic, app-owned checks decide whether a change is verified.

The MVP is local-first. It has no Code account, WorkOS login, Convex dependency, GitHub App, task
queue, cloud synchronization, or pull-request publishing requirement.

## Ideal User

A hands-on developer who:

- Uses Apple Silicon macOS, Git, Bun, TypeScript, and Codex.
- Works in repositories with meaningful build, typecheck, lint, unit, integration, or browser tests.
- Delegates medium-sized changes but wants deterministic evidence before accepting them.
- Values an isolated workflow that never mutates their active working tree.

## Core Loop

1. Code checks Git, Codex authentication, and a Docker-compatible runtime.
2. The developer opens a local Git repository.
3. Code detects Bun scripts and proposes a repository verification policy for approval.
4. A change session captures the repository's current `HEAD` and creates an app-managed worktree.
5. A persistent Codex app-server thread implements the request inside that worktree.
6. Codex may use app-owned Playwright tools to inspect and interact with the session's localhost app.
7. Code runs every approved gate and safety check in the pinned verification environment.
8. Failures return to the same Codex thread for bounded repair.
9. The developer reviews the conversation, activity, diff, gate results, screenshots, traces, and logs.
10. Acceptance rechecks the worktree digest, creates one commit on `code/<slug>-<id>`, removes the
    worktree, and leaves the branch ready locally.

## Product Principles

- **Proof is deterministic:** browser exploration and model judgment can guide repairs but cannot
  mark a session verified.
- **Isolation is mandatory:** sessions start from committed `HEAD`; dirty working-tree changes are
  warned about, excluded, and never modified.
- **Verification is fresh:** every gate result is tied to a worktree digest and becomes stale after
  any edit.
- **The agent can inspect the product:** localhost-only browser tools provide DOM/accessibility
  state, interaction, screenshots, console errors, and traces.
- **Evidence stays local:** repositories, policies, sessions, events, approvals, and artifacts live
  in app-managed SQLite and storage.
- **Acceptance is explicit:** only a non-empty, unchanged, fully verified tree can become a branch.

## Later Team Product

Accounts, WorkOS, Convex, GitHub installations, shared repositories, team queues, cloud evidence,
remote execution, pull-request publishing, and deployment coordination are post-MVP capabilities.

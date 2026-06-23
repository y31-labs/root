# Code First Sprint Plan

Last updated: 2026-06-23

## Kickoff Status

Code is close to a private-beta shape for the local verified-branch loop, but not yet packaged as a
pilot-ready product.

Already present:

- Desktop local execution with SQLite state, app-managed worktrees, session lifecycle, approvals,
  verification, artifacts, stale-verification blocking, accept, and discard.
- Repository onboarding for Apple Silicon macOS Bun repositories with dirty source-tree exclusion.
- Policy proposal and approval with committed `HEAD` package-configuration fingerprints.
- Pinned Docker verifier image, runtime probes, restricted network policy, safety checks, redacted
  logs, browser verification support, and deterministic cleanup.
- Shared contracts for manifests, runs, sessions, artifacts, safety checks, and fresh verification.
- Convex control-plane scaffolding for users, GitHub installations, repositories, tickets, runs, and
  gate results.
- Authenticated MVP smoke harness for packaged desktop validation.

Not private-beta ready yet:

- No human-readable evidence report export for accepted or verified sessions.
- No pilot-ready sample repository and sample task.
- No install guide that turns prerequisites, verifier build, Codex login, smoke verification, and
  reset/cleanup into one first-run checklist.
- Funnel analytics exist as logging plumbing, but not as the kickoff event allowlist.
- The web control plane is still repository/GitHub scaffolding and is not linked to desktop local
  sessions.
- GitHub PR creation remains out of the first loop and should stay optional until reports work.

## First Value Loop Audit

| Step | Current state | Gap |
| --- | --- | --- |
| Repo opened | Desktop can register local Git repos, detect Bun compatibility, show dirty state, and preserve current edits outside sessions. | Needs pilot-facing guidance for unsupported repos and Docker/Codex prerequisites. |
| Policy approved | Desktop proposes Bun verifier manifests from committed package scripts and stores approval fingerprints. | Web/Convex manifest proposal is separate from desktop and not part of the local loop. |
| Session started | Desktop creates detached app-managed worktrees from committed `HEAD` and starts Codex in that worktree. | Needs a sample task that reliably demonstrates first success. |
| Verified | Safety checks, required gates, browser gates, artifacts, redaction, retries, and fresh snapshots exist. | Needs a report artifact/export that explains the evidence without live narration. |
| Branch accepted | Acceptance requires a fresh verified digest, creates a local branch, removes the worktree, and rolls back if cleanup fails. | Needs clearer post-accept branch handoff and optional PR plan. |
| Evidence report | Diff, logs, screenshots, traces, and assertions are viewable as artifacts. | No Markdown/JSON evidence report export or portable PR summary. |

## Private Beta Blockers

P0 blockers:

- Evidence report v1: local Markdown and JSON export from one verified session, including task,
  base commit, accepted branch, verification snapshot, gates, safety checks, artifact index, and
  privacy notes.
- Demo repo and bounded task: a small Bun TypeScript repo with one failing unit or UI behavior and
  a deterministic success path.
- Install and pilot runbook: one document covering macOS/Apple Silicon, Docker Desktop, Codex login,
  verifier image build, opening a repo, approving policy, running a session, accepting a branch, and
  cleanup.
- Manual live-flow evidence: one current smoke or manual report proving the packaged desktop can
  complete the loop on the demo repo.

P1 blockers:

- Funnel analytics: metadata-light events for repository registered, policy proposed/approved,
  session started, gate completed, session verified, branch accepted, session discarded, and report
  exported.
- Failure recovery copy: common Docker, Codex auth, verifier image, policy stale, and gate failure
  messages mapped to next actions.
- Contract alignment: keep Convex gate-result kinds in sync with `verificationGateKinds` before
  syncing desktop runs to the web control plane.

## First Sprint Backlog

### P0 Engineering

- Verify the current desktop loop manually on a selected Bun TypeScript repo and record exact
  failure points.
- Create `EvidenceReport` v1 schema and local export command for Markdown and JSON.
- Add report artifacts to verified sessions and expose Preview/Reveal from the session page.
- Select or create the demo repo and pin one first-run task with expected gates.
- Draft private beta install guide and reset instructions from `.docs/code-desktop-runtime.md`.
- Audit Convex `gateResults.kind` against `verificationGateKinds` before any desktop-to-web run
  sync.

### P0 Product

- Freeze MVP boundaries for the first 30 days: Apple Silicon macOS, Bun TypeScript repos, local
  Codex engine, local verified branch, local report export.
- Write the interview script into a reusable pilot note template.
- Build a list of 50 pilot prospects and identify the first 10 to schedule.
- Define the five target task categories: failing test repair, missing test coverage,
  lint/typecheck/build repair, small UI fix with screenshot, dependency upgrade with tests.

### P0 Design

- Design the report view/export structure around questions reviewers ask: what changed, what ran,
  what passed, what failed, what artifacts exist, and why acceptance was allowed.
- Tighten first-run empty states for setup, repositories, policy required, no sessions, failed
  verification, and accepted branch.
- Keep the desktop UI on the flat section/divider pattern from `.docs/code-ui-style.md`.

### P1 Growth

- Draft waitlist copy using the approved positioning: "Merge AI-written code only after it proves
  itself."
- Draft outreach messages for founders, senior engineers, agencies, and AI-forward small teams.
- Prepare the first technical post outline around the AI code trust gap and verified branches.

### P1 Pilot

- Schedule 5 first-week interviews and 3 concierge pilots.
- Create a pilot tracker with repo type, task type, setup friction, session outcome, accepted branch,
  trust objections, and willingness to pay.
- Prepare a 30-minute demo script using the demo repo and evidence report.

## Decisions Needed

- Evidence reports should be local-only for private beta unless a pilot explicitly needs sharing.
- GitHub PR creation should remain beta-optional until evidence report export is reliable.
- Private beta should require existing Codex CLI authentication for now.
- Docker friction should be measured in pilots before investing in alternate verifier packaging.
- The web app should stay GitHub/waitlist/control-plane scaffolding until the desktop loop is loved.

## Recommended Immediate Repo Changes

- Add EvidenceReport contract types in `@workspace/code-agent-contracts` before implementation.
- Align Convex gate-result validators with `verificationGateKinds`.
- Add a desktop command for report export and store generated reports as `report` artifacts.
- Add `.docs/code-private-beta-install.md` once the demo repo and smoke path are selected.
- Add a demo repo or a script that generates one without requiring hidden local state.

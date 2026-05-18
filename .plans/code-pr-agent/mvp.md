# Code PR Agent MVP

## MVP Goal

Ship a web application where a single team can:

1. Record **internal tickets** with enough context for an agent to act.
2. Connect **one GitHub repository** (allowlisted) with credentials appropriate for opening PRs.
3. Start an **agent run** that creates a branch, commits changes, and opens a **pull request** linked to the ticket.
4. Continue work via **in-app messages** so the agent can push **additional commits** to the same PR (or the same head branch) when the user asks for refinements.

This MVP intentionally defers external issue trackers, multi-tenant isolation, and autonomous merge.

## MVP Scope

### Included

- Internal ticket model: create, edit, list, detail view with status.
- Threaded **chat** on the ticket for user follow-ups and assistant replies.
- **Run** lifecycle: queued → running → terminal (`succeeded`, `failed`, `needs_input`, `cancelled` best-effort).
- GitHub: create branch from default branch, push commits, open PR with title/body referencing ticket id and summary.
- Persistence of run traces sufficient to debug failures (at minimum: high-level steps + error string; ideally structured events per [architecture.md](./architecture.md)).
- Basic operator visibility: list runs, inspect last error, open PR in GitHub from UI.

### Excluded

- Jira, Linear, or other external issue **sync**.
- Multiple GitHub orgs or unbounded repo connectivity (at most a small allowlist).
- Autonomous **merge** without human review on GitHub.
- Rich CI interpretation (re-run failed jobs, parse annotations) beyond surfacing a link and optional log snippet if trivial.
- Advanced sandbox fleet (optional single-machine or inline action execution is acceptable if documented with limits).

## User Stories

1. As a developer, I create a ticket describing a bug or feature so the agent has a single source of truth for intent.
2. As a developer, I click **Run agent** and see progress states until a PR link appears or a clear failure message is shown.
3. As a developer, I open the PR in GitHub, review the diff, and leave review comments there as today.
4. As a developer, I message in the ticket thread: “Address review: extract helper and add unit test” and start another run that updates the same PR.
5. As an operator, I can see which tickets have open PRs and which runs failed, without reading server logs.

## Functional Requirements

- **Ticket CRUD:** title, description, status (`open`, `in_progress`, `done` or equivalent), optional labels later.
- **Threading:** messages ordered by time; associate new runs with the latest user instruction or explicit “run with this prompt” action.
- **Git operations:** deterministic naming for branches (e.g. `agent/ticket-<shortId>-<slug>`) to avoid collisions; document collision handling (append counter).
- **PR body:** includes ticket link or id, summary of intent, and disclaimer that changes are agent-generated and require review.
- **Recovery:** if PR creation fails after push, a retry can complete PR creation without duplicating the branch strategy blindly (see architecture failure modes).

## Non-Functional Requirements

- **Latency:** interactive UI remains responsive; long work happens asynchronously (actions), not blocking mutations beyond enqueue.
- **Security:** credentials never exposed to the client; repo allowlist enforced server-side on every run.
- **Observability:** structured logs or `run_events` for each run; correlation id from UI action through action completion.
- **Rate limits:** graceful handling of GitHub API rate limiting (backoff, user-visible message).

## Failure Modes (MVP expectations)

| Situation | Expected UX |
|-----------|-------------|
| GitHub permission denied | Run fails with actionable error; ticket stays `open` |
| Merge conflict with default branch | `needs_input` with message; user resolves via GitHub or instructs rebase strategy in follow-up |
| Model or tool timeout | Run `failed` with retry; partial commits documented |
| User cancels | Best-effort stop before next tool; may complete current git op |

## Dependencies

- GitHub access method chosen per [architecture.md](./architecture.md) (App or PAT for prototype).
- LLM provider credentials and model choice (document env vars at implementation time).
- Convex project (or explicit alternative if product diverges from monorepo defaults).

## Exit Criteria

- Two consecutive successful paths: **initial PR** from a ticket, then **follow-up commit** from a chat instruction.
- No credential leakage in client bundles or public queries.
- Operators agree run history is sufficient to debug a failed attempt without SSH access.

## Related Documents

- [concept.md](./concept.md) — product framing.
- [architecture.md](./architecture.md) — topology and data sketch.
- [implementation-roadmap.md](./implementation-roadmap.md) — phased delivery after MVP.
- [safety-and-governance.md](./safety-and-governance.md) — controls that constrain MVP behavior.

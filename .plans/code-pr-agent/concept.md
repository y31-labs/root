# Code PR Agent Concept

## Vision

Build a web application where software work stays anchored to **tickets**: each ticket describes desired behavior or a bug; an **agent** turns that intent into real **code changes** and opens (or updates) a **GitHub pull request**. Humans steer the outcome through **in-app messages** so the same ticket and PR can evolve through conversation instead of one-shot generation.

The first wave uses an **internal-only** issue model (no Jira/Linear sync). External trackers become adapters once the core loop is reliable.

## Core Concept

The system is not a generic chatbot. It is a **ticket-scoped coding agent** with a durable link between product intent, repository state, and GitHub collaboration primitives:

- **Tickets** capture title, description, acceptance signals, and status (internal tables/API for now).
- **Agent runs** consume ticket context plus repository context, then produce commits and a PR (or additional commits on an existing branch).
- **Conversation threads** attach to a ticket (and optionally to a specific PR) so users can request follow-up edits (“also handle edge case X”, “rename the flag”, “add tests”).
- **Traceability** ties ticket id, branch name, PR URL, and run history so every change is explainable and reviewable.

## Product Pillars

1. **Ticket-to-PR traceability**
   - Every PR is attributable to a ticket; runs and messages are auditable.
2. **Human steering without losing context**
   - Chat refines the same work item instead of starting from zero each time.
3. **Observable agent behavior**
   - Tool calls, diffs, errors, and policy decisions are stored for debugging and governance.
4. **Minimal internal tracker first**
   - Ship value with Convex-backed (or equivalent) issues before multi-vendor integrations.
5. **Safe collaboration defaults**
   - The agent proposes changes through GitHub’s normal review flow; merge and production access remain human-gated (see [safety-and-governance.md](./safety-and-governance.md)).

## User Experience Goal

For the user, the product should feel like a **focused coding workbench** tied to real engineering workflow:

- Create or pick a ticket and see clear status: queued, running, PR opened, needs input, failed.
- Open the PR from the UI and continue the conversation in-app when something is wrong or incomplete.
- Trust that the system remembers prior instructions on that ticket unless explicitly superseded.
- Rely on GitHub for diff review, comments, and merge—without the agent bypassing team norms.

## Scope Boundary

### In scope for early milestones

- Web UI for tickets, run history, and per-ticket chat.
- One or a few **allowlisted** GitHub repositories per deployment.
- Agent loop: plan → edit → commit → push → open/update PR (exact mechanics in [architecture.md](./architecture.md)).
- Internal ticket CRUD and linking to runs and PR metadata.

### Out of scope for early milestones

- Full Jira/Linear bidirectional sync (design as a future adapter only).
- Autonomous merge to default branch without human review.
- Multi-tenant SaaS hardening unless explicitly prioritized later.
- Arbitrary execution of user-supplied binaries outside a defined sandbox policy (if any sandbox exists, it is constrained and documented).

## High-Level Capability Model

- **Tickets**: lifecycle, priority, assignee (optional), links to repo and PR.
- **Runs**: one agent execution from trigger to terminal state; stores steps, tool traces, and outcomes.
- **Messages**: user and assistant turns in a thread scoped to a ticket (and optionally a run or PR).
- **Repo integration**: clone/fetch, branch, patch, commit, push, open PR via GitHub API (GitHub App or PAT—decision in architecture).
- **Policy / governance**: classification, allowlists, and operator modes (see [safety-and-governance.md](./safety-and-governance.md)).

## Terminology

- **Ticket**: internal work item describing desired code change or fix.
- **Run**: a single agent execution attempt for a ticket (may span multiple commits).
- **Thread**: ordered messages refining work on a ticket.
- **PR**: GitHub pull request representing the agent’s proposed changes for that ticket.

## Success Definition

The concept succeeds when:

- A ticket reliably produces a **reviewable PR** for an allowlisted repo.
- Users can **iterate** via chat and see new commits on the same PR without manual git steps.
- Operators can answer “what did the agent do, why, and under which constraints?” from stored runs and governance metadata.

## Related Documents

- [architecture.md](./architecture.md) — system topology and data sketch.
- [mvp.md](./mvp.md) — first shippable slice.
- [implementation-roadmap.md](./implementation-roadmap.md) — phased delivery.
- [safety-and-governance.md](./safety-and-governance.md) — risks and controls.

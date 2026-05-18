# Code PR Agent: Implementation Contracts

Normative contracts for Convex-shaped control plane and web client. Product narrative lives in [concept.md](./concept.md), [mvp.md](./mvp.md), and [architecture.md](./architecture.md).

## Canonical entities

Stable names and relationships (schema details belong in code; this is the contract).

| Entity | Primary key | Required relationships | Notes |
|--------|-------------|------------------------|--------|
| `Repo` | `repoId` | — | Allowlisted GitHub target (`owner`, `name`, `defaultBranch`, installation or credential handle). |
| `Ticket` | `ticketId` | `repoId`, `createdBy` | Title, body, status, timestamps. |
| `Thread` | `threadId` | `ticketId` | One primary thread per ticket for MVP; optional `primaryRunId` later. |
| `Message` | `messageId` | `threadId` | `role` ∈ {`user`, `assistant`, `system`}, `content`, `createdAt`; optional tool refs. |
| `Run` | `runId` | `ticketId` | Lifecycle, trigger, branches, PR metadata, error summary, timestamps. |
| `RunEvent` | `runEventId` | `runId` | Append-only trace: `type`, `payload`, `createdAt`. |

**Foreign key rules:** every `Message` belongs to exactly one `Thread`; every `Thread` to exactly one `Ticket`; every `Run` to exactly one `Ticket`; every `RunEvent` to exactly one `Run`. `Ticket` references exactly one `Repo` for MVP.

## Run lifecycle (state machine)

### States

| State | Kind | Meaning |
|-------|------|---------|
| `queued` | non-terminal | Run accepted; waiting for worker/action pickup. |
| `running` | non-terminal | Agent + tools executing (may span multiple commits). |
| `succeeded` | terminal | Run objective met (e.g. PR opened/updated as defined for the trigger). |
| `failed` | terminal | Unrecoverable error or exhausted retries; `error` populated. |
| `needs_input` | terminal | Blocked on human/GitHub action (e.g. merge conflict with base); user may message and start a new run. |
| `cancelled` | terminal | Best-effort stop requested; partial git state may exist; document in run metadata. |

### Allowed transitions

Only these directed transitions are valid:

1. `queued` → `running` — when the executing action claims the run.
2. `running` → `succeeded` | `failed` | `needs_input` | `cancelled` — when the action completes, errors, detects a user-resolvable blocker, or cancellation wins the race.

There is **no** transition from any terminal state back to `queued` or `running`. A new user intent creates a **new** `Run` row (new `runId`), possibly reusing `headBranch` / PR correlation per [architecture.md](./architecture.md) recovery rules.

### Who may transition (caller boundary)

| Transition | Allowed caller |
|------------|----------------|
| → `queued` | **Public** mutation: enqueue run (from authenticated UI after validation). |
| `queued` → `running` | **Internal** mutation or action-only helper invoked at start of run action (not directly from browser). |
| `running` → terminal | **Internal** mutation, called only from Convex **actions** (or scheduled internal paths), after git/model work. |
| `running` → `cancelled` (request) | **Public** mutation sets a `cancelRequestedAt` flag; action observes and transitions to `cancelled` best-effort (**internal** completes the terminal transition). |

The UI never sets `running` or terminal states directly.

## Public vs internal API boundaries

### Public (callable from authenticated web client)

Subject to auth and validation (repo allowlist, ticket ownership / org policy as implemented):

- **Tickets:** create, update (title/body/status), archive/delete if product allows.
- **Messages:** append user message; optionally append assistant message only if your product streams via mutation (prefer action → internal mutation for assistant turns to keep one path).
- **Runs:** enqueue new run (`queued`); request cancel (flag + optional reason); enqueue retry as **new** `Run` with link to prior run if desired (still a new row per state machine above).

### Internal-only (never exposed as public Convex endpoints to the browser)

- Append `RunEvent` rows.
- Transition `queued` → `running` or to any **terminal** state.
- Write GitHub-affecting results (`prNumber`, `prUrl`, `headBranch`, SHAs) from actions.
- Store or refresh credential-derived metadata (never raw tokens in queryable documents).
- Any mutation that runs with elevated trust or skips user-scoped checks.

**Rule of thumb:** if it touches git remotes, LLM provider keys, or interprets tool output into durable trace rows, it belongs behind an **action** that calls **internal** mutations.

## Correlation and idempotency

- Client may pass an optional `clientRunKey` (UUID) on enqueue; server rejects duplicate enqueue for the same ticket + key within a TTL to avoid double runs from retries.
- `RunEvent` writes are append-only; action completion should be idempotent where possible (terminal state wins; no downgrade from terminal).

## Related documents

- [architecture.md](./architecture.md) — topology and data sketch.
- [mvp.md](./mvp.md) — user-visible lifecycle expectations.
- [safety-and-governance.md](./safety-and-governance.md) — tiering and operator modes (future enforcement hooks align to `RunEvent` types).

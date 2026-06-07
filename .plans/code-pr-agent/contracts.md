# Local Code Agent Contracts

## Synced Entities

| Entity | Purpose |
| --- | --- |
| `Repo` | GitHub repository, selected state, approved manifest, and base SHA. |
| `Ticket` | User task title, body, repository, status, and timestamps. |
| `DesktopRegistration` | Installation ID, app version, and last-seen timestamp. |
| `Run` | Engine, Codex version, exact SHA, lifecycle, attempt, and compact summary. |
| `GateResult` | Gate kind, attempt, required flag, status, duration, and exit code. |

Local SQLite stores run timelines, crash-recovery state, and artifact indexes. App-data folders store
patches, logs, screenshots, assertions, and Playwright traces.

## Run Lifecycle

```text
queued -> preparing -> implementing -> verifying -> repairing
       -> verified | failed | cancelled | needs_input
```

Terminal states do not transition back to active states. A retry creates a new run from the original
approved SHA. `verified` requires a local patch and a passing latest result for every required gate.

## Engine Contract

The MVP snapshots `engine: "codex-local"`. Future engines implement the shared `ImplementationEngine`
interface without changing manifest or verification semantics.

## Security Boundaries

- Desktop invokes `codex login status` but never reads or copies `~/.codex/auth.json`.
- WorkOS refresh credentials live in macOS Keychain.
- GitHub clone credentials are passed only to the clone operation.
- Artifact reads and reveal operations are confined to app-managed run storage.
- Convex mutations verify ownership and recompute terminal verification summaries.

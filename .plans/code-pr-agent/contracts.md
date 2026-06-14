# Code MVP Contracts

## Local Entities

| Entity | Purpose |
| --- | --- |
| `Repository` | Canonical local path, display name, current `HEAD`, dirty state, and compatibility. |
| `RepositoryPolicy` | Approved manifest v2, configuration fingerprint, and approval timestamps. |
| `ChangeSession` | Request, base SHA, worktree, branch, Codex thread, lifecycle, and verification state. |
| `SessionEvent` | Ordered lifecycle, agent, command, file, approval, browser, and system activity. |
| `GateResult` | Gate, attempt, status, duration, exit code, digest, and artifact references. |
| `VerificationSnapshot` | Required results and safety checks tied to one worktree digest. |
| `Artifact` | Local patch, log, screenshot, trace, assertion, or report metadata. |

## Session Lifecycle

```text
preparing -> implementing -> verifying -> repairing
          -> verified -> accepted
          -> needs_input | failed | cancelled

needs_input | failed | cancelled -> implementing | verifying | discarded
verified -> verifying | accepted | discarded
```

Any worktree change after verification removes the effective `verified` state. `accepted` and
`discarded` are final.

## Verification Manifest V2

- Runtime is Bun with an exact version.
- Gate kinds are `install`, `typecheck`, `lint`, `build`, `unit`, `integration`, `coverage`,
  `accessibility`, `e2e`, and `visual`.
- Each command has executable, argument array, timeout, required flag, environment, and network
  policy.
- Only `install` may specify enabled network access and it must be
  `bun install --frozen-lockfile`.
- Optional app-server configuration defines command, arguments, health URL, timeout, environment,
  and browser base URL.
- Fingerprint inputs include `bun.lock`, root `package.json`, optional `bunfig.toml`, and package
  manifests referenced by approved gates.

## Verification Invariants

- Required gates must all have a latest passing result.
- Every required result and safety check must reference the current worktree digest.
- The diff must be non-empty.
- Secret scan, symlink confinement, and added-file-size checks must pass.
- Browser verification fails on external navigation, uncaught page errors, or unexpected
  `console.error`.
- Missing, failed, skipped, stale, or empty verification is never verified.

## Agent And Browser Interfaces

- The production implementation engine is `codex-local`; tests can provide a deterministic fake.
- Session turns accept text plus local screenshot inputs.
- App-owned dynamic browser tools return structured text and optional image content.
- Browser tools are limited to the session's localhost origin and do not expose arbitrary
  JavaScript evaluation.
- Agent exploration results are evidence, not gate results.

## Acceptance Contract

Acceptance:

1. Recomputes the worktree digest.
2. Requires it to match the passing verification snapshot.
3. Requires a non-empty diff and every safety check and required gate to pass.
4. Creates `code/<slug>-<id>` from the captured base SHA.
5. Creates one commit containing the verified tree.
6. Removes the worktree while leaving the local branch available.

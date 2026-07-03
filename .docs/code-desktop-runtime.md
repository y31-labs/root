# Code Desktop Runtime

## Local Data

On macOS, Code stores its MVP state under:

```text
~/Library/Application Support/dev.root.code/
```

The directory contains:

- `code-desktop.sqlite`: repositories, approved policies, sessions, approvals, gates, and evidence
  metadata.
- `worktrees/`: app-managed Git worktrees created from committed repository `HEAD` values.
- `sessions/`: patches, redacted command logs, screenshots, traces, and assertion artifacts.

Code never uses the source repository's dirty working tree as session input. Acceptance creates a
local branch in the source repository, then removes only the app-managed worktree.

## Flow Coverage Evidence

E2E verification gates receive the session artifact directory mounted read/write at `/artifacts`.
Code also sets `CODE_FLOW_COVERAGE_REPORT=/artifacts/flow-coverage.json` for those gates.

Tests can write coverage evidence files under `/artifacts` and report them with this shape:

```json
{
  "version": 1,
  "scenarios": [
    {
      "flowId": "login",
      "scenarioId": "login-e2e",
      "status": "passed",
      "covers": [{ "kind": "state", "id": "start", "status": "passed" }],
      "evidence": [{ "kind": "screenshot", "label": "Signed in", "path": "login.png" }]
    }
  ]
}
```

Reported evidence paths must stay relative to `/artifacts`; absolute paths, parent segments, dot
segments, backslashes, and drive prefixes are rejected before artifacts are inserted.

## Verifier Image

The authoritative gate image is `code-agent-verifier:1`. It is local Docker state, separate from
the app-data directory. Containers started by Code are labeled with `code.session` and
`code.purpose` so interrupted sessions can clean them up deterministically.

Only the pinned install gate receives network access. Other gates and browser verification run
without external network access.

## Cleanup

Discard removes the selected session's app-managed worktree and session state. It does not remove
an accepted local branch.

For a complete local reset after quitting Code:

```sh
rm -rf "$HOME/Library/Application Support/dev.root.code"
docker image rm code-agent-verifier:1
```

Review accepted branches before deleting the app-data directory. They live in their source Git
repositories and are intentionally not removed by the reset.

## Distribution

Production builds target Apple Silicon macOS 13 or newer and emit `.app` and `.dmg` bundles.
Distribution builds require an Apple Developer ID Application signing identity and notarization
credentials supplied through the standard Tauri environment variables. Credentials must remain in
the developer keychain or CI secret store and must never be committed.

The checked-in configuration uses Tauri's `-` pseudo-identity for structurally valid local ad hoc
bundles. `APPLE_SIGNING_IDENTITY` overrides it for Developer ID distribution builds.

`bun run --filter code-desktop package:mvp` builds the bundles and requires both checks below to
pass. Local unsigned or ad hoc builds intentionally fail the Gatekeeper check.

```sh
codesign --verify --deep --strict Code.app
spctl --assess --type execute Code.app
```

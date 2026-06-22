# Flowguard VS Code

VS Code extension package for the Flowguard MVP. The package owns host integration,
workspace discovery, diagnostics, sidebar models, proposal decisions, Git impact payloads, and the
graph webview transport.

## Local Development

From the monorepo root:

```sh
bun run --filter flowguard-vscode typecheck
bun run --filter flowguard-vscode build
bun run --filter flowguard-vscode test
bun run flowguard:check
```

The build command writes `apps/flowguard-vscode/dist/extension.cjs`. `dist` is ignored; remove
it after verification when you need a clean tree:

```sh
bun -e "import { rmSync } from 'node:fs'; rmSync('apps/flowguard-vscode/dist', { recursive: true, force: true })"
```

Do not run or launch VS Code for the MVP test flow. The integration tests drive the host-independent
modules directly with deterministic fixture repositories.

## Fixture Repositories

Fixtures live under `test-fixtures/repositories`:

- `first-demonstration`: approved login flow plus a password-reset proposal.
- `with-invalid-documents`: valid login flow plus an invalid flow for diagnostics.
- `uninitialized`: repository without `.flowguard` for initialization coverage.

Tests copy fixtures to temporary directories and delete those copies after each run. Fixture files
under `test-fixtures` should remain static and reviewable.

## Current Runtime Wiring

BF-41 proves the integrated MVP module flow without VS Code APIs: initialize, discover, publish
diagnostics, open graph snapshots, review proposals, accept, reject, detect stale proposals, and
calculate advisory impact.

Activation still uses the earlier placeholder host registration. Remaining runtime work is to wire
VS Code `workspace.fs`, `WorkspaceEdit`, diagnostics collections, tree views, webview panels, and the
built-in Git extension API to the pure services already covered by tests.

# Behavior Flows Agent Work Packages

## Coordination

Each agent should receive:

- this document;
- the work package it owns;
- [contracts.md](./contracts.md);
- [architecture.md](./architecture.md);
- repository `AGENTS.md`.

Agents must report changed files, verification commands, and unresolved decisions. They should not
modify files owned by another active package.

Package dependencies are strict. Begin a dependent package only after its prerequisite is merged or
available in the working tree.

All dependency and package-manifest changes are serialized through the BF-00 or BF-41 integration
agent. Feature agents should report a required dependency instead of independently editing
`package.json` or `bun.lock`.

## Agent Kickoff Template

Use this prompt and replace `<WORK_PACKAGE>`:

```text
Implement <WORK_PACKAGE> from
.plans/behavior-flows-vscode/agent-work-packages.md.

Read:
- AGENTS.md
- .plans/behavior-flows-vscode/README.md
- .plans/behavior-flows-vscode/architecture.md
- .plans/behavior-flows-vscode/contracts.md
- the complete <WORK_PACKAGE> section

Stay inside the package ownership boundary. Do not run the application. Use bun/bunx only.
Implement the deliverables, add the required tests, run the narrow verification commands, and
report changed files plus any unresolved contract decisions.
```

Recommended first launches after BF-00 completes:

```text
Agent 1: BF-10 Contracts
Agent 2: BF-11 Extension Host Skeleton
```

## Wave 0: BF-00 Scaffold

**Owner:** one integration agent  
**Dependencies:** none

Owns:

```text
package.json
bun.lock
apps/behavior-flows-vscode/package.json
apps/behavior-flows-vscode/tsconfig.json
apps/behavior-flows-vscode/build configuration
packages/behavior-flow-contracts/package.json
packages/behavior-flow-contracts/tsconfig.json
packages/behavior-flow-engine/package.json
packages/behavior-flow-engine/tsconfig.json
```

Deliverables:

- Create package directories according to `.docs/package-creation.md`.
- Add minimal entrypoints and build/test/typecheck scripts.
- Add root `behavior-flows:check`.
- Add extension-development and extension-test fixture directories.
- Choose a VS Code-compatible bundling setup that works through `bun` commands.

Acceptance:

- Every package resolves workspace imports.
- Empty package typechecks and build commands pass.
- No feature behavior is implemented.

## Wave 1A: BF-10 Contracts

**Owner:** contracts agent  
**Dependencies:** BF-00

Owns:

```text
packages/behavior-flow-contracts/src/**
packages/behavior-flow-contracts/README.md
```

Deliverables:

- Implement all version `1` types and parsers.
- Implement semantic issues with stable codes and JSON paths.
- Implement canonical serialization and digest.
- Implement pure proposal application.
- Add comprehensive fixtures and tests.

Acceptance:

- Covers duplicate IDs, broken references, unsafe paths, unsupported versions, stale digests, and
  operation conflicts.
- Does not import VS Code, React, Git, or Node filesystem APIs.

## Wave 1B: BF-11 Extension Host Skeleton

**Owner:** extension agent  
**Dependencies:** BF-00

Owns:

```text
apps/behavior-flows-vscode/src/extension.ts
apps/behavior-flows-vscode/src/extension/services/**
apps/behavior-flows-vscode/src/test/host/**
apps/behavior-flows-vscode/package.json contributions only after coordination with BF-00
```

Deliverables:

- Activate only for workspaces or commands relevant to Behavior Flows.
- Register commands and placeholder providers.
- Add a repository-scoped service container with disposable ownership.
- Add extension-host smoke coverage.

Acceptance:

- Activation and deactivation leak no disposables.
- No domain parsing is duplicated in the extension.

## Wave 2A: BF-20 Graph Engine

**Owner:** graph agent  
**Dependencies:** BF-10

Owns:

```text
packages/behavior-flow-engine/src/**
packages/behavior-flow-engine/README.md
```

Deliverables:

- Project approved flows into graph contracts.
- Apply proposal overlays for visual diff.
- Produce reachability issues.
- Index source references and calculate direct impact.
- Add a deterministic layout adapter interface.

Acceptance:

- Stable IDs and ordering for equivalent input.
- Removed nodes remain renderable in proposal diff output.
- No VS Code or React dependency.

## Wave 2B: BF-21 Workspace Discovery And Diagnostics

**Owner:** workspace agent  
**Dependencies:** BF-10, BF-11

Owns:

```text
apps/behavior-flows-vscode/src/extension/workspace/**
apps/behavior-flows-vscode/src/extension/diagnostics/**
apps/behavior-flows-vscode/src/test/workspace/**
```

Deliverables:

- Discover configuration, flows, and proposals.
- Watch relevant files.
- Parse through the contracts package.
- Publish diagnostics and canonical repository snapshots.
- Handle multi-root workspaces explicitly.

Acceptance:

- Invalid files do not prevent valid flows from loading.
- File deletion and rename update state without reload.
- Watcher events are debounced and disposable.

## Wave 2C: BF-22 Sidebar And Commands

**Owner:** navigation agent  
**Dependencies:** BF-11, BF-21

Owns:

```text
apps/behavior-flows-vscode/src/extension/tree/**
apps/behavior-flows-vscode/src/extension/commands/**
apps/behavior-flows-vscode/src/test/tree/**
```

Deliverables:

- Flow and proposal Tree Views.
- Initialize, refresh, open-flow, and review-proposal commands.
- Context values for valid, invalid, affected, and proposed states.

Acceptance:

- Native VS Code surfaces remain useful before the graph webview exists.
- Commands produce actionable errors when no repository or flow is selected.

## Wave 3A: BF-30 Webview Transport

**Owner:** transport agent  
**Dependencies:** BF-11, BF-20

Owns:

```text
apps/behavior-flows-vscode/src/extension/webview/**
apps/behavior-flows-vscode/src/shared/messages/**
apps/behavior-flows-vscode/src/test/webview-transport/**
```

Deliverables:

- Secure webview creation and CSP.
- Typed host-to-webview and webview-to-host messages.
- Open, refresh, reveal-source, accept, and reject intents.
- Rehydrate the current canonical snapshot after reload.

Acceptance:

- Messages validate before use.
- Webview cannot request arbitrary file reads or writes.

## Wave 3B: BF-31 Graph Webview

**Owner:** UI agent  
**Dependencies:** BF-20, BF-30 message contract

Owns:

```text
apps/behavior-flows-vscode/src/webview/**
apps/behavior-flows-vscode/src/test/webview-ui/**
```

Deliverables:

- Read-only directed graph.
- Deterministic automatic layout.
- Diff semantics from `visual-language.md`.
- Selection inspector and accessible item list.
- Fit, zoom, search, and source-link interactions.

Acceptance:

- Uses VS Code theme variables and semantic status treatment.
- Does not write layout coordinates into flow documents.
- Graph and list expose equivalent information.

## Wave 3C: BF-32 Proposal Lifecycle

**Owner:** proposal agent  
**Dependencies:** BF-10, BF-21, BF-30

Owns:

```text
apps/behavior-flows-vscode/src/extension/proposals/**
apps/behavior-flows-vscode/src/test/proposals/**
```

Deliverables:

- Discover and validate pending proposals.
- Revalidate immediately before application.
- Apply accepted output with `WorkspaceEdit`.
- Delete a proposal only after the flow edit succeeds.
- Reject proposals without changing approved flows.

Acceptance:

- Stale proposals cannot apply.
- Partial failure preserves recoverable proposal state.
- Accept and reject are covered by extension tests.

## Wave 4A: BF-40 Git Impact

**Owner:** impact agent  
**Dependencies:** BF-20, BF-21

Owns:

```text
apps/behavior-flows-vscode/src/extension/git/**
apps/behavior-flows-vscode/src/test/git/**
```

Deliverables:

- Read changed repository paths from the built-in Git extension API.
- Calculate direct flow impact through the engine.
- Publish impact updates to the tree and webview.
- Degrade cleanly when Git integration is unavailable.

Acceptance:

- No shell process is required.
- UI labels impact as advisory.

## Wave 4B: BF-41 MVP Assembly

**Owner:** integration agent  
**Dependencies:** BF-20 through BF-40

Owns:

```text
apps/behavior-flows-vscode/src/test/e2e/**
apps/behavior-flows-vscode/test-fixtures/**
root Behavior Flows scripts
cross-package integration fixes
```

Deliverables:

- Build fixture repositories.
- Cover initialization, discovery, diagnostics, graph opening, proposal review, acceptance, rejection,
  stale proposals, and impact.
- Add package README and local development instructions.
- Ensure the full check command is deterministic.

Acceptance:

- The first demonstration in `README.md` passes automatically.
- Tests do not depend on Codex, network access, or a running application.
- No fixture or generated extension artifact remains after verification.

## Wave 5: BF-50 Codex Plugin

**Owner:** Codex integration agent  
**Dependencies:** BF-41

Owns:

```text
plugins/behavior-flows-codex/**
```

Deliverables:

- Scaffold a repo-local Codex plugin.
- Add a skill for behavior-impact review.
- Add an MCP server exposing approved-flow reads and proposal-only writes.
- Optionally add a trusted `Stop` hook that invokes impact analysis.

Acceptance:

- The plugin cannot call the proposal acceptance path.
- All writes are confined to `.product-flows/proposals/`.
- Codex can create a proposal consumed by the extension.

## Suggested Parallelism

```text
BF-00
  -> BF-10 || BF-11
  -> BF-20 || BF-21
  -> BF-22 || BF-30
  -> BF-31 || BF-32 || BF-40
  -> BF-41
  -> BF-50
```

BF-22 requires the BF-21 snapshot contract. BF-30 requires BF-20 and BF-11. Do not run BF-31 before
the graph and message contracts stabilize. Do not run BF-50 as a shortcut around the standalone
proposal lifecycle.

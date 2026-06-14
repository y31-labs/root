# Behavior Flows Implementation Roadmap

## Stage 0: Workspace Scaffold

Create the contracts package, engine package, VS Code extension app, root scripts, build pipeline,
and fixture directories. Establish one command that typechecks and tests all Behavior Flows work.

Target command:

```sh
bun run behavior-flows:check
```

## Stage 1: Contracts

Implement:

- version `1` flow and proposal types;
- runtime parsing;
- semantic validation;
- canonical serialization and digest;
- proposal application as a pure function;
- fixtures and tests.

Exit condition: valid, invalid, stale, and conflicting proposal fixtures are deterministic.

## Stage 2: Graph Engine

Implement:

- approved-flow projection;
- proposal overlay and graph diff;
- reachability warnings;
- source-reference index;
- changed-path impact results;
- deterministic layout adapter.

Exit condition: identical semantic input produces identical graph output and stable snapshots.

## Stage 3: Extension Foundation

Implement:

- activation;
- workspace discovery;
- file watching;
- diagnostics;
- commands;
- sidebar Tree View;
- extension-host test fixtures.

Exit condition: flows and errors appear correctly without opening a webview.

## Stage 4: Graph Webview

Implement:

- secure webview bootstrap;
- graph rendering;
- layout;
- selection inspector;
- keyboard-accessible item list;
- source navigation;
- VS Code theme integration.

Exit condition: one approved fixture flow can be inspected entirely from the extension.

## Stage 5: Proposal Review

Implement:

- proposal discovery;
- approved-versus-proposed overlay;
- stale proposal handling;
- accept and reject commands;
- atomic workspace edits;
- pending proposal indicators.

Exit condition: the complete first demonstration in `README.md` passes as an extension test.

## Stage 6: Change Impact

Implement:

- integration with VS Code Git state;
- changed-path collection;
- direct source-reference matching;
- affected-flow badges and filtered view;
- explicit advisory language.

Exit condition: fixture source changes mark only directly linked flows while never claiming
unmatched flows are proven safe.

## Stage 7: Codex Integration

After the standalone extension is useful, add:

- a repo-installable Codex plugin;
- a flow-maintenance skill;
- read-only MCP tools for approved flows and impact;
- a write tool restricted to proposal files;
- an optional `Stop` hook that requests proposal generation.

Exit condition: Codex can produce a valid proposal that the extension reviews, but cannot approve it.

## Stage 8: Executable Behavior

Post-MVP exploration:

- execution metadata;
- path compilation;
- Playwright adapter;
- affected-path selection;
- evidence and results;
- stale execution handling.

Do not begin Stage 8 until teams maintain approved visual flows during ordinary feature work.


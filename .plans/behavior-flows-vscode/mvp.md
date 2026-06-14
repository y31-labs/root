# Behavior Flows MVP

## Goal

Prove that reviewing a visual behavior diff beside a code change is useful before investing in
browser recording or executable E2E generation.

## Included

- A VS Code extension for local Git repositories.
- Discovery of `.product-flows/flows/*.json`.
- A versioned schema with runtime validation.
- VS Code diagnostics for invalid flow files.
- A sidebar listing flows, validation state, and proposal state.
- A read-only graph editor for one selected flow.
- Automatic graph layout with optional local viewport preferences.
- Source references from states and transitions to repository files.
- Basic Git change-impact analysis using changed paths and source references.
- Structured proposal files that remain separate from approved flows.
- A graph-diff view for added, modified, removed, and uncertain behavior.
- Explicit accept and reject actions.
- Applying an accepted proposal through a normal VS Code workspace edit.
- Unit tests for contracts and graph projection.
- Extension integration tests for discovery, diagnostics, proposal review, and application.

## Excluded

- Running the application.
- Browser recording or browser control.
- Playwright generation or execution.
- Screenshot and visual regression testing.
- Automatic proposal generation inside the extension.
- Cloud storage, accounts, collaboration, and analytics.
- Support for editors other than VS Code-compatible hosts.
- A free-form diagram canvas.
- Silent flow updates after file changes or commits.

## Primary Experience

1. **Initialize:** create `.product-flows/` with a sample or empty index.
2. **Discover:** list all valid and invalid flows in the sidebar.
3. **Inspect:** open a flow as a graph and inspect state or transition details.
4. **Assess impact:** show flows whose source references intersect the current Git diff.
5. **Review proposal:** compare approved and proposed behavior.
6. **Decide:** accept the proposal, reject it, or leave it pending.
7. **Commit normally:** approved flow files appear in Source Control with application changes.

## Required Commands

```text
Behavior Flows: Initialize Repository
Behavior Flows: Open Flow
Behavior Flows: Refresh
Behavior Flows: Show Affected Flows
Behavior Flows: Review Proposal
Behavior Flows: Accept Proposal
Behavior Flows: Reject Proposal
```

## Completion Criteria

- Opening a fixture repository discovers all flow files deterministically.
- Invalid JSON and invalid references appear as file diagnostics.
- A valid flow renders with deterministic nodes and edges.
- Renderer positions are not written into approved behavior files.
- A changed source path marks linked flows as potentially affected.
- A proposal cannot overwrite approved files without an explicit accept action.
- Accepting a proposal produces the expected flow-file edit and removes the pending proposal.
- Rejecting a proposal leaves approved files unchanged.
- Closing and reopening VS Code reconstructs flows and pending proposals from repository state.
- The extension works without Codex, network access, or a running application.
- All package checks pass through one root verification command.

## MVP Success Signal

During a real feature change, a developer can understand and approve the user-visible behavior delta
faster from the graph diff than from the code diff alone.


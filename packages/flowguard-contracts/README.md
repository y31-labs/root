# Flowguard Contracts

Host-independent contracts for Flowguard documents.

This package owns version `1` domain types, parsing, semantic validation, canonical JSON
serialization, SHA-256 digests, and pure proposal application. It does not import VS Code, React,
Git, filesystem APIs, or app code.

## Public API

- `parseFlowguardConfig`, `parseFlowguardFlow`, `parseFlowProposal`
- `parseFlowguardConfigJson`, `parseFlowguardFlowJson`, `parseFlowProposalJson`
- `validateFlowguardConfig`, `validateFlowguardFlow`, `validateFlowProposal`
- `canonicalSerialize`, `serializeCanonicalJson`, `digestCanonicalJson`
- `digestFlowguardFlow`, `digestFlowProposal`, `digestFlowguardConfig`
- `applyFlowProposal`
- version `1` types for configs, approved Flowguard contracts, proposals, graph data, and impact results

Parsers return `{ ok, issues }` results instead of throwing. Warnings, such as unreachable states, do
not make parsing fail. Errors do.

## Issue Shape

Semantic issues have stable `code` values and JSON paths:

```ts
interface SemanticIssue {
  code: SemanticIssueCode;
  severity: 'error' | 'warning';
  path: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}
```

Paths use root `$` notation such as `$.states[0].id`.

## Proposal Application

`applyFlowProposal(baseFlow, proposal)` is pure. It recomputes the canonical digest for the approved
flow, rejects stale proposals, validates operations in order, validates the resulting flow, and
returns a cloned flow plus its new digest.

The caller remains responsible for file reads, writes, and proposal cleanup.

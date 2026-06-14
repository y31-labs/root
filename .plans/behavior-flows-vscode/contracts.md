# Behavior Flows Contracts

## Versioning

Every persisted document has a numeric `version`. Version `1` is the MVP format. Parsers must reject
unsupported future versions and expose an explicit migration function for supported older versions.

## Repository Configuration

`.product-flows/config.json`

```json
{
  "version": 1,
  "flowDirectory": "flows",
  "proposalDirectory": "proposals"
}
```

The MVP should also work with these defaults when `config.json` is absent.

## Approved Flow

`.product-flows/flows/login.json`

```json
{
  "version": 1,
  "id": "login",
  "name": "Sign in",
  "goal": "An existing user reaches their account",
  "entryStateId": "login-form",
  "states": [
    {
      "id": "login-form",
      "name": "Login form",
      "kind": "page",
      "route": "/login",
      "description": "Email and password fields are visible",
      "sources": ["src/routes/login.tsx"]
    },
    {
      "id": "account-home",
      "name": "Account home",
      "kind": "page",
      "route": "/account",
      "sources": ["src/routes/account.tsx"]
    }
  ],
  "transitions": [
    {
      "id": "submit-valid-credentials",
      "from": "login-form",
      "to": "account-home",
      "actor": "user",
      "action": "Submit valid credentials",
      "outcome": "The user is authenticated",
      "sources": ["src/server/auth.ts"]
    }
  ]
}
```

## Domain Types

```ts
type FlowStateKind = 'page' | 'dialog' | 'panel' | 'system' | 'terminal';
type FlowActor = 'user' | 'system' | 'external';

interface BehaviorFlow {
  version: 1;
  id: string;
  name: string;
  goal: string;
  entryStateId: string;
  states: FlowState[];
  transitions: FlowTransition[];
}

interface FlowState {
  id: string;
  name: string;
  kind: FlowStateKind;
  route?: string;
  description?: string;
  sources?: string[];
  tags?: string[];
}

interface FlowTransition {
  id: string;
  from: string;
  to: string;
  actor: FlowActor;
  action: string;
  condition?: string;
  outcome?: string;
  sources?: string[];
  tags?: string[];
}
```

## Semantic Rules

- IDs use lower-case kebab case and are unique within their scope.
- `entryStateId` references an existing state.
- Every transition references existing `from` and `to` states.
- A flow must have at least one state.
- A transition action must describe behavior, not an implementation call.
- Source paths are repository-relative POSIX paths without `..`.
- Duplicate transitions with the same actor, action, source, and target are invalid.
- Unreachable states produce warnings, not parse failures.
- States with no route are valid.
- Self-transitions are valid when observable state changes without navigation.

## Proposal

A proposal describes operations against one exact approved flow revision.

```json
{
  "version": 1,
  "id": "01JPROPOSAL",
  "flowId": "login",
  "baseDigest": "sha256:...",
  "createdAt": "2026-06-14T12:00:00.000Z",
  "producer": {
    "kind": "codex",
    "label": "Codex"
  },
  "summary": "Add password reset entry from the login form",
  "confidence": "medium",
  "operations": [
    {
      "op": "addState",
      "state": {
        "id": "password-reset",
        "name": "Password reset",
        "kind": "page",
        "route": "/forgot-password"
      },
      "reason": "The feature adds a new user-visible recovery state"
    },
    {
      "op": "addTransition",
      "transition": {
        "id": "open-password-reset",
        "from": "login-form",
        "to": "password-reset",
        "actor": "user",
        "action": "Choose forgot password"
      },
      "reason": "The login form exposes the new recovery action"
    }
  ]
}
```

## Proposal Operations

Version `1` supports:

```ts
type FlowProposalOperation =
  | { op: 'addState'; state: FlowState; reason: string }
  | { op: 'updateState'; stateId: string; patch: FlowStatePatch; reason: string }
  | { op: 'removeState'; stateId: string; reason: string }
  | { op: 'addTransition'; transition: FlowTransition; reason: string }
  | {
      op: 'updateTransition';
      transitionId: string;
      patch: FlowTransitionPatch;
      reason: string;
    }
  | { op: 'removeTransition'; transitionId: string; reason: string }
  | { op: 'updateFlow'; patch: FlowMetadataPatch; reason: string };
```

Patch objects contain only mutable fields and cannot change entity IDs. Renames require an explicit
remove and add in version `1`.

## Proposal Application

Application must:

1. Load the approved flow from disk.
2. Recompute its canonical digest.
3. Require the digest to equal `baseDigest`.
4. Validate each operation in order.
5. Validate the complete resulting flow.
6. Write the approved flow with stable formatting.
7. Remove the proposal only after the flow write succeeds.

A stale proposal remains pending and displays a conflict. It must never be rebased silently.

## Canonical Digest

The digest is SHA-256 over canonical JSON:

- object keys sorted recursively;
- arrays remain in semantic order;
- UTF-8 encoding;
- no insignificant whitespace;
- no presentation state.

## Graph Projection

```ts
interface BehaviorGraph {
  flowId: string;
  nodes: BehaviorGraphNode[];
  edges: BehaviorGraphEdge[];
  issues: GraphIssue[];
}

interface BehaviorGraphNode {
  id: string;
  stateId: string;
  label: string;
  kind: FlowStateKind;
  route?: string;
  status: 'unchanged' | 'added' | 'modified' | 'removed' | 'uncertain';
}

interface BehaviorGraphEdge {
  id: string;
  transitionId: string;
  source: string;
  target: string;
  label: string;
  actor: FlowActor;
  status: 'unchanged' | 'added' | 'modified' | 'removed' | 'uncertain';
}
```

## Impact Result

```ts
interface FlowImpact {
  flowId: string;
  level: 'direct' | 'possible' | 'none';
  matchedPaths: string[];
  reasons: string[];
}
```

`direct` means a changed path exactly matches a source reference. `possible` is reserved for future
heuristics. The MVP must not claim `none` as proof that behavior is unaffected.


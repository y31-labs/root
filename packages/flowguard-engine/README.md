# Flowguard Engine

Pure graph and impact helpers for Flowguard. This package depends on
`@workspace/flowguard-contracts` and has no VS Code or React dependency.

## Graph Projection

```ts
import { projectFlowguardGraph } from '@workspace/flowguard-engine';

const graph = projectFlowguardGraph(flow);
```

Projection returns the shared `FlowguardGraph` contract with deterministic node and edge IDs:

- nodes use `state:<stateId>`;
- edges use `transition:<transitionId>`;
- equivalent semantic input is ordered deterministically from the entry state;
- unreachable active states are reported as graph issues.

## Proposal Overlay

```ts
import { projectProposalOverlayGraph } from '@workspace/flowguard-engine';

const graph = projectProposalOverlayGraph(approvedFlow, proposal);
```

Proposal overlays keep approved and proposed behavior in one graph. Added, modified, removed, and
uncertain entities are marked through the graph `status` field. Removed states and transitions remain
in the output so a review UI can still render the diff.

## Source Impact

```ts
import { calculateFlowImpact, indexFlowSourceReferences } from '@workspace/flowguard-engine';

const index = indexFlowSourceReferences(flow);
const impact = calculateFlowImpact(flow, changedPaths);
```

Impact is exact and advisory for the MVP. A `direct` result means a changed repository path exactly
matches a state or transition source reference. A `none` result does not prove the flow is unaffected.

## Layout

```ts
import {
  createFlowguardGraphLayoutInput,
  type FlowguardGraphLayoutAdapter,
} from '@workspace/flowguard-engine';

const input = createFlowguardGraphLayoutInput(graph);
const result = await adapter.layout(input);
```

The engine defines deterministic layout input and output contracts but does not bundle a layout
library. Hosts can provide an adapter backed by ELK or another deterministic directed layout engine.

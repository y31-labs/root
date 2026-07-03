import { describe, expect, it } from 'vitest';

import type { TargetFlow, TargetFlowCoverageSummary } from '@workspace/code-agent-contracts/sessions';

import { flowToCanvas } from '#/lib/flow-workbench';

const coverage = (status: TargetFlowCoverageSummary['status']): TargetFlowCoverageSummary => ({
  status,
  required: status === 'missing' ? 1 : 2,
  covered: status === 'covered' ? 2 : status === 'partial' ? 1 : 0,
  missing: status === 'covered' ? 0 : 1,
  optional: 0,
  scenarios: [],
});

describe('flow workbench mapper', () => {
  it('maps Flowguard states and transitions to workflow canvas elements', () => {
    const flow: TargetFlow = {
      flowId: 'login',
      name: 'Login',
      goal: 'Sign in',
      relativePath: '.flowguard/flows/login.json',
      digest: 'sha256:fixture',
      sourcePaths: ['apps/code/src/login.tsx'],
      coverageScenarios: [],
      graph: {
        issues: [],
        nodes: [
          {
            id: 'state:start',
            stateId: 'start',
            label: 'Start',
            kind: 'page',
            route: '/login',
            status: 'unchanged',
            coverage: coverage('covered'),
          },
          {
            id: 'state:done',
            stateId: 'done',
            label: 'Done',
            kind: 'page',
            status: 'unchanged',
            coverage: coverage('missing'),
          },
        ],
        edges: [
          {
            id: 'transition:submit',
            transitionId: 'submit',
            source: 'state:start',
            target: 'state:done',
            label: 'Submit',
            actor: 'user',
            status: 'unchanged',
            coverage: coverage('covered'),
          },
        ],
      },
    };

    const graph = flowToCanvas(flow);

    expect(graph.nodes.map((node) => node.id)).toEqual(['state:start', 'state:done']);
    expect(graph.nodes[1]?.position).toEqual({ x: 300, y: 0 });
    expect(graph.edges).toMatchObject([
      {
        id: 'transition:submit',
        type: 'animated',
        ariaRole: 'button',
        className: 'flow-edge-transition-submit',
        data: { edge: { transitionId: 'submit' } },
      },
    ]);
  });
});

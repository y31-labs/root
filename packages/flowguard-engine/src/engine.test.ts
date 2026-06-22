import { describe, expect, test } from 'bun:test';

import { digestFlowguardFlow, type FlowguardFlow } from '@workspace/flowguard-contracts';
import {
  makeLoginFlowFixture,
  makePasswordResetProposalFixture,
} from '@workspace/flowguard-contracts/fixtures';

import {
  flowguardGraphEdgeId,
  flowguardGraphNodeId,
  calculateFlowImpact,
  createFlowguardGraphLayoutInput,
  indexFlowSourceReferences,
  makeRemoveAccountHomeProposalFixture,
  makeUnreachableHelpFlowFixture,
  projectFlowguardGraph,
  projectProposalOverlayGraph,
} from '#/index';

describe('Flowguard engine', () => {
  test('projects approved Flowguard contracts into stable graph nodes and edges', () => {
    const graph = projectFlowguardGraph(makeLoginFlowFixture());

    expect(graph.flowId).toBe('login');
    expect(graph.nodes.map((node) => node.id)).toEqual([
      flowguardGraphNodeId('login-form'),
      flowguardGraphNodeId('account-home'),
    ]);
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      flowguardGraphEdgeId('submit-valid-credentials'),
    ]);
    expect(graph.nodes.every((node) => node.status === 'unchanged')).toBe(true);
    expect(graph.edges.every((edge) => edge.status === 'unchanged')).toBe(true);
  });

  test('keeps graph ordering stable for equivalent shuffled input', () => {
    const flow = makeLoginFlowFixture();
    const shuffled: FlowguardFlow = {
      ...flow,
      states: [...flow.states].reverse(),
      transitions: [...flow.transitions].reverse(),
    };

    expect(projectFlowguardGraph(shuffled).nodes.map((node) => node.id)).toEqual(
      projectFlowguardGraph(flow).nodes.map((node) => node.id),
    );
    expect(projectFlowguardGraph(shuffled).edges.map((edge) => edge.id)).toEqual(
      projectFlowguardGraph(flow).edges.map((edge) => edge.id),
    );
  });

  test('overlays added proposal operations as visual diff statuses', async () => {
    const flow = makeLoginFlowFixture();
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(flow));
    const graph = projectProposalOverlayGraph(flow, proposal);

    expect(graph.nodes.map((node) => [node.stateId, node.status])).toEqual([
      ['login-form', 'unchanged'],
      ['account-home', 'unchanged'],
      ['password-reset', 'added'],
    ]);
    expect(graph.edges.map((edge) => [edge.transitionId, edge.status])).toEqual([
      ['submit-valid-credentials', 'unchanged'],
      ['open-password-reset', 'added'],
    ]);
  });

  test('keeps removed nodes and edges renderable in proposal overlays', async () => {
    const flow = makeLoginFlowFixture();
    const proposal = makeRemoveAccountHomeProposalFixture(await digestFlowguardFlow(flow));
    const graph = projectProposalOverlayGraph(flow, proposal);

    expect(graph.nodes.find((node) => node.stateId === 'account-home')?.status).toBe('removed');
    expect(
      graph.edges.find((edge) => edge.transitionId === 'submit-valid-credentials')?.status,
    ).toBe('removed');
  });

  test('produces reachability issues for unreachable states', () => {
    const graph = projectFlowguardGraph(makeUnreachableHelpFlowFixture());

    expect(graph.issues).toContainEqual({
      severity: 'warning',
      code: 'UNREACHABLE_STATE',
      path: '$.states[2].id',
      message: 'State "help-center" is not reachable from the entry state.',
      stateId: 'help-center',
    });
  });

  test('indexes source references and calculates exact direct impact', () => {
    const flow = makeLoginFlowFixture();
    const index = indexFlowSourceReferences(flow);

    expect(index.paths).toEqual([
      'src/routes/account.tsx',
      'src/routes/login.tsx',
      'src/server/auth.ts',
    ]);
    expect(calculateFlowImpact(flow, ['src/server/auth.ts', 'src/other.ts'])).toEqual({
      flowId: 'login',
      level: 'direct',
      matchedPaths: ['src/server/auth.ts'],
      reasons: [
        'Path "src/server/auth.ts" is referenced by transition "submit-valid-credentials".',
      ],
    });
    expect(calculateFlowImpact(flow, ['src/other.ts']).level).toBe('none');
  });

  test('creates deterministic layout adapter input without computing coordinates', () => {
    const graph = projectFlowguardGraph(makeLoginFlowFixture());
    const input = createFlowguardGraphLayoutInput(graph, { nodeWidth: 240, nodeHeight: 100 });

    expect(input).toEqual({
      flowId: 'login',
      direction: 'LR',
      nodes: [
        {
          id: flowguardGraphNodeId('login-form'),
          label: 'Login form',
          kind: 'page',
          status: 'unchanged',
          width: 240,
          height: 100,
        },
        {
          id: flowguardGraphNodeId('account-home'),
          label: 'Account home',
          kind: 'page',
          status: 'unchanged',
          width: 240,
          height: 100,
        },
      ],
      edges: [
        {
          id: flowguardGraphEdgeId('submit-valid-credentials'),
          source: flowguardGraphNodeId('login-form'),
          target: flowguardGraphNodeId('account-home'),
          label: 'Submit valid credentials',
          status: 'unchanged',
        },
      ],
    });
  });
});

import { describe, expect, test } from 'bun:test';

import type { FlowguardFlow, CanonicalDigest, FlowProposal } from '@workspace/flowguard-contracts';
import {
  makeLoginFlowFixture,
  makePasswordResetProposalFixture,
} from '@workspace/flowguard-contracts/fixtures';
import { projectFlowguardGraph, projectProposalOverlayGraph } from '@workspace/flowguard-engine';

import type {
  FlowguardOpenIntent,
  FlowguardWebviewSnapshot,
  FlowguardWebviewSourceReference,
} from '#/shared/messages';
import {
  createFlowguardGraphViewModel,
  createRevealSourceIntent,
  graphViewItemKey,
  nextSearchSelection,
} from '#/webview';

describe('Flowguard graph webview model', () => {
  test('lays out a read-only directed graph deterministically', () => {
    const snapshot = createSnapshot();
    const open = openFlow();
    const first = createFlowguardGraphViewModel({ snapshot, open });
    const second = createFlowguardGraphViewModel({ snapshot, open });

    expect(coordinates(first)).toEqual(coordinates(second));
    expect(first.layout?.viewBox).toBe(second.layout?.viewBox);

    const login = first.nodes.find((node) => node.semanticId === 'login-form');
    const account = first.nodes.find((node) => node.semanticId === 'account-home');
    expect(login?.layout.x).toBeLessThan(account?.layout.x ?? 0);
    expect(first.edges[0]?.layout.points.length).toBeGreaterThanOrEqual(2);
  });

  test('maps visual diff statuses to semantic non-color treatments', () => {
    const model = createFlowguardGraphViewModel({
      snapshot: createSnapshot(),
      open: openFlow('01JPROPOSAL'),
    });

    const addedState = model.nodes.find((node) => node.semanticId === 'password-reset');
    const addedTransition = model.edges.find((edge) => edge.semanticId === 'open-password-reset');

    expect(addedState?.status).toBe('added');
    expect(addedState?.statusPresentation).toMatchObject({
      label: 'Added',
      marker: '+',
      className: 'bf-status-added',
    });
    expect(addedTransition?.statusPresentation.marker).toBe('+');
    expect(model.nodes.every((node) => node.statusPresentation.marker.length > 0)).toBe(true);
    expect(model.edges.every((edge) => edge.statusPresentation.marker.length > 0)).toBe(true);
  });

  test('exposes equivalent graph and accessible list information', () => {
    const selectedKey = graphViewItemKey('node', 'state:login-form');
    const model = createFlowguardGraphViewModel({
      snapshot: createSnapshot(),
      open: openFlow('01JPROPOSAL'),
      selectedItemKey: selectedKey,
    });

    expect(model.items.map((item) => item.key)).toEqual(model.listItems.map((item) => item.key));
    expect(model.items.map((item) => item.ariaLabel)).toEqual(
      model.listItems.map((item) => item.summary),
    );
    expect(model.listItems.find((item) => item.key === selectedKey)?.selected).toBe(true);
    expect(model.inspector?.fields).toContainEqual({
      label: 'Semantic ID',
      value: 'login-form',
    });
  });

  test('keeps search and selection client-side', () => {
    const model = createFlowguardGraphViewModel({
      snapshot: createSnapshot(),
      open: openFlow('01JPROPOSAL'),
      searchQuery: 'password',
    });

    expect(model.search.matchCount).toBe(2);
    expect(model.selectedItem?.semanticId).toBe('password-reset');
    expect(nextSearchSelection(model, model.selectedItem?.key, 1)).toBe(
      graphViewItemKey('edge', 'transition:open-password-reset'),
    );
  });

  test('builds safe reveal-source intents for selected items', () => {
    const model = createFlowguardGraphViewModel({
      snapshot: createSnapshot(),
      open: openFlow('01JPROPOSAL'),
      selectedItemKey: graphViewItemKey('node', 'state:login-form'),
    });
    const selected = model.selectedItem;

    expect(model.document).toBeDefined();
    expect(selected).toBeDefined();
    if (model.document === undefined || selected === undefined) return;

    expect(selected.sources.map((source) => source.sourcePath)).toEqual(['src/routes/login.tsx']);
    expect(createRevealSourceIntent(model.document, selected, 'src/routes/login.tsx')).toEqual({
      rootUri: 'file:///repo',
      flowId: 'login',
      proposalId: '01JPROPOSAL',
      sourcePath: 'src/routes/login.tsx',
      target: {
        kind: 'state',
        stateId: 'login-form',
      },
    });
  });

  test('surfaces validation issues without inventing an invalid graph status', () => {
    const snapshot = createSnapshot({
      graphFlow: {
        ...makeLoginFlowFixture(),
        entryStateId: 'missing',
      },
    });
    const model = createFlowguardGraphViewModel({
      snapshot,
      open: openFlow(),
      selectedItemKey: graphViewItemKey('node', 'state:login-form'),
    });

    expect(model.globalIssues.map((issue) => issue.code)).toContain('BROKEN_REFERENCE');
    expect(model.nodes.map((node) => node.status)).toEqual(['unchanged', 'unchanged']);
  });
});

interface CreateSnapshotOptions {
  readonly graphFlow?: FlowguardFlow;
}

const fixedDigest = `sha256:${'0'.repeat(64)}` as CanonicalDigest;

const createSnapshot = (options: CreateSnapshotOptions = {}): FlowguardWebviewSnapshot => {
  const flow = makeLoginFlowFixture();
  const graphFlow = options.graphFlow ?? flow;
  const proposal = withProposalSources(makePasswordResetProposalFixture(fixedDigest));

  return {
    version: 1,
    sequence: 1,
    generatedAt: '2026-06-20T00:00:00.000Z',
    repositories: [
      {
        root: {
          uri: 'file:///repo',
          name: 'repo',
          index: 0,
        },
        flows: [
          {
            flowId: flow.id,
            name: flow.name,
            goal: flow.goal,
            relativePath: '.flowguard/flows/login.json',
            digest: fixedDigest,
            graph: projectFlowguardGraph(graphFlow),
            sourceReferences: sourceReferencesFromFlow(flow),
          },
        ],
        proposals: [
          {
            proposalId: proposal.id,
            flowId: proposal.flowId,
            summary: proposal.summary,
            confidence: proposal.confidence,
            relativePath: '.flowguard/proposals/password-reset.json',
            digest: fixedDigest,
            graph: projectProposalOverlayGraph(flow, proposal),
            sourceReferences: sourceReferencesFromProposal(proposal),
          },
        ],
        invalidDocuments: [],
      },
    ],
  };
};

const openFlow = (proposalId?: string): FlowguardOpenIntent => {
  return {
    rootUri: 'file:///repo',
    flowId: 'login',
    proposalId,
  };
};

const sourceReferencesFromFlow = (
  flow: FlowguardFlow,
): readonly FlowguardWebviewSourceReference[] => {
  return [
    ...flow.states.flatMap((state) =>
      state.sources === undefined
        ? []
        : [
            {
              target: {
                kind: 'state' as const,
                stateId: state.id,
              },
              label: state.name,
              sources: state.sources,
            },
          ],
    ),
    ...flow.transitions.flatMap((transition) =>
      transition.sources === undefined
        ? []
        : [
            {
              target: {
                kind: 'transition' as const,
                transitionId: transition.id,
              },
              label: transition.action,
              sources: transition.sources,
            },
          ],
    ),
  ];
};

const sourceReferencesFromProposal = (
  proposal: FlowProposal,
): readonly FlowguardWebviewSourceReference[] => {
  const references: FlowguardWebviewSourceReference[] = [];

  for (const operation of proposal.operations) {
    if (operation.op === 'addState' && operation.state.sources !== undefined) {
      references.push({
        target: {
          kind: 'state',
          stateId: operation.state.id,
        },
        label: operation.state.name,
        sources: operation.state.sources,
      });
    }

    if (operation.op === 'addTransition' && operation.transition.sources !== undefined) {
      references.push({
        target: {
          kind: 'transition',
          transitionId: operation.transition.id,
        },
        label: operation.transition.action,
        sources: operation.transition.sources,
      });
    }
  }

  return references;
};

const withProposalSources = (proposal: FlowProposal): FlowProposal => {
  return {
    ...proposal,
    operations: proposal.operations.map((operation) => {
      if (operation.op === 'addState') {
        return {
          ...operation,
          state: {
            ...operation.state,
            sources: ['src/routes/password-reset.tsx'],
          },
        };
      }

      if (operation.op === 'addTransition') {
        return {
          ...operation,
          transition: {
            ...operation.transition,
            sources: ['src/routes/login.tsx'],
          },
        };
      }

      return operation;
    }),
  };
};

const coordinates = (model: ReturnType<typeof createFlowguardGraphViewModel>) => {
  return {
    nodes: model.nodes.map((node) => ({
      id: node.graphId,
      x: node.layout.x,
      y: node.layout.y,
    })),
    edges: model.edges.map((edge) => ({
      id: edge.graphId,
      points: edge.layout.points,
    })),
  };
};

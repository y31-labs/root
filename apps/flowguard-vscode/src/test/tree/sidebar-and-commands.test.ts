import { describe, expect, test } from 'bun:test';

import {
  digestFlowguardFlow,
  digestFlowProposal,
  digestFlowguardConfig,
  errorIssue,
  makePasswordResetProposalFixture,
  makeFlowguardConfigFixture,
  type FlowguardFlow,
  type FlowProposal,
} from '@workspace/flowguard-contracts';

import {
  createFlowguardCommandHandlers,
  type FlowguardCommandEnvironment,
} from '#/extension/commands';
import { FLOWGUARD_COMMANDS } from '#/extension/services/constants';
import {
  FLOWGUARD_TREE_CONTEXT_VALUES,
  FlowguardTreeDataProvider,
  createFlowTreeItems,
  createProposalTreeItems,
  type FlowguardTreeItem,
} from '#/extension/tree';
import {
  FLOWGUARD_DIRECTORY,
  joinRepositoryUri,
  type FlowguardFlowDocumentSnapshot,
  type FlowguardWorkspaceSnapshot,
  type FlowProposalDocumentSnapshot,
  type InvalidFlowguardDocumentKind,
  type InvalidFlowguardDocumentSnapshot,
  type WorkspaceRoot,
} from '#/extension/workspace';

describe('Flowguard sidebar trees', () => {
  test('labels valid, invalid, affected, and proposed flows with context values', async () => {
    const root = createRoot();
    const login = makeFlow('login', 'Login', 'src/routes/login.tsx');
    const affected = makeFlow('account', 'Account', 'src/routes/account.tsx');
    const plain = makeFlow('help', 'Help', 'src/routes/help.tsx');
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(login));
    const snapshot = await createSnapshot(root, {
      flows: [login, affected, plain],
      proposals: [proposal],
      invalidDocuments: [createInvalidDocument(root, 'flow', 'broken.json')],
    });

    const items = createFlowTreeItems(snapshot, {
      changedPaths: ['src/routes/account.tsx'],
    });
    const flowContexts = contextByFlowId(items);

    expect(flowContexts.get('help')).toBe(FLOWGUARD_TREE_CONTEXT_VALUES.flowValid);
    expect(flowContexts.get('login')).toBe(FLOWGUARD_TREE_CONTEXT_VALUES.flowProposed);
    expect(flowContexts.get('account')).toBe(FLOWGUARD_TREE_CONTEXT_VALUES.flowAffected);
    expect(findInvalidItem(items)?.contextValue).toBe(FLOWGUARD_TREE_CONTEXT_VALUES.flowInvalid);
  });

  test('labels pending and invalid proposals with context values', async () => {
    const root = createRoot();
    const login = makeFlow('login', 'Login', 'src/routes/login.tsx');
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(login));
    const snapshot = await createSnapshot(root, {
      flows: [login],
      proposals: [proposal],
      invalidDocuments: [createInvalidDocument(root, 'proposal', 'stale.json')],
    });

    const items = createProposalTreeItems(snapshot);
    const proposedItem = items.find((item) => item.kind === 'proposal');
    const invalidItem = findInvalidItem(items);

    expect(proposedItem?.contextValue).toBe(FLOWGUARD_TREE_CONTEXT_VALUES.proposalProposed);
    expect(proposedItem?.description).toContain('Login');
    expect(invalidItem?.contextValue).toBe(FLOWGUARD_TREE_CONTEXT_VALUES.proposalInvalid);
  });

  test('providers expose current snapshot items without VS Code', async () => {
    const root = createRoot();
    const provider = new FlowguardTreeDataProvider();

    expect(provider.getChildren().map((item) => item.contextValue)).toEqual([
      FLOWGUARD_TREE_CONTEXT_VALUES.empty,
    ]);

    provider.updateSnapshot(
      await createSnapshot(root, {
        flows: [makeFlow('login', 'Login', 'src/routes/login.tsx')],
        proposals: [],
        invalidDocuments: [],
      }),
    );

    expect(provider.getChildren().map((item) => item.flowId)).toEqual(['login']);
  });
});

describe('Flowguard commands', () => {
  test('refreshes and opens flow and proposal documents before the graph webview exists', async () => {
    const root = createRoot();
    const login = makeFlow('login', 'Login', 'src/routes/login.tsx');
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(login));
    const snapshot = await createSnapshot(root, {
      flows: [login],
      proposals: [proposal],
      invalidDocuments: [],
    });
    const recording = createRecordingEnvironment(snapshot, [root]);
    const handlers = createFlowguardCommandHandlers(recording.environment);
    const flowItem = requireKind(createFlowTreeItems(snapshot), 'flow');
    const proposalItem = requireKind(createProposalTreeItems(snapshot), 'proposal');
    const flowUri = requireUri(flowItem);
    const proposalUri = requireUri(proposalItem);

    await handlers[FLOWGUARD_COMMANDS.refresh]();
    await handlers[FLOWGUARD_COMMANDS.openFlow](flowItem);
    await handlers[FLOWGUARD_COMMANDS.reviewProposal](flowItem);
    await handlers[FLOWGUARD_COMMANDS.reviewProposal](proposalItem);

    expect(recording.informationMessages).toEqual([
      'Flowguard refreshed: 1 flow, 1 proposal, 0 invalid documents.',
    ]);
    expect(recording.openedUris).toEqual([flowUri, proposalUri, proposalUri]);
  });

  test('initializes a selected repository and refreshes discovery', async () => {
    const root = createRoot();
    const snapshot = await createSnapshot(root, {
      flows: [],
      proposals: [],
      invalidDocuments: [],
    });
    const recording = createRecordingEnvironment(undefined, [root], snapshot);
    const handlers = createFlowguardCommandHandlers(recording.environment);

    await handlers[FLOWGUARD_COMMANDS.initializeRepository]({ rootUri: root.uri });

    expect(recording.initializedRoots.map((item) => item.uri)).toEqual([root.uri]);
    expect(recording.refreshCount).toBe(1);
    expect(recording.informationMessages).toEqual(['Initialized Flowguard in repo.']);
  });

  test('reports actionable errors when repository or flow selection is missing', async () => {
    const noWorkspace = createRecordingEnvironment(undefined, undefined);
    const noWorkspaceHandlers = createFlowguardCommandHandlers(noWorkspace.environment);

    await noWorkspaceHandlers[FLOWGUARD_COMMANDS.initializeRepository]();

    expect(noWorkspace.errorMessages).toEqual(['Open a workspace before initializing Flowguard.']);

    const root = createRoot();
    const snapshot = await createSnapshot(root, {
      flows: [
        makeFlow('login', 'Login', 'src/routes/login.tsx'),
        makeFlow('help', 'Help', 'src/routes/help.tsx'),
      ],
      proposals: [],
      invalidDocuments: [],
    });
    const missingSelection = createRecordingEnvironment(snapshot, [root]);
    const handlers = createFlowguardCommandHandlers(missingSelection.environment);

    await handlers[FLOWGUARD_COMMANDS.openFlow]();
    await handlers[FLOWGUARD_COMMANDS.reviewProposal]();

    expect(missingSelection.errorMessages).toEqual([
      'Select a flow in the Flowguard view before running Flowguard: Open Flow.',
      'No pending Flowguard proposals were found under .flowguard/proposals.',
    ]);
  });
});

const makeFlow = (id: string, name: string, sourcePath: string): FlowguardFlow => {
  return {
    version: 1,
    id,
    name,
    goal: `${name} can be completed`,
    entryStateId: `${id}-start`,
    states: [
      {
        id: `${id}-start`,
        name: `${name} start`,
        kind: 'page',
        route: `/${id}`,
        sources: [sourcePath],
      },
    ],
    transitions: [],
  };
};

const createRoot = (): WorkspaceRoot => {
  return { uri: 'file:///repo', name: 'repo', index: 0 };
};

const createSnapshot = async (
  root: WorkspaceRoot,
  options: {
    readonly flows: readonly FlowguardFlow[];
    readonly proposals: readonly FlowProposal[];
    readonly invalidDocuments: readonly InvalidFlowguardDocumentSnapshot[];
  },
): Promise<FlowguardWorkspaceSnapshot> => {
  const config = makeFlowguardConfigFixture();
  const flows = await Promise.all(options.flows.map((flow) => createFlowDocument(root, flow)));
  const proposals = await Promise.all(
    options.proposals.map((proposal) => createProposalDocument(root, proposal)),
  );

  return {
    version: 1,
    sequence: 1,
    generatedAt: '2026-06-20T00:00:00.000Z',
    repositories: [
      {
        root,
        config: {
          kind: 'config',
          root,
          uri: joinRepositoryUri(root.uri, FLOWGUARD_DIRECTORY, 'config.json'),
          relativePath: `${FLOWGUARD_DIRECTORY}/config.json`,
          source: 'default',
          valid: true,
          activeConfig: config,
          digest: await digestFlowguardConfig(config),
          issues: [],
        },
        flows,
        proposals,
        invalidDocuments: options.invalidDocuments,
        diagnosticDocuments: [],
        watchPatterns: [],
      },
    ],
  };
};

const createFlowDocument = async (
  root: WorkspaceRoot,
  flow: FlowguardFlow,
): Promise<FlowguardFlowDocumentSnapshot> => {
  const relativePath = `${FLOWGUARD_DIRECTORY}/flows/${flow.id}.json`;

  return {
    kind: 'flow',
    root,
    uri: joinRepositoryUri(root.uri, relativePath),
    relativePath,
    valid: true,
    document: flow,
    digest: await digestFlowguardFlow(flow),
    issues: [],
  };
};

const createProposalDocument = async (
  root: WorkspaceRoot,
  proposal: FlowProposal,
): Promise<FlowProposalDocumentSnapshot> => {
  const relativePath = `${FLOWGUARD_DIRECTORY}/proposals/${proposal.id}.json`;

  return {
    kind: 'proposal',
    root,
    uri: joinRepositoryUri(root.uri, relativePath),
    relativePath,
    valid: true,
    document: proposal,
    digest: await digestFlowProposal(proposal),
    issues: [],
  };
};

const createInvalidDocument = (
  root: WorkspaceRoot,
  kind: InvalidFlowguardDocumentKind,
  fileName: string,
): InvalidFlowguardDocumentSnapshot => {
  const directory = kind === 'proposal' ? 'proposals' : 'flows';
  const relativePath = `${FLOWGUARD_DIRECTORY}/${directory}/${fileName}`;

  return {
    kind,
    root,
    uri: joinRepositoryUri(root.uri, relativePath),
    relativePath,
    valid: false,
    issues: [errorIssue('INVALID_JSON', '$', 'Invalid JSON.')],
  };
};

const contextByFlowId = (items: readonly FlowguardTreeItem[]): ReadonlyMap<string, string> => {
  return new Map(
    items
      .filter((item) => item.kind === 'flow')
      .map((item) => [item.flowId ?? '', item.contextValue]),
  );
};

const findInvalidItem = (items: readonly FlowguardTreeItem[]): FlowguardTreeItem | undefined => {
  return items.find((item) => item.kind === 'invalid-document');
};

const requireKind = (
  items: readonly FlowguardTreeItem[],
  kind: FlowguardTreeItem['kind'],
): FlowguardTreeItem => {
  const item = items.find((entry) => entry.kind === kind);
  if (item === undefined) throw new Error(`Expected tree item kind ${kind}.`);
  return item;
};

const requireUri = (item: FlowguardTreeItem): string => {
  if (item.uri === undefined) throw new Error(`Expected tree item ${item.id} to have a URI.`);
  return item.uri;
};

const createRecordingEnvironment = (
  snapshot: FlowguardWorkspaceSnapshot | undefined,
  roots: readonly WorkspaceRoot[] | undefined,
  refreshSnapshot = snapshot,
): {
  readonly environment: FlowguardCommandEnvironment;
  readonly openedUris: string[];
  readonly informationMessages: string[];
  readonly errorMessages: string[];
  readonly initializedRoots: WorkspaceRoot[];
  readonly refreshCount: number;
} => {
  const openedUris: string[] = [];
  const informationMessages: string[] = [];
  const errorMessages: string[] = [];
  const initializedRoots: WorkspaceRoot[] = [];
  let activeSnapshot = snapshot;
  let refreshCount = 0;

  return {
    environment: {
      workspace: {
        getSnapshot: () => activeSnapshot,
        getWorkspaceRoots: () => roots,
        refresh: async () => {
          refreshCount += 1;
          activeSnapshot = refreshSnapshot;
          if (activeSnapshot === undefined) {
            throw new Error('No snapshot was configured for refresh.');
          }
          return activeSnapshot;
        },
      },
      presenter: {
        showInformationMessage: (message) => {
          informationMessages.push(message);
        },
        showErrorMessage: (message) => {
          errorMessages.push(message);
        },
      },
      opener: {
        openDocument: (uri) => {
          openedUris.push(uri);
        },
      },
      initializer: {
        initializeRepository: (root) => {
          initializedRoots.push(root);
          return { root };
        },
      },
    },
    openedUris,
    informationMessages,
    errorMessages,
    initializedRoots,
    get refreshCount() {
      return refreshCount;
    },
  };
};

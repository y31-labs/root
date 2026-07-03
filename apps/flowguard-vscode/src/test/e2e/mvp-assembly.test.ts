import { describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseFlowguardFlowJson,
  serializeCanonicalJson,
  type FlowguardFlow,
} from '@workspace/flowguard-contracts';

import { FlowguardDiagnosticsPublisher } from '#/extension/diagnostics';
import type { FlowguardDiagnostic, FlowguardDiagnosticSink } from '#/extension/diagnostics';
import { createFlowguardGitImpactUpdate, type GitChangedPathSnapshot } from '#/extension/git';
import {
  acceptFlowProposal,
  discoverPendingFlowProposals,
  rejectFlowProposal,
  type AcceptFlowProposalResult,
  type FlowProposalLifecycleHost,
  type FlowProposalWorkspaceEdit,
} from '#/extension/proposals';
import { type DisposableLike } from '#/extension/services/disposables';
import {
  FLOWGUARD_TREE_CONTEXT_VALUES,
  createFlowTreeItems,
  createProposalTreeItems,
  type FlowguardTreeItem,
} from '#/extension/tree';
import {
  createFlowguardWebviewTransport,
  type FlowguardCreateWebviewPanelRequest,
  type FlowguardWebviewLike,
  type FlowguardWebviewPanelFactory,
  type FlowguardWebviewPanelLike,
  type FlowguardWebviewTransport,
} from '#/extension/webview';
import {
  FlowguardWorkspaceService,
  initializeFlowguardRepository,
  joinRepositoryUri,
  FLOWGUARD_DIRECTORY,
  type FlowguardRepositorySnapshot,
  type FlowguardWorkspaceSnapshot,
  type WorkspaceDirectoryEntry,
  type WorkspaceFileSystem,
  type WorkspaceRoot,
  type FlowguardRepositoryInitializationFileSystem,
} from '#/extension/workspace';
import {
  flowguardMessageProtocol,
  flowguardMessageVersion,
  parseFlowguardHostToWebviewMessage,
  type FlowguardHostToWebviewMessage,
  type FlowguardWebviewSnapshot,
  type FlowguardWebviewToHostMessage,
} from '#/shared/messages';

const fixedNow = '2026-06-20T00:00:00.000Z';
const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixtureRepositoriesRoot = join(packageRoot, 'test-fixtures', 'repositories');

describe('BF-41 MVP assembly', () => {
  test('runs the README first demonstration through fixture-driven modules', async () => {
    await withFixtureRepository('first-demonstration', async ({ root }) => {
      const host = new NodeFlowguardHost();
      const diagnostics = new RecordingDiagnosticSink();
      const service = createWorkspaceService(root, host, diagnostics);
      const snapshot = await service.start();
      const repository = requireRepository(snapshot);
      const flow = requireFlow(repository, 'login');
      const proposal = requireProposal(repository, '01JPROPOSAL');

      expect(repository.invalidDocuments).toEqual([]);
      expect(repository.flows.map((item) => item.document.id)).toEqual(['login']);
      expect(repository.proposals.map((item) => item.document.id)).toEqual(['01JPROPOSAL']);
      expect(diagnostics.entries.get(flow.uri)).toEqual([]);

      const flowItem = requireTreeItem(createFlowTreeItems(snapshot), 'flow', 'login');
      expect(flowItem.label).toBe('Sign in');
      expect(flowItem.contextValue).toBe(FLOWGUARD_TREE_CONTEXT_VALUES.flowProposed);
      expect(
        requireTreeItem(createProposalTreeItems(snapshot), 'proposal', '01JPROPOSAL').label,
      ).toBe('Add password reset entry from the login form');

      const pending = await discoverPendingFlowProposals(snapshot);
      expect(pending.map((item) => item.status)).toEqual(['ready']);

      const impact = createFlowguardGitImpactUpdate({
        workspaceSnapshot: snapshot,
        changedPaths: changedPaths(root, ['src/server/auth.ts']),
        generatedAt: fixedNow,
      });
      expect(impact.webview.repositories[0]?.flows[0]?.impact?.level).toBe('direct');
      expect(impact.webview.repositories[0]?.flows[0]?.impact?.matchedPaths).toEqual([
        'src/server/auth.ts',
      ]);

      const factory = new FakePanelFactory();
      let accepted: AcceptFlowProposalResult | undefined;
      let transport: FlowguardWebviewTransport;
      transport = createFlowguardWebviewTransport({
        panelFactory: factory,
        nonce: 'fixed-nonce',
        handlers: {
          acceptProposal: async (intent) => {
            const result = await acceptFlowProposal({
              host,
              repository: intent.repository,
              proposal: intent.proposal,
              flow: intent.flow,
            });
            if (result.ok) {
              await transport.publishSnapshot(await service.refresh());
            }
            accepted = result;
          },
        },
      });

      await transport.publishSnapshot(snapshot);
      await transport.open({ rootUri: root.uri, flowId: 'login' });

      const webviewSnapshot = requireLastWebviewSnapshot(factory.currentPanel.webview.messages);
      const webviewRepository = requireWebviewRepository(webviewSnapshot);
      const webviewFlow = webviewRepository.flows[0];
      expect(webviewFlow?.graph.nodes.map((node) => node.stateId)).toEqual([
        'login-form',
        'account-home',
      ]);
      expect(webviewFlow?.graph.edges.map((edge) => edge.transitionId)).toEqual([
        'submit-valid-credentials',
      ]);

      await transport.open({
        rootUri: root.uri,
        flowId: 'login',
        proposalId: proposal.document.id,
      });

      const proposalGraph = webviewRepository.proposals[0]?.graph;
      expect(proposalGraph?.nodes.find((node) => node.stateId === 'password-reset')?.status).toBe(
        'added',
      );
      expect(
        proposalGraph?.edges.find((edge) => edge.transitionId === 'open-password-reset')?.status,
      ).toBe('added');
      expect(
        requireLastHostMessage(factory.currentPanel.webview.messages, 'host/open').payload,
      ).toEqual({
        rootUri: root.uri,
        flowId: 'login',
        proposalId: '01JPROPOSAL',
      });

      factory.currentPanel.webview.emit(
        webviewMessage('intent/accept', {
          rootUri: root.uri,
          proposalId: proposal.document.id,
        }),
      );
      await waitFor(() => accepted !== undefined, 'Expected accept handler to finish.');

      expect(accepted?.ok).toBe(true);
      expect(host.operations).toContain('applyEdit');
      expect(host.hasFile(proposal.uri)).toBe(false);
      const acceptedFlow = parseFlow(host.requireText(flow.uri));
      expect(acceptedFlow.states.map((state) => state.id)).toEqual([
        'login-form',
        'account-home',
        'password-reset',
      ]);
      expect(acceptedFlow.transitions.map((transition) => transition.id)).toContain(
        'open-password-reset',
      );
      expect(service.snapshot?.repositories[0]?.proposals).toEqual([]);

      transport.dispose();
      service.dispose();
    });
  });

  test('initializes an empty fixture repository without launching VS Code', async () => {
    await withFixtureRepository('uninitialized', async ({ root }) => {
      const host = new NodeFlowguardHost();
      const result = await initializeFlowguardRepository({ root, fs: host });

      expect(result.configWritten).toBe(true);
      expect(host.hasFile(result.configUri)).toBe(true);
      expect(existsSync(fileURLToPath(result.flowDirectoryUri))).toBe(true);
      expect(existsSync(fileURLToPath(result.proposalDirectoryUri))).toBe(true);
      expect(existsSync(fileURLToPath(result.coverageDirectoryUri))).toBe(true);

      const secondResult = await initializeFlowguardRepository({ root, fs: host });
      expect(secondResult.configWritten).toBe(false);

      const service = createWorkspaceService(root, host);
      const snapshot = await service.start();
      const repository = requireRepository(snapshot);

      expect(repository.config.source).toBe('file');
      expect(repository.flows).toEqual([]);
      expect(repository.proposals).toEqual([]);

      service.dispose();
    });
  });

  test('surfaces fixture diagnostics while keeping valid flows discoverable', async () => {
    await withFixtureRepository('with-invalid-documents', async ({ root }) => {
      const host = new NodeFlowguardHost();
      const diagnostics = new RecordingDiagnosticSink();
      const service = createWorkspaceService(root, host, diagnostics);
      const snapshot = await service.start();
      const repository = requireRepository(snapshot);
      const brokenUri = joinRepositoryUri(
        root.uri,
        FLOWGUARD_DIRECTORY,
        'flows',
        'broken-login.json',
      );

      expect(repository.flows.map((flow) => flow.document.id)).toEqual(['login']);
      expect(repository.invalidDocuments.map((document) => document.relativePath)).toEqual([
        '.flowguard/flows/broken-login.json',
      ]);
      expect(diagnostics.entries.get(brokenUri)?.map((diagnostic) => diagnostic.code)).toEqual([
        'BROKEN_REFERENCE',
      ]);
      expect(requireTreeItem(createFlowTreeItems(snapshot), 'invalid-document').contextValue).toBe(
        FLOWGUARD_TREE_CONTEXT_VALUES.flowInvalid,
      );

      service.dispose();
    });
  });

  test('rejects a proposal by deleting only the proposal fixture file', async () => {
    await withFixtureRepository('first-demonstration', async ({ root }) => {
      const host = new NodeFlowguardHost();
      const service = createWorkspaceService(root, host);
      const snapshot = await service.start();
      const repository = requireRepository(snapshot);
      const flow = requireFlow(repository, 'login');
      const proposal = requireProposal(repository, '01JPROPOSAL');
      const originalFlowText = host.requireText(flow.uri);
      host.operations.length = 0;

      const result = await rejectFlowProposal({ host, proposal });

      expect(result.ok).toBe(true);
      expect(host.hasFile(proposal.uri)).toBe(false);
      expect(host.requireText(flow.uri)).toBe(originalFlowText);
      expect(host.operations).toEqual([`read:${proposal.uri}`, `delete:${proposal.uri}`]);

      const refreshed = await service.refresh();
      expect(requireRepository(refreshed).proposals).toEqual([]);

      service.dispose();
    });
  });

  test('keeps stale proposals pending when the approved Flowguard contract has changed', async () => {
    await withFixtureRepository('first-demonstration', async ({ root }) => {
      const host = new NodeFlowguardHost();
      const service = createWorkspaceService(root, host);
      const initialSnapshot = await service.start();
      const initialRepository = requireRepository(initialSnapshot);
      const flow = requireFlow(initialRepository, 'login');
      const proposal = requireProposal(initialRepository, '01JPROPOSAL');

      host.writeFlow(flow.uri, addHelpCenterState(flow.document));
      const staleSnapshot = await service.refresh();
      const staleRepository = requireRepository(staleSnapshot);
      const staleProposal = requireProposal(staleRepository, '01JPROPOSAL');
      const pending = await discoverPendingFlowProposals(staleSnapshot);

      expect(pending.map((item) => item.status)).toEqual(['stale']);

      const result = await acceptFlowProposal({
        host,
        repository: staleRepository,
        proposal: staleProposal,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected stale proposal acceptance to fail.');
      expect(result.code).toBe('APPLICATION_REJECTED');
      expect(result.issues?.map((issue) => issue.code)).toContain('STALE_DIGEST');
      expect(host.hasFile(proposal.uri)).toBe(true);
      expect(parseFlow(host.requireText(flow.uri)).states.map((state) => state.id)).toEqual([
        'login-form',
        'account-home',
        'help-center',
      ]);

      service.dispose();
    });
  });
});

const createWorkspaceService = (
  root: WorkspaceRoot,
  fs: WorkspaceFileSystem,
  diagnostics?: FlowguardDiagnosticSink,
): FlowguardWorkspaceService => {
  return new FlowguardWorkspaceService({
    workspaceRoots: [root],
    fs,
    diagnostics:
      diagnostics === undefined ? undefined : new FlowguardDiagnosticsPublisher(diagnostics),
    clock: () => fixedNow,
  });
};

const withFixtureRepository = async (
  fixtureName: string,
  callback: (context: { readonly root: WorkspaceRoot; readonly path: string }) => Promise<void>,
): Promise<void> => {
  const source = join(fixtureRepositoriesRoot, fixtureName);
  const temporaryParent = mkdtempSync(join(tmpdir(), 'flowguard-vscode-'));
  const repositoryPath = join(temporaryParent, fixtureName);
  cpSync(source, repositoryPath, { recursive: true, errorOnExist: true });

  try {
    await callback({
      root: {
        uri: pathToFileURL(repositoryPath).toString(),
        name: fixtureName,
        index: 0,
      },
      path: repositoryPath,
    });
  } finally {
    rmSync(temporaryParent, { recursive: true, force: true });
  }
};

const changedPaths = (root: WorkspaceRoot, paths: readonly string[]): GitChangedPathSnapshot => {
  return {
    status: 'available',
    advisory: true,
    label: 'Advisory Git impact',
    repositories: [
      {
        rootUri: root.uri,
        changedPaths: paths,
      },
    ],
    changedPaths: paths,
  };
};

const addHelpCenterState = (flow: FlowguardFlow): FlowguardFlow => {
  return {
    ...flow,
    states: [
      ...flow.states,
      {
        id: 'help-center',
        name: 'Help center',
        kind: 'page',
        route: '/help',
      },
    ],
  };
};

const parseFlow = (text: string): FlowguardFlow => {
  const parsed = parseFlowguardFlowJson(text);
  if (!parsed.ok) {
    throw new Error(`Expected valid flow fixture: ${parsed.issues[0]?.message}`);
  }

  return parsed.value;
};

const requireRepository = (snapshot: FlowguardWorkspaceSnapshot): FlowguardRepositorySnapshot => {
  const repository = snapshot.repositories[0];
  if (repository === undefined) throw new Error('Expected a repository snapshot.');
  return repository;
};

const requireFlow = (repository: FlowguardRepositorySnapshot, flowId: string) => {
  const flow = repository.flows.find((item) => item.document.id === flowId);
  if (flow === undefined) throw new Error(`Expected flow ${flowId}.`);
  return flow;
};

const requireProposal = (repository: FlowguardRepositorySnapshot, proposalId: string) => {
  const proposal = repository.proposals.find((item) => item.document.id === proposalId);
  if (proposal === undefined) throw new Error(`Expected proposal ${proposalId}.`);
  return proposal;
};

const requireTreeItem = (
  items: readonly FlowguardTreeItem[],
  kind: FlowguardTreeItem['kind'],
  id?: string,
): FlowguardTreeItem => {
  const item = items.find((candidate) => {
    if (candidate.kind !== kind) return false;
    if (id === undefined) return true;
    return candidate.flowId === id || candidate.proposalId === id;
  });
  if (item === undefined) throw new Error(`Expected tree item ${kind} ${id ?? ''}.`);
  return item;
};

const requireWebviewRepository = (
  snapshot: FlowguardWebviewSnapshot,
): FlowguardWebviewSnapshot['repositories'][number] => {
  const repository = snapshot.repositories[0];
  if (repository === undefined) throw new Error('Expected webview repository snapshot.');
  return repository;
};

const requireLastWebviewSnapshot = (messages: readonly unknown[]): FlowguardWebviewSnapshot => {
  return requireLastHostMessage(messages, 'host/snapshot').payload;
};

const requireLastHostMessage = <TType extends FlowguardHostToWebviewMessage['type']>(
  messages: readonly unknown[],
  type: TType,
): Extract<FlowguardHostToWebviewMessage, { readonly type: TType }> => {
  for (const message of [...messages].reverse()) {
    const parsed = parseFlowguardHostToWebviewMessage(message);
    if (parsed.ok && parsed.value.type === type) {
      return parsed.value as Extract<FlowguardHostToWebviewMessage, { readonly type: TType }>;
    }
  }

  throw new Error(`Expected host message ${type}.`);
};

const webviewMessage = <TType extends FlowguardWebviewToHostMessage['type']>(
  type: TType,
  payload: Extract<FlowguardWebviewToHostMessage, { readonly type: TType }>['payload'],
): FlowguardWebviewToHostMessage => {
  return {
    protocol: flowguardMessageProtocol,
    version: flowguardMessageVersion,
    type,
    payload,
  } as FlowguardWebviewToHostMessage;
};

const waitFor = async (condition: () => boolean, message: string): Promise<void> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  throw new Error(message);
};

class NodeFlowguardHost
  implements
    WorkspaceFileSystem,
    FlowProposalLifecycleHost,
    FlowguardRepositoryInitializationFileSystem
{
  readonly operations: string[] = [];
  readonly appliedEdits: FlowProposalWorkspaceEdit[] = [];

  async readFile(uri: string): Promise<string> {
    this.operations.push(`read:${uri}`);
    return this.requireText(uri);
  }

  async readDirectory(uri: string): Promise<readonly WorkspaceDirectoryEntry[]> {
    return readdirSync(fileURLToPath(uri), { withFileTypes: true })
      .map((entry) => {
        const type: WorkspaceDirectoryEntry['type'] = entry.isDirectory()
          ? 'directory'
          : entry.isFile()
            ? 'file'
            : 'unknown';

        return {
          name: entry.name,
          type,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async createDirectory(uri: string): Promise<void> {
    mkdirSync(fileURLToPath(uri), { recursive: true });
  }

  async writeFile(uri: string, text: string): Promise<void> {
    const path = fileURLToPath(uri);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
  }

  async applyEdit(edit: FlowProposalWorkspaceEdit): Promise<boolean> {
    this.operations.push('applyEdit');
    this.appliedEdits.push(edit);

    for (const change of edit.documentChanges) {
      await this.writeFile(change.uri, change.text);
    }

    return true;
  }

  async deleteFile(uri: string): Promise<void> {
    this.operations.push(`delete:${uri}`);
    rmSync(fileURLToPath(uri));
  }

  hasFile(uri: string): boolean {
    return existsSync(fileURLToPath(uri));
  }

  requireText(uri: string): string {
    return readFileSync(fileURLToPath(uri), 'utf8');
  }

  writeFlow(uri: string, flow: FlowguardFlow): void {
    writeFileSync(fileURLToPath(uri), `${serializeCanonicalJson(flow)}\n`, 'utf8');
  }
}

class RecordingDiagnosticSink implements FlowguardDiagnosticSink {
  readonly entries = new Map<string, readonly FlowguardDiagnostic[]>();

  set(uri: string, diagnostics: readonly FlowguardDiagnostic[]): void {
    this.entries.set(uri, [...diagnostics]);
  }

  delete(uri: string): void {
    this.entries.delete(uri);
  }
}

class FakePanelFactory implements FlowguardWebviewPanelFactory {
  readonly requests: FlowguardCreateWebviewPanelRequest[] = [];
  readonly panels: FakePanel[] = [];

  get currentPanel(): FakePanel {
    const panel = this.panels.at(-1);
    if (panel === undefined) throw new Error('Expected a webview panel.');
    return panel;
  }

  createWebviewPanel(request: FlowguardCreateWebviewPanelRequest): FlowguardWebviewPanelLike {
    this.requests.push(request);
    const panel = new FakePanel();
    this.panels.push(panel);
    return panel;
  }
}

class FakePanel implements FlowguardWebviewPanelLike {
  readonly webview = new FakeWebview();
  readonly #disposeListeners = new Set<() => void>();
  disposed = false;
  revealCalls = 0;

  reveal(): void {
    this.revealCalls += 1;
  }

  onDidDispose(listener: () => void): DisposableLike {
    this.#disposeListeners.add(listener);
    return {
      dispose: () => {
        this.#disposeListeners.delete(listener);
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const listener of [...this.#disposeListeners]) listener();
    this.#disposeListeners.clear();
  }
}

class FakeWebview implements FlowguardWebviewLike {
  readonly cspSource = 'vscode-webview-resource:';
  readonly #messageListeners = new Set<(message: unknown) => void>();
  html = '';
  messages: unknown[] = [];

  postMessage(message: unknown): boolean {
    this.messages.push(message);
    return true;
  }

  onDidReceiveMessage(listener: (message: unknown) => void): DisposableLike {
    this.#messageListeners.add(listener);
    return {
      dispose: () => {
        this.#messageListeners.delete(listener);
      },
    };
  }

  emit(message: unknown): void {
    for (const listener of [...this.#messageListeners]) listener(message);
  }
}

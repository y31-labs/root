import { describe, expect, test } from 'bun:test';

import {
  digestFlowguardFlow,
  digestFlowProposal,
  digestFlowguardConfig,
  makeLoginFlowFixture,
  makePasswordResetProposalFixture,
  makeFlowguardConfigFixture,
} from '@workspace/flowguard-contracts';

import type { DisposableLike } from '#/extension/services/disposables';
import {
  FLOWGUARD_WEBVIEW_VIEW_TYPE,
  createFlowguardWebviewTransport,
  type FlowguardCreateWebviewPanelRequest,
  type FlowguardResolvedOpenIntent,
  type FlowguardResolvedProposalDecisionIntent,
  type FlowguardResolvedRevealSourceIntent,
  type FlowguardWebviewLike,
  type FlowguardWebviewPanelFactory,
  type FlowguardWebviewPanelLike,
} from '#/extension/webview';
import {
  FLOWGUARD_WATCH_PATTERN,
  type FlowguardWorkspaceSnapshot,
  type WorkspaceRoot,
} from '#/extension/workspace';
import {
  flowguardMessageProtocol,
  flowguardMessageVersion,
  isSafeRepositoryRelativePath,
  parseFlowguardHostToWebviewMessage,
  parseFlowguardWebviewToHostMessage,
  type FlowguardWebviewToHostMessage,
} from '#/shared/messages';

describe('Flowguard webview transport', () => {
  test('validates webview messages before use', () => {
    const valid = parseFlowguardWebviewToHostMessage(webviewMessage('intent/refresh', {}));
    expect(valid.ok).toBe(true);

    const readFile = parseFlowguardWebviewToHostMessage({
      protocol: flowguardMessageProtocol,
      version: flowguardMessageVersion,
      type: 'intent/read-file',
      payload: {
        uri: 'file:///secret.txt',
      },
    });
    expect(readFile.ok).toBe(false);

    const unsafeReveal = parseFlowguardWebviewToHostMessage(
      webviewMessage('intent/reveal-source', {
        rootUri: 'file:///repo',
        flowId: 'login',
        sourcePath: '../secret.txt',
      }),
    );
    expect(unsafeReveal.ok).toBe(false);
    expect(isSafeRepositoryRelativePath('src/routes/login.tsx')).toBe(true);
    expect(isSafeRepositoryRelativePath('/absolute/path.ts')).toBe(false);
  });

  test('creates a script-enabled webview with strict CSP and bounded local roots', () => {
    const factory = new FakePanelFactory();
    const transport = createFlowguardWebviewTransport({
      panelFactory: factory,
      localResourceRoots: ['file:///extension/media'],
      scriptUri: 'vscode-resource:/main.js',
      styleUri: 'vscode-resource:/main.css',
      nonce: 'fixed-nonce',
    });

    expect(factory.requests).toHaveLength(1);
    expect(factory.requests[0]?.viewType).toBe(FLOWGUARD_WEBVIEW_VIEW_TYPE);
    expect(factory.requests[0]?.options).toEqual({
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: ['file:///extension/media'],
    });

    const html = factory.currentPanel.webview.html;
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('default-src &#39;none&#39;');
    expect(html).toContain('script-src &#39;nonce-fixed-nonce&#39;');
    expect(html).toContain('connect-src &#39;none&#39;');
    expect(html).toContain('nonce="fixed-nonce"');
    expect(html).toContain("type: 'webview/ready'");
    expect(html).not.toContain('unsafe-eval');
    expect(html).not.toContain('unsafe-inline');

    transport.dispose();
  });

  test('rehydrates the latest snapshot and open target after webview reload', async () => {
    const factory = new FakePanelFactory();
    const transport = createFlowguardWebviewTransport({
      panelFactory: factory,
      nonce: 'fixed-nonce',
    });
    const snapshot = await createWorkspaceSnapshot();

    await transport.publishSnapshot(snapshot);
    await transport.open({
      rootUri: 'file:///repo',
      flowId: 'login',
      proposalId: '01JPROPOSAL',
    });

    expect(messageTypes(factory.currentPanel.webview.messages)).toEqual([
      'host/snapshot',
      'host/open',
    ]);
    expect(factory.currentPanel.revealCalls).toBe(1);

    factory.currentPanel.webview.emit(webviewMessage('webview/ready', {}));
    await settleAsyncHandlers();

    expect(messageTypes(factory.currentPanel.webview.messages)).toEqual([
      'host/snapshot',
      'host/open',
      'host/snapshot',
      'host/open',
    ]);

    const lastSnapshot = factory.currentPanel.webview.messages[2];
    const validation = parseFlowguardHostToWebviewMessage(lastSnapshot);
    expect(validation.ok).toBe(true);
    if (validation.ok && validation.value.type === 'host/snapshot') {
      expect(validation.value.payload.sequence).toBe(7);
      expect(validation.value.payload.repositories[0]?.flows[0]?.graph.nodes).toHaveLength(2);
      expect(validation.value.payload.repositories[0]?.proposals[0]?.graph?.nodes).toHaveLength(3);
    }

    transport.dispose();
  });

  test('resolves webview intents against the current snapshot before invoking handlers', async () => {
    const factory = new FakePanelFactory();
    const opened: FlowguardResolvedOpenIntent[] = [];
    const revealed: FlowguardResolvedRevealSourceIntent[] = [];
    const accepted: FlowguardResolvedProposalDecisionIntent[] = [];
    const rejected: FlowguardResolvedProposalDecisionIntent[] = [];
    const refreshedSnapshot = await createWorkspaceSnapshot(8);
    let refreshCalls = 0;
    const transport = createFlowguardWebviewTransport({
      panelFactory: factory,
      handlers: {
        open: (intent) => opened.push(intent),
        refresh: () => {
          refreshCalls += 1;
          return refreshedSnapshot;
        },
        revealSource: (intent) => revealed.push(intent),
        acceptProposal: (intent) => accepted.push(intent),
        rejectProposal: (intent) => rejected.push(intent),
      },
    });

    await transport.publishSnapshot(await createWorkspaceSnapshot());
    factory.currentPanel.webview.messages = [];

    factory.currentPanel.webview.emit(webviewMessage('intent/refresh', {}));
    await settleAsyncHandlers();
    expect(refreshCalls).toBe(1);
    expect(messageTypes(factory.currentPanel.webview.messages)).toEqual(['host/snapshot']);

    factory.currentPanel.webview.emit(
      webviewMessage('intent/open', {
        rootUri: 'file:///repo',
        flowId: 'login',
        proposalId: '01JPROPOSAL',
      }),
    );
    await settleAsyncHandlers();
    expect(opened[0]?.flow.document.id).toBe('login');
    expect(opened[0]?.proposal?.document.id).toBe('01JPROPOSAL');

    factory.currentPanel.webview.emit(
      webviewMessage('intent/reveal-source', {
        rootUri: 'file:///repo',
        flowId: 'login',
        sourcePath: 'src/routes/login.tsx',
        target: {
          kind: 'state',
          stateId: 'login-form',
        },
      }),
    );
    await settleAsyncHandlers();
    expect(revealed[0]?.sourcePath).toBe('src/routes/login.tsx');
    expect(revealed[0]?.target).toEqual({
      kind: 'state',
      stateId: 'login-form',
    });

    factory.currentPanel.webview.emit(
      webviewMessage('intent/accept', {
        rootUri: 'file:///repo',
        proposalId: '01JPROPOSAL',
      }),
    );
    factory.currentPanel.webview.emit(
      webviewMessage('intent/reject', {
        rootUri: 'file:///repo',
        proposalId: '01JPROPOSAL',
      }),
    );
    await settleAsyncHandlers();
    expect(accepted[0]?.proposal.document.id).toBe('01JPROPOSAL');
    expect(rejected[0]?.proposal.document.id).toBe('01JPROPOSAL');

    const revealCount = revealed.length;
    const acceptCount = accepted.length;
    factory.currentPanel.webview.emit(
      webviewMessage('intent/reveal-source', {
        rootUri: 'file:///repo',
        flowId: 'login',
        sourcePath: 'src/not-referenced.tsx',
      }),
    );
    factory.currentPanel.webview.emit(
      webviewMessage('intent/accept', {
        rootUri: 'file:///repo',
        proposalId: 'missing-proposal',
      }),
    );
    await settleAsyncHandlers();

    expect(revealed).toHaveLength(revealCount);
    expect(accepted).toHaveLength(acceptCount);
    expect(
      messageTypes(factory.currentPanel.webview.messages).filter((type) => type === 'host/error'),
    ).toHaveLength(2);

    transport.dispose();
  });
});

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

const createWorkspaceSnapshot = async (sequence = 7): Promise<FlowguardWorkspaceSnapshot> => {
  const root: WorkspaceRoot = {
    uri: 'file:///repo',
    name: 'repo',
    index: 0,
  };
  const config = makeFlowguardConfigFixture();
  const flow = makeLoginFlowFixture();
  const flowDigest = await digestFlowguardFlow(flow);
  const proposal = makePasswordResetProposalFixture(flowDigest);
  const proposalDigest = await digestFlowProposal(proposal);
  const configDigest = await digestFlowguardConfig(config);

  return {
    version: 1,
    sequence,
    generatedAt: '2026-06-20T00:00:00.000Z',
    repositories: [
      {
        root,
        config: {
          kind: 'config',
          root,
          uri: 'file:///repo/.flowguard/config.json',
          relativePath: '.flowguard/config.json',
          source: 'default',
          valid: true,
          activeConfig: config,
          digest: configDigest,
          issues: [],
        },
        flows: [
          {
            kind: 'flow',
            root,
            uri: 'file:///repo/.flowguard/flows/login.json',
            relativePath: '.flowguard/flows/login.json',
            valid: true,
            document: flow,
            digest: flowDigest,
            issues: [],
          },
        ],
        proposals: [
          {
            kind: 'proposal',
            root,
            uri: 'file:///repo/.flowguard/proposals/password-reset.json',
            relativePath: '.flowguard/proposals/password-reset.json',
            valid: true,
            document: proposal,
            digest: proposalDigest,
            issues: [],
          },
        ],
        coverage: [],
        invalidDocuments: [],
        diagnosticDocuments: [],
        watchPatterns: [FLOWGUARD_WATCH_PATTERN],
      },
    ],
  };
};

const messageTypes = (messages: readonly unknown[]): readonly string[] => {
  return messages.map((message) => {
    if (typeof message === 'object' && message !== null && 'type' in message) {
      return String(message.type);
    }

    return 'unknown';
  });
};

const settleAsyncHandlers = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

class FakePanelFactory implements FlowguardWebviewPanelFactory {
  readonly requests: FlowguardCreateWebviewPanelRequest[] = [];
  readonly panels: FakePanel[] = [];

  get currentPanel(): FakePanel {
    const panel = this.panels.at(-1);
    if (panel === undefined) throw new Error('Expected a fake panel to be created.');
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
  revealCalls = 0;
  disposed = false;

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
    for (const listener of [...this.#disposeListeners]) {
      listener();
    }
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
    for (const listener of [...this.#messageListeners]) {
      listener(message);
    }
  }
}

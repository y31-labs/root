import type { DisposableLike } from '#/extension/services/disposables';
import {
  createFlowguardWebviewHtml,
  type FlowguardWebviewHtmlOptions,
} from '#/extension/webview/html';
import {
  createFlowguardWebviewSnapshot,
  sourceReferencesFromFlow,
  sourceReferencesFromProposal,
} from '#/extension/webview/snapshot';
import type {
  FlowguardFlowDocumentSnapshot,
  FlowguardRepositorySnapshot,
  FlowguardWorkspaceSnapshot,
  FlowProposalDocumentSnapshot,
} from '#/extension/workspace';
import {
  flowguardMessageProtocol,
  flowguardMessageVersion,
  parseFlowguardHostToWebviewMessage,
  parseFlowguardWebviewToHostMessage,
  type FlowguardHostErrorCode,
  type FlowguardHostToWebviewMessage,
  type FlowguardOpenIntent,
  type FlowguardProposalDecisionIntent,
  type FlowguardRevealSourceIntent,
  type FlowguardRevealSourceTarget,
  type FlowguardWebviewSourceReference,
} from '#/shared/messages';

export const FLOWGUARD_WEBVIEW_VIEW_TYPE = 'flowguard.graph' as const;
export const FLOWGUARD_WEBVIEW_TITLE = 'Flowguard' as const;

export interface FlowguardWebviewPanelFactory {
  createWebviewPanel(request: FlowguardCreateWebviewPanelRequest): FlowguardWebviewPanelLike;
}

export interface FlowguardCreateWebviewPanelRequest {
  readonly viewType: typeof FLOWGUARD_WEBVIEW_VIEW_TYPE;
  readonly title: string;
  readonly viewColumn?: unknown;
  readonly options: FlowguardWebviewPanelOptions;
}

export interface FlowguardWebviewPanelOptions {
  readonly enableScripts: true;
  readonly retainContextWhenHidden: false;
  readonly localResourceRoots: readonly unknown[];
}

export interface FlowguardWebviewPanelLike extends DisposableLike {
  readonly webview: FlowguardWebviewLike;
  reveal(viewColumn?: unknown): void;
  onDidDispose(listener: () => void): DisposableLike;
}

export interface FlowguardWebviewLike {
  readonly cspSource: string;
  html: string;
  postMessage(message: unknown): boolean | PromiseLike<boolean>;
  onDidReceiveMessage(listener: (message: unknown) => void): DisposableLike;
}

export interface CreateFlowguardWebviewTransportOptions {
  readonly panelFactory: FlowguardWebviewPanelFactory;
  readonly localResourceRoots?: readonly unknown[];
  readonly viewColumn?: unknown;
  readonly title?: string;
  readonly scriptUri?: string;
  readonly styleUri?: string;
  readonly nonce?: string;
  readonly handlers?: FlowguardWebviewIntentHandlers;
}

export interface FlowguardWebviewIntentHandlers {
  readonly open?: (intent: FlowguardResolvedOpenIntent) => unknown;
  readonly refresh?: () =>
    | FlowguardWorkspaceSnapshot
    | void
    | Promise<FlowguardWorkspaceSnapshot | void>;
  readonly revealSource?: (intent: FlowguardResolvedRevealSourceIntent) => unknown;
  readonly acceptProposal?: (intent: FlowguardResolvedProposalDecisionIntent) => unknown;
  readonly rejectProposal?: (intent: FlowguardResolvedProposalDecisionIntent) => unknown;
}

export interface FlowguardResolvedOpenIntent {
  readonly intent: FlowguardOpenIntent;
  readonly repository: FlowguardRepositorySnapshot;
  readonly flow: FlowguardFlowDocumentSnapshot;
  readonly proposal?: FlowProposalDocumentSnapshot;
}

export interface FlowguardResolvedRevealSourceIntent {
  readonly intent: FlowguardRevealSourceIntent;
  readonly repository: FlowguardRepositorySnapshot;
  readonly flow: FlowguardFlowDocumentSnapshot;
  readonly proposal?: FlowProposalDocumentSnapshot;
  readonly sourcePath: string;
  readonly target: FlowguardRevealSourceTarget;
}

export interface FlowguardResolvedProposalDecisionIntent {
  readonly intent: FlowguardProposalDecisionIntent;
  readonly repository: FlowguardRepositorySnapshot;
  readonly proposal: FlowProposalDocumentSnapshot;
  readonly flow?: FlowguardFlowDocumentSnapshot;
}

export const createFlowguardWebviewTransport = (
  options: CreateFlowguardWebviewTransportOptions,
): FlowguardWebviewTransport => {
  const panel = options.panelFactory.createWebviewPanel({
    viewType: FLOWGUARD_WEBVIEW_VIEW_TYPE,
    title: options.title ?? FLOWGUARD_WEBVIEW_TITLE,
    viewColumn: options.viewColumn,
    options: {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [...(options.localResourceRoots ?? [])],
    },
  });
  const htmlOptions: FlowguardWebviewHtmlOptions = {
    cspSource: panel.webview.cspSource,
    title: options.title ?? FLOWGUARD_WEBVIEW_TITLE,
    scriptUri: options.scriptUri,
    styleUri: options.styleUri,
    nonce: options.nonce,
  };
  panel.webview.html = createFlowguardWebviewHtml(htmlOptions);

  return new FlowguardWebviewTransport(panel, options.handlers);
};

export class FlowguardWebviewTransport implements DisposableLike {
  readonly #panel: FlowguardWebviewPanelLike;
  readonly #handlers: FlowguardWebviewIntentHandlers;
  readonly #subscriptions = new Set<DisposableLike>();
  #snapshot: FlowguardWorkspaceSnapshot | undefined;
  #openIntent: FlowguardOpenIntent | undefined;
  #disposed = false;

  constructor(panel: FlowguardWebviewPanelLike, handlers: FlowguardWebviewIntentHandlers = {}) {
    this.#panel = panel;
    this.#handlers = handlers;
    this.#subscriptions.add(
      panel.webview.onDidReceiveMessage((message) => {
        void this.#handleWebviewMessage(message);
      }),
    );
    this.#subscriptions.add(
      panel.onDidDispose(() => {
        this.dispose();
      }),
    );
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  async publishSnapshot(snapshot: FlowguardWorkspaceSnapshot): Promise<void> {
    this.#throwIfDisposed();
    this.#snapshot = snapshot;
    await this.#postSnapshot(snapshot);
  }

  async open(intent: FlowguardOpenIntent): Promise<void> {
    this.#throwIfDisposed();
    this.#openIntent = intent;
    this.#panel.reveal();

    await this.#postHostMessage({
      protocol: flowguardMessageProtocol,
      version: flowguardMessageVersion,
      type: 'host/open',
      payload: intent,
    });
  }

  reveal(viewColumn?: unknown): void {
    this.#throwIfDisposed();
    this.#panel.reveal(viewColumn);
  }

  dispose(): void {
    if (this.#disposed) return;

    this.#disposed = true;
    for (const subscription of [...this.#subscriptions].reverse()) {
      subscription.dispose();
    }
    this.#subscriptions.clear();
    this.#panel.dispose();
  }

  async #handleWebviewMessage(message: unknown): Promise<void> {
    if (this.#disposed) return;

    const validation = parseFlowguardWebviewToHostMessage(message);
    if (!validation.ok) {
      await this.#postHostError('INVALID_MESSAGE', validation.errors.join(' '));
      return;
    }

    switch (validation.value.type) {
      case 'webview/ready':
        await this.#rehydrateWebview();
        return;
      case 'intent/refresh':
        await this.#handleRefreshIntent();
        return;
      case 'intent/open':
        await this.#handleOpenIntent(validation.value.payload);
        return;
      case 'intent/reveal-source':
        await this.#handleRevealSourceIntent(validation.value.payload);
        return;
      case 'intent/accept':
        await this.#handleProposalDecisionIntent(
          validation.value.payload,
          this.#handlers.acceptProposal,
        );
        return;
      case 'intent/reject':
        await this.#handleProposalDecisionIntent(
          validation.value.payload,
          this.#handlers.rejectProposal,
        );
        return;
    }
  }

  async #handleRefreshIntent(): Promise<void> {
    try {
      const snapshot = await this.#handlers.refresh?.();
      if (snapshot !== undefined) await this.publishSnapshot(snapshot);
    } catch (caught) {
      await this.#postHostError('HANDLER_ERROR', errorMessage(caught));
    }
  }

  async #handleOpenIntent(intent: FlowguardOpenIntent): Promise<void> {
    const resolved = this.#resolveOpenIntent(intent);
    if (resolved === undefined) {
      await this.#postHostError(
        'INTENT_REJECTED',
        'Open intent does not match the current snapshot.',
      );
      return;
    }

    await this.#callHandler(() => this.#handlers.open?.(resolved));
  }

  async #handleRevealSourceIntent(intent: FlowguardRevealSourceIntent): Promise<void> {
    const resolved = this.#resolveRevealSourceIntent(intent);
    if (resolved === undefined) {
      await this.#postHostError(
        'INTENT_REJECTED',
        'Reveal-source intent does not match a known source reference.',
      );
      return;
    }

    await this.#callHandler(() => this.#handlers.revealSource?.(resolved));
  }

  async #handleProposalDecisionIntent(
    intent: FlowguardProposalDecisionIntent,
    handler: ((intent: FlowguardResolvedProposalDecisionIntent) => unknown) | undefined,
  ): Promise<void> {
    const resolved = this.#resolveProposalDecisionIntent(intent);
    if (resolved === undefined) {
      await this.#postHostError(
        'INTENT_REJECTED',
        'Proposal decision intent does not match the current snapshot.',
      );
      return;
    }

    await this.#callHandler(() => handler?.(resolved));
  }

  async #callHandler(callback: () => unknown): Promise<void> {
    try {
      await callback();
    } catch (caught) {
      await this.#postHostError('HANDLER_ERROR', errorMessage(caught));
    }
  }

  #resolveOpenIntent(intent: FlowguardOpenIntent): FlowguardResolvedOpenIntent | undefined {
    const repository = this.#findRepository(intent.rootUri);
    const flow = repository?.flows.find((candidate) => candidate.document.id === intent.flowId);
    if (repository === undefined || flow === undefined) return undefined;

    const proposal =
      intent.proposalId === undefined
        ? undefined
        : repository.proposals.find(
            (candidate) =>
              candidate.document.id === intent.proposalId &&
              candidate.document.flowId === flow.document.id,
          );
    if (intent.proposalId !== undefined && proposal === undefined) return undefined;

    return {
      intent,
      repository,
      flow,
      proposal,
    };
  }

  #resolveRevealSourceIntent(
    intent: FlowguardRevealSourceIntent,
  ): FlowguardResolvedRevealSourceIntent | undefined {
    const openIntent = this.#resolveOpenIntent({
      rootUri: intent.rootUri,
      flowId: intent.flowId,
      proposalId: intent.proposalId,
    });
    if (openIntent === undefined) return undefined;

    const references: readonly FlowguardWebviewSourceReference[] = [
      ...sourceReferencesFromFlow(openIntent.flow.document),
      ...(openIntent.proposal === undefined
        ? []
        : sourceReferencesFromProposal(openIntent.proposal.document)),
    ];
    const reference = references.find(
      (candidate) =>
        candidate.sources.includes(intent.sourcePath) &&
        (intent.target === undefined || sameRevealTarget(candidate.target, intent.target)),
    );

    if (reference === undefined) return undefined;

    return {
      intent,
      repository: openIntent.repository,
      flow: openIntent.flow,
      proposal: openIntent.proposal,
      sourcePath: intent.sourcePath,
      target: intent.target ?? reference.target,
    };
  }

  #resolveProposalDecisionIntent(
    intent: FlowguardProposalDecisionIntent,
  ): FlowguardResolvedProposalDecisionIntent | undefined {
    const repository = this.#findRepository(intent.rootUri);
    const proposal = repository?.proposals.find(
      (candidate) => candidate.document.id === intent.proposalId,
    );
    if (repository === undefined || proposal === undefined) return undefined;

    return {
      intent,
      repository,
      proposal,
      flow: repository.flows.find(
        (candidate) => candidate.document.id === proposal.document.flowId,
      ),
    };
  }

  #findRepository(rootUri: string): FlowguardRepositorySnapshot | undefined {
    return this.#snapshot?.repositories.find((repository) => repository.root.uri === rootUri);
  }

  async #rehydrateWebview(): Promise<void> {
    if (this.#snapshot !== undefined) {
      await this.#postSnapshot(this.#snapshot);
    }

    if (this.#openIntent !== undefined) {
      await this.#postHostMessage({
        protocol: flowguardMessageProtocol,
        version: flowguardMessageVersion,
        type: 'host/open',
        payload: this.#openIntent,
      });
    }
  }

  async #postSnapshot(snapshot: FlowguardWorkspaceSnapshot): Promise<void> {
    await this.#postHostMessage({
      protocol: flowguardMessageProtocol,
      version: flowguardMessageVersion,
      type: 'host/snapshot',
      payload: createFlowguardWebviewSnapshot(snapshot),
    });
  }

  async #postHostError(code: FlowguardHostErrorCode, message: string): Promise<void> {
    await this.#postHostMessage({
      protocol: flowguardMessageProtocol,
      version: flowguardMessageVersion,
      type: 'host/error',
      payload: {
        code,
        message,
      },
    });
  }

  async #postHostMessage(message: FlowguardHostToWebviewMessage): Promise<void> {
    const validation = parseFlowguardHostToWebviewMessage(message);
    if (!validation.ok) {
      throw new Error(`Invalid host-to-webview message: ${validation.errors.join(' ')}`);
    }

    await this.#panel.webview.postMessage(validation.value);
  }

  #throwIfDisposed(): void {
    if (this.#disposed) {
      throw new Error('Flowguard webview transport has been disposed.');
    }
  }
}

const sameRevealTarget = (
  left: FlowguardRevealSourceTarget,
  right: FlowguardRevealSourceTarget,
): boolean => {
  if (left.kind !== right.kind) return false;

  if (left.kind === 'state' && right.kind === 'state') {
    return left.stateId === right.stateId;
  }

  return left.kind === 'transition' && right.kind === 'transition'
    ? left.transitionId === right.transitionId
    : false;
};

const errorMessage = (caught: unknown): string => {
  return caught instanceof Error ? caught.message : 'Flowguard webview handler failed.';
};

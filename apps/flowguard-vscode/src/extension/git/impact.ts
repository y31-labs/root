import type { FlowImpact } from '@workspace/flowguard-contracts';
import { calculateFlowImpact } from '@workspace/flowguard-engine';

import {
  GIT_IMPACT_ADVISORY_LABEL,
  type GitChangedPathProvider,
  type GitChangedPathSnapshot,
  type GitChangedPathUnavailableReason,
} from '#/extension/git/host';
import { noopDisposable, type DisposableLike } from '#/extension/services/disposables';
import type {
  FlowguardRepositorySnapshot,
  FlowguardWorkspaceSnapshot,
  WorkspaceRoot,
} from '#/extension/workspace';

export interface FlowguardGitImpactTreeUpdate {
  readonly advisory: true;
  readonly label: typeof GIT_IMPACT_ADVISORY_LABEL;
  readonly changedPaths: readonly string[];
  readonly repositories: readonly GitImpactChangedPathRepository[];
}

export interface GitImpactChangedPathRepository {
  readonly rootUri: string;
  readonly changedPaths: readonly string[];
}

export interface FlowguardGitImpactWebviewPayload {
  readonly version: 1;
  readonly generatedAt: string;
  readonly advisory: true;
  readonly label: typeof GIT_IMPACT_ADVISORY_LABEL;
  readonly status: GitChangedPathSnapshot['status'];
  readonly unavailableReason?: GitChangedPathUnavailableReason;
  readonly message?: string;
  readonly repositories: readonly FlowguardGitImpactRepositoryPayload[];
}

export interface FlowguardGitImpactRepositoryPayload {
  readonly root: WorkspaceRoot;
  readonly changedPaths: readonly string[];
  readonly flows: readonly FlowguardGitImpactFlowPayload[];
}

export interface FlowguardGitImpactFlowPayload {
  readonly flowId: string;
  readonly name: string;
  readonly relativePath: string;
  readonly impact?: FlowImpact;
  readonly advisoryLabel: string;
  readonly advisoryDescription: string;
}

export interface FlowguardGitImpactUpdate {
  readonly tree: FlowguardGitImpactTreeUpdate;
  readonly webview: FlowguardGitImpactWebviewPayload;
}

export type FlowguardGitImpactListener = (update: FlowguardGitImpactUpdate) => void;

export interface FlowguardGitImpactControllerOptions {
  readonly changedPathProvider: GitChangedPathProvider;
  readonly workspaceSnapshot?: FlowguardWorkspaceSnapshot;
  readonly clock?: () => string;
}

export class FlowguardGitImpactController implements DisposableLike {
  readonly #changedPathProvider: GitChangedPathProvider;
  readonly #clock: () => string;
  readonly #listeners = new Set<FlowguardGitImpactListener>();
  #workspaceSnapshot: FlowguardWorkspaceSnapshot | undefined;
  #changedPathsSubscription: DisposableLike | undefined;
  #lastChangedPaths: GitChangedPathSnapshot | undefined;
  #lastUpdate: FlowguardGitImpactUpdate | undefined;
  #started = false;
  #disposed = false;

  constructor(options: FlowguardGitImpactControllerOptions) {
    this.#changedPathProvider = options.changedPathProvider;
    this.#workspaceSnapshot = options.workspaceSnapshot;
    this.#clock = options.clock ?? (() => new Date().toISOString());
  }

  get lastUpdate(): FlowguardGitImpactUpdate | undefined {
    return this.#lastUpdate;
  }

  onDidChangeImpact(listener: FlowguardGitImpactListener): DisposableLike {
    if (this.#disposed) return noopDisposable();

    this.#listeners.add(listener);

    return {
      dispose: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  async start(): Promise<FlowguardGitImpactUpdate> {
    this.#throwIfDisposed();

    if (!this.#started) {
      this.#started = true;
      this.#changedPathsSubscription = this.#changedPathProvider.onDidChangeChangedPaths(
        (changedPaths) => {
          this.#publish(changedPaths);
        },
      );
    }

    return this.refresh();
  }

  async refresh(): Promise<FlowguardGitImpactUpdate> {
    this.#throwIfDisposed();
    return this.#publish(await this.#changedPathProvider.getChangedPaths());
  }

  updateWorkspaceSnapshot(
    snapshot: FlowguardWorkspaceSnapshot | undefined,
  ): FlowguardGitImpactUpdate | undefined {
    this.#throwIfDisposed();
    this.#workspaceSnapshot = snapshot;

    if (this.#lastChangedPaths === undefined) return undefined;
    return this.#publish(this.#lastChangedPaths);
  }

  dispose(): void {
    if (this.#disposed) return;

    this.#disposed = true;
    this.#changedPathsSubscription?.dispose();
    this.#changedPathsSubscription = undefined;
    this.#changedPathProvider.dispose();
    this.#listeners.clear();
  }

  #publish(changedPaths: GitChangedPathSnapshot): FlowguardGitImpactUpdate {
    this.#lastChangedPaths = changedPaths;
    const update = createFlowguardGitImpactUpdate({
      workspaceSnapshot: this.#workspaceSnapshot,
      changedPaths,
      generatedAt: this.#clock(),
    });
    this.#lastUpdate = update;

    for (const listener of this.#listeners) listener(update);

    return update;
  }

  #throwIfDisposed(): void {
    if (this.#disposed) {
      throw new Error('Flowguard Git impact controller has been disposed.');
    }
  }
}

export const createFlowguardGitImpactUpdate = (options: {
  readonly workspaceSnapshot: FlowguardWorkspaceSnapshot | undefined;
  readonly changedPaths: GitChangedPathSnapshot;
  readonly generatedAt: string;
}): FlowguardGitImpactUpdate => {
  const repositories =
    options.workspaceSnapshot?.repositories.map((repository) =>
      createRepositoryPayload(repository, options.changedPaths),
    ) ?? [];

  return {
    tree: {
      advisory: true,
      label: GIT_IMPACT_ADVISORY_LABEL,
      changedPaths: options.changedPaths.changedPaths,
      repositories: options.changedPaths.repositories,
    },
    webview: {
      version: 1,
      generatedAt: options.generatedAt,
      advisory: true,
      label: GIT_IMPACT_ADVISORY_LABEL,
      status: options.changedPaths.status,
      unavailableReason:
        options.changedPaths.status === 'unavailable'
          ? options.changedPaths.unavailableReason
          : undefined,
      message:
        options.changedPaths.status === 'unavailable' ? options.changedPaths.message : undefined,
      repositories,
    },
  };
};

const createRepositoryPayload = (
  repository: FlowguardRepositorySnapshot,
  changedPaths: GitChangedPathSnapshot,
): FlowguardGitImpactRepositoryPayload => {
  const repositoryChangedPaths = changedPathsForRoot(changedPaths, repository.root.uri);

  return {
    root: repository.root,
    changedPaths: repositoryChangedPaths,
    flows: repository.flows.map((flow) => {
      const impact =
        changedPaths.status === 'available'
          ? calculateFlowImpact(flow.document, repositoryChangedPaths)
          : undefined;

      return {
        flowId: flow.document.id,
        name: flow.document.name,
        relativePath: flow.relativePath,
        impact,
        advisoryLabel: advisoryFlowLabel(impact),
        advisoryDescription: advisoryFlowDescription(impact),
      };
    }),
  };
};

const changedPathsForRoot = (
  changedPaths: GitChangedPathSnapshot,
  rootUri: string,
): readonly string[] => {
  return (
    changedPaths.repositories.find((repository) => repository.rootUri === rootUri)?.changedPaths ??
    []
  );
};

const advisoryFlowLabel = (impact: FlowImpact | undefined): string => {
  if (impact === undefined) return 'Git impact unavailable';
  if (impact.level === 'direct') return 'Potentially affected by direct source match';
  if (impact.level === 'possible') return 'Possibly affected';
  return 'No direct source match';
};

const advisoryFlowDescription = (impact: FlowImpact | undefined): string => {
  if (impact === undefined) {
    return 'Advisory impact could not be calculated because Git changed paths are unavailable.';
  }

  if (impact.level === 'direct') {
    return 'Advisory only: one or more changed paths directly match approved source references.';
  }

  if (impact.level === 'possible') {
    return 'Advisory only: future heuristics marked this flow as possibly affected.';
  }

  return 'Advisory only: no direct source-reference match was found; this does not prove the flow is unaffected.';
};

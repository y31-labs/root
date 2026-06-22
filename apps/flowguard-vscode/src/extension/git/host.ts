import { noopDisposable, type DisposableLike } from '#/extension/services/disposables';
import { isSafeRepositoryRelativePath } from '#/shared/messages';

export const BUILT_IN_GIT_EXTENSION_ID = 'vscode.git' as const;
export const GIT_IMPACT_ADVISORY_LABEL = 'Advisory Git impact' as const;

export interface GitUriLike {
  readonly path?: string;
  toString(): string;
}

export interface BuiltInGitFileChange {
  readonly uri: GitUriLike;
  readonly originalUri?: GitUriLike;
}

export interface BuiltInGitRepositoryState {
  readonly workingTreeChanges?: readonly BuiltInGitFileChange[];
  readonly indexChanges?: readonly BuiltInGitFileChange[];
  readonly mergeChanges?: readonly BuiltInGitFileChange[];
}

export interface BuiltInGitRepository {
  readonly rootUri: GitUriLike;
  readonly state: BuiltInGitRepositoryState;
  readonly onDidChangeState?: (listener: () => void) => DisposableLike;
}

export interface BuiltInGitApi {
  readonly repositories: readonly BuiltInGitRepository[];
  readonly onDidOpenRepository?: (
    listener: (repository: BuiltInGitRepository) => void,
  ) => DisposableLike;
  readonly onDidCloseRepository?: (
    listener: (repository: BuiltInGitRepository) => void,
  ) => DisposableLike;
}

export interface BuiltInGitExtension {
  readonly enabled?: boolean;
  getAPI(version: 1): BuiltInGitApi | undefined;
}

export interface GitExtensionLike<TExports> {
  readonly exports: TExports | undefined;
  activate(): TExports | PromiseLike<TExports>;
}

export interface GitExtensionHost {
  getExtension<TExports>(extensionId: string): GitExtensionLike<TExports> | undefined;
}

export type GitChangedPathUnavailableReason =
  | 'extension-unavailable'
  | 'extension-disabled'
  | 'activation-failed'
  | 'api-unavailable';

export interface GitRepositoryChangedPaths {
  readonly rootUri: string;
  readonly changedPaths: readonly string[];
}

export interface AvailableGitChangedPathSnapshot {
  readonly status: 'available';
  readonly advisory: true;
  readonly label: typeof GIT_IMPACT_ADVISORY_LABEL;
  readonly repositories: readonly GitRepositoryChangedPaths[];
  readonly changedPaths: readonly string[];
}

export interface UnavailableGitChangedPathSnapshot {
  readonly status: 'unavailable';
  readonly advisory: true;
  readonly label: typeof GIT_IMPACT_ADVISORY_LABEL;
  readonly unavailableReason: GitChangedPathUnavailableReason;
  readonly message: string;
  readonly repositories: readonly [];
  readonly changedPaths: readonly [];
}

export type GitChangedPathSnapshot =
  | AvailableGitChangedPathSnapshot
  | UnavailableGitChangedPathSnapshot;

export type GitChangedPathListener = (snapshot: GitChangedPathSnapshot) => void;

export interface GitChangedPathProvider extends DisposableLike {
  onDidChangeChangedPaths(listener: GitChangedPathListener): DisposableLike;
  getChangedPaths(): Promise<GitChangedPathSnapshot>;
}

export const createBuiltInGitChangedPathProvider = (
  host: GitExtensionHost,
): GitChangedPathProvider => {
  return new BuiltInGitChangedPathProvider(host);
};

export const unavailableGitChangedPathSnapshot = (
  unavailableReason: GitChangedPathUnavailableReason,
  message: string,
): UnavailableGitChangedPathSnapshot => {
  return {
    status: 'unavailable',
    advisory: true,
    label: GIT_IMPACT_ADVISORY_LABEL,
    unavailableReason,
    message,
    repositories: [],
    changedPaths: [],
  };
};

class BuiltInGitChangedPathProvider implements GitChangedPathProvider {
  readonly #host: GitExtensionHost;
  readonly #listeners = new Set<GitChangedPathListener>();
  readonly #subscriptions = new Set<DisposableLike>();
  #subscribedApi: BuiltInGitApi | undefined;
  #disposed = false;

  constructor(host: GitExtensionHost) {
    this.#host = host;
  }

  onDidChangeChangedPaths(listener: GitChangedPathListener): DisposableLike {
    if (this.#disposed) return noopDisposable();

    this.#listeners.add(listener);

    return {
      dispose: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  async getChangedPaths(): Promise<GitChangedPathSnapshot> {
    if (this.#disposed) {
      return unavailableGitChangedPathSnapshot(
        'extension-unavailable',
        'Git impact is unavailable because the Git path provider has been disposed.',
      );
    }

    const apiResult = await this.#getApi();
    if (apiResult.status === 'unavailable') return apiResult;

    this.#subscribeToGitApi(apiResult.api);
    return availableGitChangedPathSnapshot(apiResult.api.repositories);
  }

  dispose(): void {
    if (this.#disposed) return;

    this.#disposed = true;
    this.#listeners.clear();
    this.#disposeSubscriptions();
  }

  async #getApi(): Promise<
    | {
        readonly status: 'available';
        readonly api: BuiltInGitApi;
      }
    | UnavailableGitChangedPathSnapshot
  > {
    const extension = this.#host.getExtension<BuiltInGitExtension>(BUILT_IN_GIT_EXTENSION_ID);
    if (extension === undefined) {
      return unavailableGitChangedPathSnapshot(
        'extension-unavailable',
        'The built-in Git extension is unavailable, so Flowguard cannot read changed paths.',
      );
    }

    let gitExtension: BuiltInGitExtension;
    try {
      gitExtension = extension.exports ?? (await extension.activate());
    } catch {
      return unavailableGitChangedPathSnapshot(
        'activation-failed',
        'The built-in Git extension could not be activated, so Flowguard cannot read changed paths.',
      );
    }

    if (gitExtension.enabled === false) {
      return unavailableGitChangedPathSnapshot(
        'extension-disabled',
        'The built-in Git extension is disabled, so Flowguard cannot read changed paths.',
      );
    }

    try {
      const api = gitExtension.getAPI(1);
      if (api === undefined) {
        return unavailableGitChangedPathSnapshot(
          'api-unavailable',
          'The built-in Git extension did not expose its repository API.',
        );
      }

      return {
        status: 'available',
        api,
      };
    } catch {
      return unavailableGitChangedPathSnapshot(
        'api-unavailable',
        'The built-in Git extension repository API could not be read.',
      );
    }
  }

  #subscribeToGitApi(api: BuiltInGitApi): void {
    if (this.#subscribedApi === api) return;

    this.#disposeSubscriptions();
    this.#subscribedApi = api;

    if (api.onDidOpenRepository !== undefined) {
      this.#subscriptions.add(
        api.onDidOpenRepository((repository) => {
          this.#subscribeToRepository(repository);
          this.#emitChangedPaths();
        }),
      );
    }

    if (api.onDidCloseRepository !== undefined) {
      this.#subscriptions.add(
        api.onDidCloseRepository(() => {
          this.#emitChangedPaths();
        }),
      );
    }

    for (const repository of api.repositories) {
      this.#subscribeToRepository(repository);
    }
  }

  #subscribeToRepository(repository: BuiltInGitRepository): void {
    if (repository.onDidChangeState === undefined) return;

    this.#subscriptions.add(
      repository.onDidChangeState(() => {
        this.#emitChangedPaths();
      }),
    );
  }

  #emitChangedPaths(): void {
    if (this.#disposed) return;

    void this.getChangedPaths().then((snapshot) => {
      if (this.#disposed) return;
      for (const listener of this.#listeners) listener(snapshot);
    });
  }

  #disposeSubscriptions(): void {
    for (const subscription of [...this.#subscriptions].reverse()) {
      subscription.dispose();
    }
    this.#subscriptions.clear();
    this.#subscribedApi = undefined;
  }
}

const availableGitChangedPathSnapshot = (
  repositories: readonly BuiltInGitRepository[],
): GitChangedPathSnapshot => {
  const repositorySnapshots = repositories
    .map((repository): GitRepositoryChangedPaths => {
      const rootUri = repository.rootUri.toString();
      return {
        rootUri,
        changedPaths: changedPathsForRepository(repository),
      };
    })
    .sort((left, right) => left.rootUri.localeCompare(right.rootUri));

  return {
    status: 'available',
    advisory: true,
    label: GIT_IMPACT_ADVISORY_LABEL,
    repositories: repositorySnapshots,
    changedPaths: uniqueSorted(
      repositorySnapshots.flatMap((repository) => repository.changedPaths),
    ),
  };
};

const changedPathsForRepository = (repository: BuiltInGitRepository): readonly string[] => {
  const rootUri = repository.rootUri;

  return uniqueSorted(
    gitFileChanges(repository.state)
      .flatMap((change) => [change.uri, change.originalUri])
      .flatMap((uri) => {
        if (uri === undefined) return [];
        const relativePath = repositoryRelativePath(rootUri, uri);
        return relativePath === undefined ? [] : [relativePath];
      }),
  );
};

const gitFileChanges = (state: BuiltInGitRepositoryState): readonly BuiltInGitFileChange[] => {
  return [
    ...(state.indexChanges ?? []),
    ...(state.workingTreeChanges ?? []),
    ...(state.mergeChanges ?? []),
  ];
};

const repositoryRelativePath = (rootUri: GitUriLike, fileUri: GitUriLike): string | undefined => {
  const root = parseUri(rootUri);
  const file = parseUri(fileUri);

  if (
    root !== undefined &&
    file !== undefined &&
    root.scheme === file.scheme &&
    root.authority === file.authority
  ) {
    return safeRelativePath(root.path, file.path);
  }

  return safeRelativePath(rootUri.toString(), fileUri.toString());
};

const parseUri = (
  uri: GitUriLike,
):
  | {
      readonly scheme: string;
      readonly authority: string;
      readonly path: string;
    }
  | undefined => {
  try {
    const parsed = new URL(uri.toString());
    if (parsed.protocol.length === 0) return undefined;

    return {
      scheme: parsed.protocol.toLowerCase(),
      authority: parsed.host.toLowerCase(),
      path: decodeURIComponent(parsed.pathname),
    };
  } catch {
    return undefined;
  }
};

const safeRelativePath = (rootPath: string, filePath: string): string | undefined => {
  const root = trimTrailingSlash(toPosixPath(rootPath));
  const file = toPosixPath(filePath);
  if (file === root) return undefined;
  if (!file.startsWith(`${root}/`)) return undefined;

  const relativePath = file.slice(root.length + 1);
  return isSafeRepositoryRelativePath(relativePath) ? relativePath : undefined;
};

const toPosixPath = (value: string): string => {
  return value.replace(/\\/gu, '/').replace(/\/+/gu, '/');
};

const trimTrailingSlash = (value: string): string => {
  if (value === '/') return value;
  return value.replace(/\/+$/u, '');
};

const uniqueSorted = (values: readonly string[]): readonly string[] => {
  return [...new Set(values)].sort();
};

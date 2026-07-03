import { describe, expect, test } from 'bun:test';

import {
  digestFlowguardFlow,
  digestFlowguardConfig,
  makeLoginFlowFixture,
  makeFlowguardConfigFixture,
  type FlowguardFlow,
} from '@workspace/flowguard-contracts';

import {
  FlowguardGitImpactController,
  createFlowguardGitImpactUpdate,
  createBuiltInGitChangedPathProvider,
  unavailableGitChangedPathSnapshot,
  type BuiltInGitApi,
  type BuiltInGitExtension,
  type BuiltInGitFileChange,
  type BuiltInGitRepository,
  type GitChangedPathListener,
  type GitChangedPathProvider,
  type GitChangedPathSnapshot,
  type GitExtensionHost,
  type GitExtensionLike,
  type GitUriLike,
  type FlowguardGitImpactUpdate,
} from '#/extension/git';
import type { DisposableLike } from '#/extension/services/disposables';
import {
  FLOWGUARD_DIRECTORY,
  joinRepositoryUri,
  type FlowguardFlowDocumentSnapshot,
  type FlowguardWorkspaceSnapshot,
  type WorkspaceRoot,
} from '#/extension/workspace';

describe('Flowguard Git changed path provider', () => {
  test('reads repository-relative changed paths from the built-in Git extension API', async () => {
    const repository = new FakeGitRepository('file:///repo', {
      indexChanges: [
        fileChange('file:///repo/src/server/auth.ts'),
        fileChange('file:///repo/src/server/auth.ts'),
      ],
      workingTreeChanges: [
        fileChange('file:///repo/src/routes/login.tsx'),
        fileChange('file:///repo/src/routes/account.tsx'),
      ],
      mergeChanges: [fileChange('file:///repo/src/new-name.ts', 'file:///repo/src/old-name.ts')],
    });
    const api = new FakeGitApi([repository]);
    const provider = createBuiltInGitChangedPathProvider(
      new FakeGitExtensionHost(new FakeGitExtension(api)),
    );

    const snapshot = await provider.getChangedPaths();

    expect(snapshot.status).toBe('available');
    expect(snapshot.repositories).toEqual([
      {
        rootUri: 'file:///repo',
        changedPaths: [
          'src/new-name.ts',
          'src/old-name.ts',
          'src/routes/account.tsx',
          'src/routes/login.tsx',
          'src/server/auth.ts',
        ],
      },
    ]);
    expect(snapshot.changedPaths).toEqual([
      'src/new-name.ts',
      'src/old-name.ts',
      'src/routes/account.tsx',
      'src/routes/login.tsx',
      'src/server/auth.ts',
    ]);

    provider.dispose();
  });

  test('emits refreshed changed paths when Git repository state changes', async () => {
    const repository = new FakeGitRepository('file:///repo', {
      workingTreeChanges: [fileChange('file:///repo/src/routes/login.tsx')],
    });
    const provider = createBuiltInGitChangedPathProvider(
      new FakeGitExtensionHost(new FakeGitExtension(new FakeGitApi([repository]))),
    );
    const updates: GitChangedPathSnapshot[] = [];

    provider.onDidChangeChangedPaths((snapshot) => updates.push(snapshot));
    await provider.getChangedPaths();

    repository.state = {
      workingTreeChanges: [fileChange('file:///repo/src/server/auth.ts')],
    };
    repository.emitStateChange();
    await settleAsyncHandlers();

    expect(updates.at(-1)?.changedPaths).toEqual(['src/server/auth.ts']);

    provider.dispose();
  });

  test('degrades to unavailable snapshots when Git integration cannot be read', async () => {
    const missing = await createBuiltInGitChangedPathProvider(
      new FakeGitExtensionHost(undefined),
    ).getChangedPaths();
    const disabled = await createBuiltInGitChangedPathProvider(
      new FakeGitExtensionHost(new FakeGitExtension(new FakeGitApi([]), { enabled: false })),
    ).getChangedPaths();
    const activationFailed = await createBuiltInGitChangedPathProvider(
      new FakeGitExtensionHost(new FailingGitExtension()),
    ).getChangedPaths();

    expect(missing.status).toBe('unavailable');
    if (missing.status !== 'unavailable')
      throw new Error('Expected missing Git to be unavailable.');
    expect(missing.unavailableReason).toBe('extension-unavailable');
    expect(disabled.status).toBe('unavailable');
    if (disabled.status !== 'unavailable')
      throw new Error('Expected disabled Git to be unavailable.');
    expect(disabled.unavailableReason).toBe('extension-disabled');
    expect(activationFailed.status).toBe('unavailable');
    if (activationFailed.status !== 'unavailable') {
      throw new Error('Expected activation failure to be unavailable.');
    }
    expect(activationFailed.unavailableReason).toBe('activation-failed');
  });
});

describe('Flowguard Git impact updates', () => {
  test('calculates advisory direct impact and publishes tree and webview payloads', async () => {
    const root = createRoot();
    const provider = new FakeChangedPathProvider({
      status: 'available',
      advisory: true,
      label: 'Advisory Git impact',
      repositories: [
        {
          rootUri: root.uri,
          changedPaths: ['src/server/auth.ts'],
        },
      ],
      changedPaths: ['src/server/auth.ts'],
    });
    const controller = new FlowguardGitImpactController({
      changedPathProvider: provider,
      workspaceSnapshot: await createWorkspaceSnapshot(root, makeLoginFlowFixture()),
      clock: () => '2026-06-20T12:00:00.000Z',
    });
    const updates: FlowguardGitImpactUpdate[] = [];
    controller.onDidChangeImpact((update) => updates.push(update));

    const update = await controller.start();
    const impact = update.webview.repositories[0]?.flows[0]?.impact;

    expect(update.tree).toEqual({
      advisory: true,
      label: 'Advisory Git impact',
      changedPaths: ['src/server/auth.ts'],
      repositories: [
        {
          rootUri: root.uri,
          changedPaths: ['src/server/auth.ts'],
        },
      ],
    });
    expect(update.webview.status).toBe('available');
    expect(update.webview.label).toBe('Advisory Git impact');
    expect(update.webview.repositories[0]?.changedPaths).toEqual(['src/server/auth.ts']);
    expect(impact?.level).toBe('direct');
    expect(impact?.matchedPaths).toEqual(['src/server/auth.ts']);
    expect(update.webview.repositories[0]?.flows[0]?.advisoryLabel).toBe(
      'Potentially affected by direct source match',
    );
    expect(updates).toHaveLength(1);

    provider.emit({
      status: 'available',
      advisory: true,
      label: 'Advisory Git impact',
      repositories: [
        {
          rootUri: root.uri,
          changedPaths: ['src/routes/login.tsx'],
        },
      ],
      changedPaths: ['src/routes/login.tsx'],
    });

    expect(updates.at(-1)?.webview.repositories[0]?.flows[0]?.impact?.matchedPaths).toEqual([
      'src/routes/login.tsx',
    ]);

    controller.dispose();
  });

  test('labels unmatched and unavailable impact without claiming flows are safe', async () => {
    const root = createRoot();
    const snapshot = await createWorkspaceSnapshot(root, makeLoginFlowFixture());
    const unmatched = createFlowguardGitImpactUpdate({
      workspaceSnapshot: snapshot,
      generatedAt: '2026-06-20T12:00:00.000Z',
      changedPaths: {
        status: 'available',
        advisory: true,
        label: 'Advisory Git impact',
        repositories: [
          {
            rootUri: root.uri,
            changedPaths: ['src/unreferenced.ts'],
          },
        ],
        changedPaths: ['src/unreferenced.ts'],
      },
    });
    const unavailable = createFlowguardGitImpactUpdate({
      workspaceSnapshot: snapshot,
      generatedAt: '2026-06-20T12:00:00.000Z',
      changedPaths: unavailableGitChangedPathSnapshot(
        'extension-unavailable',
        'The built-in Git extension is unavailable.',
      ),
    });

    expect(unmatched.webview.repositories[0]?.flows[0]?.impact?.level).toBe('none');
    expect(unmatched.webview.repositories[0]?.flows[0]?.advisoryDescription).toContain(
      'does not prove the flow is unaffected',
    );
    expect(unavailable.webview.status).toBe('unavailable');
    expect(unavailable.tree.changedPaths).toEqual([]);
    expect(unavailable.webview.repositories[0]?.flows[0]?.impact).toBeUndefined();
    expect(unavailable.webview.repositories[0]?.flows[0]?.advisoryLabel).toBe(
      'Git impact unavailable',
    );
  });
});

const fileChange = (uri: string, originalUri?: string): BuiltInGitFileChange => {
  return {
    uri: new FakeUri(uri),
    originalUri: originalUri === undefined ? undefined : new FakeUri(originalUri),
  };
};

const createRoot = (): WorkspaceRoot => {
  return { uri: 'file:///repo', name: 'repo', index: 0 };
};

const createWorkspaceSnapshot = async (
  root: WorkspaceRoot,
  flow: FlowguardFlow,
): Promise<FlowguardWorkspaceSnapshot> => {
  const config = makeFlowguardConfigFixture();

  return {
    version: 1,
    sequence: 1,
    generatedAt: '2026-06-20T12:00:00.000Z',
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
        flows: [await createFlowDocument(root, flow)],
        proposals: [],
        coverage: [],
        invalidDocuments: [],
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

const settleAsyncHandlers = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

class FakeUri implements GitUriLike {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

class FakeGitRepository implements BuiltInGitRepository {
  readonly rootUri: GitUriLike;
  readonly #stateListeners = new Set<() => void>();
  state: BuiltInGitRepository['state'];

  constructor(rootUri: string, state: BuiltInGitRepository['state']) {
    this.rootUri = new FakeUri(rootUri);
    this.state = state;
  }

  onDidChangeState(listener: () => void): DisposableLike {
    this.#stateListeners.add(listener);

    return {
      dispose: () => {
        this.#stateListeners.delete(listener);
      },
    };
  }

  emitStateChange(): void {
    for (const listener of this.#stateListeners) listener();
  }
}

class FakeGitApi implements BuiltInGitApi {
  readonly onDidOpenRepositoryListeners = new Set<(repository: BuiltInGitRepository) => void>();
  readonly onDidCloseRepositoryListeners = new Set<(repository: BuiltInGitRepository) => void>();

  constructor(readonly repositories: readonly BuiltInGitRepository[]) {}

  onDidOpenRepository(listener: (repository: BuiltInGitRepository) => void): DisposableLike {
    this.onDidOpenRepositoryListeners.add(listener);

    return {
      dispose: () => {
        this.onDidOpenRepositoryListeners.delete(listener);
      },
    };
  }

  onDidCloseRepository(listener: (repository: BuiltInGitRepository) => void): DisposableLike {
    this.onDidCloseRepositoryListeners.add(listener);

    return {
      dispose: () => {
        this.onDidCloseRepositoryListeners.delete(listener);
      },
    };
  }
}

class FakeGitExtension implements GitExtensionLike<BuiltInGitExtension> {
  readonly exports: BuiltInGitExtension | undefined;

  constructor(api: BuiltInGitApi, options: { readonly enabled?: boolean } = {}) {
    this.exports = {
      enabled: options.enabled,
      getAPI: () => api,
    };
  }

  activate(): BuiltInGitExtension {
    if (this.exports === undefined) throw new Error('Missing fake Git exports.');
    return this.exports;
  }
}

class FailingGitExtension implements GitExtensionLike<BuiltInGitExtension> {
  readonly exports = undefined;

  activate(): BuiltInGitExtension {
    throw new Error('Activation failed.');
  }
}

class FakeGitExtensionHost implements GitExtensionHost {
  constructor(readonly extension: GitExtensionLike<BuiltInGitExtension> | undefined) {}

  getExtension<TExports>(): GitExtensionLike<TExports> | undefined {
    return this.extension as GitExtensionLike<TExports> | undefined;
  }
}

class FakeChangedPathProvider implements GitChangedPathProvider {
  readonly #listeners = new Set<GitChangedPathListener>();

  constructor(public snapshot: GitChangedPathSnapshot) {}

  onDidChangeChangedPaths(listener: GitChangedPathListener): DisposableLike {
    this.#listeners.add(listener);

    return {
      dispose: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  async getChangedPaths(): Promise<GitChangedPathSnapshot> {
    return this.snapshot;
  }

  emit(snapshot: GitChangedPathSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }

  dispose(): void {}
}

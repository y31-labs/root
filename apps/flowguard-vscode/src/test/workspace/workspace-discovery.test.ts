import { describe, expect, test } from 'bun:test';

import {
  digestFlowguardFlow,
  makeLoginCoverageFixture,
  makeLoginFlowFixture,
  makePasswordResetProposalFixture,
  makeFlowguardConfigFixture,
} from '@workspace/flowguard-contracts';

import { FlowguardDiagnosticsPublisher } from '#/extension/diagnostics';
import type { FlowguardDiagnostic, FlowguardDiagnosticSink } from '#/extension/diagnostics';
import {
  FlowguardWorkspaceService,
  FLOWGUARD_DIRECTORY,
  FLOWGUARD_WATCH_PATTERN,
  joinRepositoryUri,
  type WorkspaceDebounceScheduler,
  type WorkspaceDirectoryEntry,
  type WorkspaceDisposable,
  type WorkspaceFileEvent,
  type WorkspaceFileEventKind,
  type WorkspaceFileEventListener,
  type WorkspaceFileSystem,
  type WorkspaceFileWatcher,
  type WorkspaceFileWatcherProvider,
  type WorkspaceRoot,
  type WorkspaceScheduledCallback,
} from '#/extension/workspace';

describe('Flowguard workspace discovery', () => {
  test('loads valid documents per workspace while reporting invalid files', async () => {
    const fs = new MemoryWorkspaceFileSystem();
    const sink = new RecordingDiagnosticSink();
    const roots = [
      createRoot('file:///repo-a', 'repo-a', 0),
      createRoot('file:///repo-b', 'repo-b', 1),
    ];
    const loginFlow = makeLoginFlowFixture();
    const loginDigest = await digestFlowguardFlow(loginFlow);
    const proposal = makePasswordResetProposalFixture(loginDigest);
    const coverage = makeLoginCoverageFixture();
    const validFlowUri = flowUri(roots[0], 'login.json');
    const invalidFlowUri = flowUri(roots[0], 'broken.json');
    const proposalUri = proposalDocumentUri(roots[0], 'password-reset.json');
    const coverageUri = coverageDocumentUri(roots[0], 'login-e2e.json');
    const invalidCoverageUri = coverageDocumentUri(roots[0], 'broken-coverage.json');
    const secondRootFlowUri = flowUri(roots[1], 'login.json');

    fs.writeJson(configUri(roots[0]), makeFlowguardConfigFixture());
    fs.writeJson(validFlowUri, loginFlow);
    fs.writeJson(invalidFlowUri, {
      ...loginFlow,
      id: 'broken',
      entryStateId: 'missing-state',
    });
    fs.writeJson(proposalUri, proposal);
    fs.writeJson(coverageUri, coverage);
    fs.writeJson(invalidCoverageUri, {
      ...coverage,
      id: 'broken-coverage',
      evidence: [{ kind: 'video', label: 'Replay', required: true }],
    });
    fs.writeJson(secondRootFlowUri, loginFlow);

    const service = new FlowguardWorkspaceService({
      workspaceRoots: roots,
      fs,
      diagnostics: new FlowguardDiagnosticsPublisher(sink),
      clock: () => '2026-06-20T00:00:00.000Z',
    });
    const snapshot = await service.start();

    expect(snapshot.sequence).toBe(1);
    expect(snapshot.generatedAt).toBe('2026-06-20T00:00:00.000Z');
    expect(snapshot.repositories.map((repository) => repository.root.uri)).toEqual([
      'file:///repo-a',
      'file:///repo-b',
    ]);

    const repoA = requireRepository(snapshot, roots[0]);
    expect(repoA.config.source).toBe('file');
    expect(repoA.config.valid).toBe(true);
    expect(repoA.flows.map((flow) => flow.document.id)).toEqual(['login']);
    expect(repoA.proposals.map((item) => item.document.flowId)).toEqual(['login']);
    expect(repoA.coverage.map((item) => item.document.id)).toEqual(['login-e2e']);
    expect(repoA.invalidDocuments.map((document) => document.relativePath)).toEqual([
      '.flowguard/flows/broken.json',
      '.flowguard/coverage/broken-coverage.json',
    ]);

    const repoB = requireRepository(snapshot, roots[1]);
    expect(repoB.config.source).toBe('default');
    expect(repoB.flows.map((flow) => `${flow.root.name}:${flow.document.id}`)).toEqual([
      'repo-b:login',
    ]);

    expect(sink.entries.get(validFlowUri)).toEqual([]);
    const invalidDiagnostics = sink.entries.get(invalidFlowUri);
    expect(invalidDiagnostics?.map((diagnostic) => diagnostic.code)).toEqual(['BROKEN_REFERENCE']);
    expect(invalidDiagnostics?.[0]?.jsonPath).toBe('$.entryStateId');
    expect(invalidDiagnostics?.[0]?.range.start.line).toBeGreaterThan(0);
    expect(sink.entries.get(invalidCoverageUri)?.map((diagnostic) => diagnostic.code)).toEqual([
      'INVALID_VALUE',
      'EMPTY_COLLECTION',
    ]);

    service.dispose();
  });

  test('debounces watcher events and refreshes after delete and rename', async () => {
    const fs = new MemoryWorkspaceFileSystem();
    const sink = new RecordingDiagnosticSink();
    const watcherProvider = new ManualWatcherProvider();
    const scheduler = new ManualScheduler();
    const root = createRoot('file:///repo', 'repo', 0);
    const loginFlow = makeLoginFlowFixture();
    const originalFlowUri = flowUri(root, 'login.json');
    const snapshots: number[] = [];

    fs.writeJson(originalFlowUri, loginFlow);

    const service = new FlowguardWorkspaceService({
      workspaceRoots: [root],
      fs,
      diagnostics: new FlowguardDiagnosticsPublisher(sink),
      watcherProvider,
      scheduler,
      debounceMs: 25,
      clock: () => '2026-06-20T00:00:00.000Z',
    });
    service.onDidChangeSnapshot((snapshot) => {
      snapshots.push(snapshot.sequence);
    });

    await service.start();

    expect(watcherProvider.watchers).toHaveLength(1);
    const watcher = watcherProvider.watchers[0];
    expect(watcher?.pattern).toBe(FLOWGUARD_WATCH_PATTERN);
    expect(snapshots).toEqual([1]);

    const invalidFlowUri = flowUri(root, 'invalid.json');
    fs.writeJson(invalidFlowUri, {
      ...loginFlow,
      id: 'invalid',
      entryStateId: 'missing-state',
    });
    watcher?.emit('create', invalidFlowUri);
    watcher?.emit('change', invalidFlowUri);
    expect(scheduler.activeCount).toBe(1);

    await scheduler.flush();

    expect(snapshots).toEqual([1, 2]);
    expect(currentInvalidPaths(service)).toEqual(['.flowguard/flows/invalid.json']);
    expect(sink.entries.get(invalidFlowUri)?.map((diagnostic) => diagnostic.code)).toEqual([
      'BROKEN_REFERENCE',
    ]);

    fs.delete(invalidFlowUri);
    watcher?.emit('delete', invalidFlowUri);
    await scheduler.flush();

    expect(snapshots).toEqual([1, 2, 3]);
    expect(currentInvalidPaths(service)).toEqual([]);
    expect(sink.deletedUris).toContain(invalidFlowUri);

    const renamedFlowUri = flowUri(root, 'renamed-login.json');
    fs.rename(originalFlowUri, renamedFlowUri);
    watcher?.emit('delete', originalFlowUri);
    watcher?.emit('create', renamedFlowUri);
    expect(scheduler.activeCount).toBe(1);

    await scheduler.flush();

    expect(snapshots).toEqual([1, 2, 3, 4]);
    expect(currentFlowPaths(service)).toEqual(['.flowguard/flows/renamed-login.json']);

    service.dispose();
    expect(watcher?.disposed).toBe(true);
    const snapshotCountAfterDispose = snapshots.length;
    fs.writeJson(flowUri(root, 'after-dispose.json'), loginFlow);
    watcher?.emit('create', flowUri(root, 'after-dispose.json'));
    await scheduler.flush();
    expect(snapshots).toHaveLength(snapshotCountAfterDispose);
    expect(sink.disposed).toBe(true);
  });
});

const createRoot = (uri: string, name: string, index: number): WorkspaceRoot => {
  return { uri, name, index };
};

const configUri = (root: WorkspaceRoot): string => {
  return joinRepositoryUri(root.uri, FLOWGUARD_DIRECTORY, 'config.json');
};

const flowUri = (root: WorkspaceRoot, fileName: string): string => {
  return joinRepositoryUri(root.uri, FLOWGUARD_DIRECTORY, 'flows', fileName);
};

const proposalDocumentUri = (root: WorkspaceRoot, fileName: string): string => {
  return joinRepositoryUri(root.uri, FLOWGUARD_DIRECTORY, 'proposals', fileName);
};

const coverageDocumentUri = (root: WorkspaceRoot, fileName: string): string => {
  return joinRepositoryUri(root.uri, FLOWGUARD_DIRECTORY, 'coverage', fileName);
};

const requireRepository = (
  snapshot: NonNullable<FlowguardWorkspaceService['snapshot']>,
  root: WorkspaceRoot,
) => {
  const repository = snapshot.repositories.find((item) => item.root.uri === root.uri);
  if (repository === undefined) {
    throw new Error(`Expected repository snapshot for ${root.uri}.`);
  }

  return repository;
};

const currentFlowPaths = (service: FlowguardWorkspaceService): readonly string[] => {
  return service.snapshot?.repositories[0]?.flows.map((flow) => flow.relativePath) ?? [];
};

const currentInvalidPaths = (service: FlowguardWorkspaceService): readonly string[] => {
  return (
    service.snapshot?.repositories[0]?.invalidDocuments.map((document) => document.relativePath) ??
    []
  );
};

class MemoryWorkspaceFileSystem implements WorkspaceFileSystem {
  readonly #files = new Map<string, string>();

  writeJson(uri: string, value: unknown): void {
    this.#files.set(uri, `${JSON.stringify(value, null, 2)}\n`);
  }

  delete(uri: string): void {
    this.#files.delete(uri);
  }

  rename(from: string, to: string): void {
    const text = this.#files.get(from);
    if (text === undefined) {
      throw new Error(`Cannot rename missing file ${from}.`);
    }

    this.#files.delete(from);
    this.#files.set(to, text);
  }

  async readFile(uri: string): Promise<string> {
    const text = this.#files.get(uri);
    if (text === undefined) {
      throw new Error(`Missing file ${uri}.`);
    }

    return text;
  }

  async readDirectory(uri: string): Promise<readonly WorkspaceDirectoryEntry[]> {
    const prefix = `${uri.replace(/\/+$/u, '')}/`;
    const entries = new Map<string, WorkspaceDirectoryEntry['type']>();

    for (const fileUri of this.#files.keys()) {
      if (!fileUri.startsWith(prefix)) continue;

      const relativePath = fileUri.slice(prefix.length);
      const entryName = relativePath.split('/')[0];
      if (!entryName) continue;

      const type = relativePath.includes('/') ? 'directory' : 'file';
      const existing = entries.get(entryName);
      entries.set(entryName, existing === 'directory' || type === 'directory' ? 'directory' : type);
    }

    return [...entries.entries()]
      .map(([name, type]) => ({ name, type }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}

class RecordingDiagnosticSink implements FlowguardDiagnosticSink {
  readonly entries = new Map<string, readonly FlowguardDiagnostic[]>();
  readonly deletedUris: string[] = [];
  disposed = false;

  set(uri: string, diagnostics: readonly FlowguardDiagnostic[]): void {
    this.entries.set(uri, [...diagnostics]);
  }

  delete(uri: string): void {
    this.deletedUris.push(uri);
    this.entries.delete(uri);
  }

  dispose(): void {
    this.disposed = true;
  }
}

class ManualWatcherProvider implements WorkspaceFileWatcherProvider {
  readonly watchers: ManualWatcher[] = [];

  watch(root: WorkspaceRoot, pattern: string): WorkspaceFileWatcher {
    const watcher = new ManualWatcher(root, pattern);
    this.watchers.push(watcher);
    return watcher;
  }
}

class ManualWatcher implements WorkspaceFileWatcher {
  readonly root: WorkspaceRoot;
  readonly pattern: string;
  readonly #listeners: Record<WorkspaceFileEventKind, Set<WorkspaceFileEventListener>> = {
    create: new Set(),
    change: new Set(),
    delete: new Set(),
  };
  disposed = false;

  constructor(root: WorkspaceRoot, pattern: string) {
    this.root = root;
    this.pattern = pattern;
  }

  onDidCreate(listener: WorkspaceFileEventListener): WorkspaceDisposable {
    return this.#addListener('create', listener);
  }

  onDidChange(listener: WorkspaceFileEventListener): WorkspaceDisposable {
    return this.#addListener('change', listener);
  }

  onDidDelete(listener: WorkspaceFileEventListener): WorkspaceDisposable {
    return this.#addListener('delete', listener);
  }

  emit(kind: WorkspaceFileEventKind, uri: string): void {
    if (this.disposed) return;

    const event: WorkspaceFileEvent = { kind, root: this.root, uri };
    for (const listener of this.#listeners[kind]) {
      listener(event);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const listeners of Object.values(this.#listeners)) {
      listeners.clear();
    }
  }

  #addListener(
    kind: WorkspaceFileEventKind,
    listener: WorkspaceFileEventListener,
  ): WorkspaceDisposable {
    this.#listeners[kind].add(listener);

    return {
      dispose: () => {
        this.#listeners[kind].delete(listener);
      },
    };
  }
}

interface ScheduledItem {
  readonly callback: WorkspaceScheduledCallback;
  disposed: boolean;
}

class ManualScheduler implements WorkspaceDebounceScheduler {
  readonly #items: ScheduledItem[] = [];

  get activeCount(): number {
    return this.#items.filter((item) => !item.disposed).length;
  }

  schedule(callback: WorkspaceScheduledCallback, _delayMs: number): WorkspaceDisposable {
    const item: ScheduledItem = { callback, disposed: false };
    this.#items.push(item);

    return {
      dispose: () => {
        item.disposed = true;
      },
    };
  }

  async flush(): Promise<void> {
    const items = this.#items.splice(0);

    for (const item of items) {
      if (item.disposed) continue;

      item.disposed = true;
      await item.callback();
    }
  }
}

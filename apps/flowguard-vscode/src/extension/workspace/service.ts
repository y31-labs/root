import type { FlowguardDiagnosticsPublisher } from '#/extension/diagnostics/publisher';
import { discoverFlowguardWorkspace } from '#/extension/workspace/discovery';
import {
  FLOWGUARD_WATCH_PATTERN,
  type FlowguardWorkspaceSnapshot,
  type WorkspaceDebounceScheduler,
  type WorkspaceDisposable,
  type WorkspaceFileEvent,
  type WorkspaceFileSystem,
  type WorkspaceFileWatcher,
  type WorkspaceFileWatcherProvider,
  type WorkspaceRoot,
  type WorkspaceScheduledCallback,
} from '#/extension/workspace/types';

export interface FlowguardWorkspaceServiceOptions {
  readonly workspaceRoots: readonly WorkspaceRoot[] | undefined;
  readonly fs: WorkspaceFileSystem;
  readonly diagnostics?: FlowguardDiagnosticsPublisher;
  readonly watcherProvider?: WorkspaceFileWatcherProvider;
  readonly scheduler?: WorkspaceDebounceScheduler;
  readonly debounceMs?: number;
  readonly clock?: () => string;
}

export type FlowguardWorkspaceSnapshotListener = (
  snapshot: FlowguardWorkspaceSnapshot,
) => void | Promise<void>;

export class FlowguardWorkspaceService implements WorkspaceDisposable {
  readonly #workspaceRoots: readonly WorkspaceRoot[] | undefined;
  readonly #fs: WorkspaceFileSystem;
  readonly #diagnostics: FlowguardDiagnosticsPublisher | undefined;
  readonly #watcherProvider: WorkspaceFileWatcherProvider | undefined;
  readonly #scheduler: WorkspaceDebounceScheduler;
  readonly #debounceMs: number;
  readonly #clock: () => string;
  readonly #watchers = new Set<WorkspaceFileWatcher>();
  readonly #watcherSubscriptions = new Set<WorkspaceDisposable>();
  readonly #snapshotListeners = new Set<FlowguardWorkspaceSnapshotListener>();
  #pendingRefresh: WorkspaceDisposable | undefined;
  #started = false;
  #disposed = false;
  #sequence = 0;
  #snapshot: FlowguardWorkspaceSnapshot | undefined;
  #lastRefreshError: unknown;

  constructor(options: FlowguardWorkspaceServiceOptions) {
    this.#workspaceRoots = options.workspaceRoots;
    this.#fs = options.fs;
    this.#diagnostics = options.diagnostics;
    this.#watcherProvider = options.watcherProvider;
    this.#scheduler = options.scheduler ?? new TimeoutDebounceScheduler();
    this.#debounceMs = options.debounceMs ?? 75;
    this.#clock = options.clock ?? (() => new Date().toISOString());
  }

  get snapshot(): FlowguardWorkspaceSnapshot | undefined {
    return this.#snapshot;
  }

  get lastRefreshError(): unknown {
    return this.#lastRefreshError;
  }

  onDidChangeSnapshot(listener: FlowguardWorkspaceSnapshotListener): WorkspaceDisposable {
    if (this.#disposed) {
      return { dispose() {} };
    }

    this.#snapshotListeners.add(listener);

    return {
      dispose: () => {
        this.#snapshotListeners.delete(listener);
      },
    };
  }

  async start(): Promise<FlowguardWorkspaceSnapshot> {
    this.#throwIfDisposed();

    if (!this.#started) {
      this.#started = true;
      this.#registerWatchers();
    }

    return this.refresh();
  }

  async refresh(): Promise<FlowguardWorkspaceSnapshot> {
    this.#throwIfDisposed();
    this.#pendingRefresh?.dispose();
    this.#pendingRefresh = undefined;

    const snapshot = await discoverFlowguardWorkspace({
      workspaceRoots: this.#workspaceRoots,
      fs: this.#fs,
      sequence: this.#sequence + 1,
      generatedAt: this.#clock(),
    });
    this.#sequence = snapshot.sequence;
    this.#snapshot = snapshot;
    this.#lastRefreshError = undefined;
    this.#diagnostics?.publish(snapshot);
    await this.#emitSnapshot(snapshot);

    return snapshot;
  }

  dispose(): void {
    if (this.#disposed) return;

    this.#disposed = true;
    this.#pendingRefresh?.dispose();
    this.#pendingRefresh = undefined;

    for (const subscription of [...this.#watcherSubscriptions].reverse()) {
      subscription.dispose();
    }
    this.#watcherSubscriptions.clear();

    for (const watcher of [...this.#watchers].reverse()) {
      watcher.dispose();
    }
    this.#watchers.clear();
    this.#snapshotListeners.clear();
    this.#diagnostics?.dispose();
  }

  #registerWatchers(): void {
    if (this.#watcherProvider === undefined) return;

    for (const root of this.#workspaceRoots ?? []) {
      const watcher = this.#watcherProvider.watch(root, FLOWGUARD_WATCH_PATTERN);
      this.#watchers.add(watcher);
      this.#watcherSubscriptions.add(watcher.onDidCreate((event) => this.#scheduleRefresh(event)));
      this.#watcherSubscriptions.add(watcher.onDidChange((event) => this.#scheduleRefresh(event)));
      this.#watcherSubscriptions.add(watcher.onDidDelete((event) => this.#scheduleRefresh(event)));
    }
  }

  #scheduleRefresh(_event: WorkspaceFileEvent): void {
    if (this.#disposed) return;

    this.#pendingRefresh?.dispose();
    this.#pendingRefresh = this.#scheduler.schedule(async () => {
      this.#pendingRefresh = undefined;
      try {
        await this.refresh();
      } catch (caught) {
        this.#lastRefreshError = caught;
      }
    }, this.#debounceMs);
  }

  async #emitSnapshot(snapshot: FlowguardWorkspaceSnapshot): Promise<void> {
    for (const listener of [...this.#snapshotListeners]) {
      await listener(snapshot);
    }
  }

  #throwIfDisposed(): void {
    if (this.#disposed) {
      throw new Error('Flowguard workspace service has been disposed.');
    }
  }
}

class TimeoutDebounceScheduler implements WorkspaceDebounceScheduler {
  schedule(callback: WorkspaceScheduledCallback, delayMs: number): WorkspaceDisposable {
    const handle = setTimeout(() => {
      void callback();
    }, delayMs);

    return {
      dispose: () => clearTimeout(handle),
    };
  }
}

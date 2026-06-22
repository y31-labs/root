import { DisposableStore, type DisposableLike } from '#/extension/services/disposables';

export interface UriLike {
  toString(): string;
}

export interface WorkspaceFolderLike {
  readonly uri: UriLike;
  readonly name: string;
  readonly index: number;
}

export class RepositoryServiceScope implements DisposableLike {
  readonly #disposables = new DisposableStore();

  constructor(readonly workspaceFolder: WorkspaceFolderLike) {}

  get repositoryUri(): string {
    return this.workspaceFolder.uri.toString();
  }

  get isDisposed(): boolean {
    return this.#disposables.isDisposed;
  }

  addDisposable<T extends DisposableLike>(disposable: T): T {
    return this.#disposables.add(disposable);
  }

  dispose(): void {
    this.#disposables.dispose();
  }
}

export class FlowguardServiceContainer implements DisposableLike {
  readonly #disposables = new DisposableStore();
  readonly repositories: readonly RepositoryServiceScope[];

  constructor(workspaceFolders: readonly WorkspaceFolderLike[] | undefined) {
    this.repositories = (workspaceFolders ?? []).map((workspaceFolder) =>
      this.#disposables.add(new RepositoryServiceScope(workspaceFolder)),
    );
  }

  get isDisposed(): boolean {
    return this.#disposables.isDisposed;
  }

  get repositoryCount(): number {
    return this.repositories.length;
  }

  addDisposable<T extends DisposableLike>(disposable: T): T {
    return this.#disposables.add(disposable);
  }

  dispose(): void {
    this.#disposables.dispose();
  }
}

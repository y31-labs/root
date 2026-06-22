export interface DisposableLike {
  dispose(): void;
}

export const noopDisposable = (): DisposableLike => {
  return { dispose: () => {} };
};

export class DisposableStore implements DisposableLike {
  readonly #disposables = new Set<DisposableLike>();
  #isDisposed = false;

  get isDisposed(): boolean {
    return this.#isDisposed;
  }

  get size(): number {
    return this.#disposables.size;
  }

  add<T extends DisposableLike>(disposable: T): T {
    if (this.#isDisposed) {
      disposable.dispose();
      return disposable;
    }

    this.#disposables.add(disposable);
    return disposable;
  }

  dispose(): void {
    if (this.#isDisposed) {
      return;
    }

    this.#isDisposed = true;
    const disposables = Array.from(this.#disposables);
    this.#disposables.clear();

    for (const disposable of disposables.reverse()) {
      disposable.dispose();
    }
  }
}

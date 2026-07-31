export interface AsyncQueue<T> extends AsyncIterable<T>, AsyncIterator<T> {
  clear: () => void;
  close: () => void;
  push: (value: T) => void;
}

export const createAsyncQueue = <T>(): AsyncQueue<T> => {
  const buffer: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    for (const waiter of waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  };

  const queue: AsyncQueue<T> = {
    [Symbol.asyncIterator]: () => queue,
    clear: () => buffer.splice(0),
    close,
    next: () => {
      const value = buffer.shift();
      if (value !== undefined) return Promise.resolve({ done: false, value });
      if (closed) return Promise.resolve({ done: true, value: undefined });
      return new Promise((resolve) => waiters.push(resolve));
    },
    push: (value) => {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) waiter({ done: false, value });
      else buffer.push(value);
    },
    return: () => {
      close();
      return Promise.resolve({ done: true, value: undefined });
    },
  };

  return queue;
};

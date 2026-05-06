import { thru } from 'lodash-es';
import { useEffect, useState } from 'react';

type LocalStorageKeyPair = {
  'watchlist:last-selected-symbol': string | null;
};

export function useLocalStorage<K extends keyof LocalStorageKeyPair>(
  key: K,
  initialValue: LocalStorageKeyPair[K],
): [
  LocalStorageKeyPair[K],
  (
    newValue:
      | LocalStorageKeyPair[K]
      | ((prev: LocalStorageKeyPair[K]) => LocalStorageKeyPair[K]),
  ) => void,
] {
  const [value, setValue] = useState<LocalStorageKeyPair[K]>(() => {
    try {
      return thru(localStorage.getItem(key), (item) =>
        item ? (JSON.parse(item) as LocalStorageKeyPair[K]) : initialValue,
      );
    } catch {
      return initialValue;
    }
  });

  useSetLocalStorage(key, value);

  const setStoredValue = (
    newValue:
      | LocalStorageKeyPair[K]
      | ((prev: LocalStorageKeyPair[K]) => LocalStorageKeyPair[K]),
  ) =>
    setValue((prev) =>
      newValue instanceof Function ? newValue(prev) : newValue,
    );
  return [value, setStoredValue];
}

export function useSetLocalStorage<K extends keyof LocalStorageKeyPair>(
  key: K,
  value: LocalStorageKeyPair[K],
) {
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Failed to set localStorage key ${key} to ${value}:`, e);
    }
  }, [key, value]);
}


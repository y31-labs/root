import { useCallback, useState } from 'react';

export const useLocalStorage = (key: string) => {
  const [value, setValue] = useState<string | undefined>(
    () => window.localStorage.getItem(key) ?? undefined,
  );

  const setStoredValue = useCallback(
    (nextValue: string | undefined) => {
      setValue(nextValue);
      if (nextValue === undefined) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, nextValue);
    },
    [key],
  );

  return [value, setStoredValue] as const;
};

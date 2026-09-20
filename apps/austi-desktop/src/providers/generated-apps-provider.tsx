import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

import type { GeneratedAppSummary } from '#/lib/local-api';
import { useLocalApi } from '#/providers/local-api-provider';

interface GeneratedAppsContextValue {
  apps: GeneratedAppSummary[];
  loading: boolean;
  refresh: () => void;
}

const GeneratedAppsContext = createContext<GeneratedAppsContextValue>({
  apps: [],
  loading: false,
  refresh: () => {},
});

export function GeneratedAppsProvider({ children }: { children: ReactNode }) {
  const api = useLocalApi();
  const [apps, setApps] = useState<GeneratedAppSummary[]>([]);
  const [loading, startTransition] = useTransition();

  const refresh = useCallback(
    () =>
      startTransition(async () => {
        const apps = await api.listGeneratedApps().catch(console.error);
        if (apps) startTransition(() => setApps(apps));
      }),
    [api],
  );

  useEffect(() => refresh(), [refresh]);

  const value = useMemo(() => ({ apps, loading, refresh }), [apps, loading, refresh]);

  return <GeneratedAppsContext.Provider value={value}>{children}</GeneratedAppsContext.Provider>;
}

export const useGeneratedApps = () => useContext(GeneratedAppsContext);

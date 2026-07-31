import { createContext, useContext, type ReactNode } from 'react';

import { localApi, type LocalApi } from '#/lib/local-api';

const LocalApiContext = createContext<LocalApi>(localApi);

export function LocalApiProvider({
  api = localApi,
  children,
}: {
  api?: LocalApi;
  children: ReactNode;
}) {
  return <LocalApiContext.Provider value={api}>{children}</LocalApiContext.Provider>;
}

export const useLocalApi = () => useContext(LocalApiContext);

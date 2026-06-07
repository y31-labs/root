import type { ConvexQueryClient } from '@convex-dev/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ConvexProviderWithAuth } from 'convex/react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { DesktopAuthGate } from '#/providers/desktop-auth-gate';

function useDesktopAuth() {
  const [state, setState] = useState({ loading: true, authenticated: false });

  useEffect(() => {
    const refreshState = () =>
      invoke<string | null>('get_access_token', { forceRefresh: false })
        .then((token) => setState({ loading: false, authenticated: Boolean(token) }))
        .catch(() => setState({ loading: false, authenticated: false }));
    void refreshState();
    const unlisten = listen('auth-changed', refreshState);
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  const fetchAccessToken = useCallback(
    ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
      invoke<string | null>('get_access_token', { forceRefresh: forceRefreshToken }),
    [],
  );

  return useMemo(
    () => ({
      isLoading: state.loading,
      isAuthenticated: state.authenticated,
      fetchAccessToken,
    }),
    [fetchAccessToken, state],
  );
}

export function DesktopConvexProvider({
  children,
  convexQueryClient,
}: {
  children: ReactNode;
  convexQueryClient: ConvexQueryClient;
}) {
  return (
    <ConvexProviderWithAuth client={convexQueryClient.convexClient} useAuth={useDesktopAuth}>
      <DesktopAuthGate>{children}</DesktopAuthGate>
    </ConvexProviderWithAuth>
  );
}

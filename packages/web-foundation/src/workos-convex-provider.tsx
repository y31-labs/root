import { ConvexQueryClient } from '@convex-dev/react-query';
import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from '@workos/authkit-tanstack-react-start/client';
import type { AuthKitProviderProps } from '@workos/authkit-tanstack-react-start/client';
import { ConvexProviderWithAuth } from 'convex/react';
import { type ReactNode, useCallback, useMemo } from 'react';

export function getConvexAuthState(
  loading: boolean,
  user: unknown,
  fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
) {
  return {
    isLoading: loading,
    isAuthenticated: !!user,
    fetchAccessToken,
  };
}

function useAuthFromAuthKit() {
  const { loading, user } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) return null;

      if (forceRefreshToken) return (await refresh()) ?? null;

      return (await getAccessToken()) ?? null;
    },
    [user, refresh, getAccessToken],
  );

  return useMemo(
    () => getConvexAuthState(loading, user, fetchAccessToken),
    [loading, user, fetchAccessToken],
  );
}

export function WorkosConvexProvider({
  children,
  convexQueryClient,
  initialAuth,
}: {
  children: ReactNode;
  convexQueryClient: ConvexQueryClient;
  initialAuth?: AuthKitProviderProps['initialAuth'];
}) {
  return (
    <AuthKitProvider initialAuth={initialAuth}>
      <ConvexProviderWithAuth client={convexQueryClient.convexClient} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

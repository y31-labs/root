import { ConvexQueryClient } from '@convex-dev/react-query';
import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from '@workos/authkit-tanstack-react-start/client';
import { ConvexProviderWithAuth } from 'convex/react';
import { type ReactNode, useCallback, useMemo } from 'react';

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
    () => ({
      isLoading: loading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [loading, user, fetchAccessToken],
  );
}

export function WorkosConvexProvider({
  children,
  convexQueryClient,
}: {
  children: ReactNode;
  convexQueryClient: ConvexQueryClient;
}) {
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convexQueryClient.convexClient} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

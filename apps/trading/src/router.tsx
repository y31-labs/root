import { ErrorView } from '#/components/app/error-view';
import { TooltipProvider } from '#/components/ui/tooltip';
import { getEnv } from '#/lib/utils';
import { routeTree } from '#/routeTree.gen';
import { ConvexQueryClient } from '@convex-dev/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from '@workos/authkit-tanstack-react-start/client';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { useCallback, useMemo } from 'react';

const CONVEX_URL = getEnv('VITE_CONVEX_URL');

const convexClient = new ConvexReactClient(CONVEX_URL);
const convexQueryClient = new ConvexQueryClient(convexClient);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
      experimental_prefetchInRender: true,
    },
  },
});
convexQueryClient.connect(queryClient);

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: {
      queryClient,
      convexClient,
      convexQueryClient,
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => <ErrorView title='Not found' />,
    defaultErrorComponent: ({ error, reset }) => (
      <ErrorView title='Not found' error={error} onRetry={reset} />
    ),
    Wrap: ({ children }) => (
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <AuthKitProvider>
            <ConvexProviderWithAuth
              client={convexQueryClient.convexClient}
              useAuth={useAuthFromAuthKit}
            >
              {children}
            </ConvexProviderWithAuth>
          </AuthKitProvider>
        </QueryClientProvider>
      </TooltipProvider>
    ),
  });

  return router;
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
    () => ({
      isLoading: loading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [loading, user, fetchAccessToken],
  );
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}


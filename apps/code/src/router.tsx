import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { ErrorView } from '@workspace/ui/components/app/error-view';
import { TooltipProvider } from '@workspace/ui/components/ui/tooltip';
import { createConvexReactQueryStack } from '@workspace/web-foundation';

import { getEnv } from '#/lib/utils';
import { routeTree } from '#/routeTree.gen';

export const getRouter = () => {
  const { queryClient, convexClient, convexQueryClient } = createConvexReactQueryStack(() =>
    getEnv('VITE_CONVEX_URL'),
  );
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
      <ErrorView title='Something went wrong' error={error} onRetry={reset} />
    ),
    Wrap: ({ children }) => (
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TooltipProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: false,
  });

  return router;
};

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

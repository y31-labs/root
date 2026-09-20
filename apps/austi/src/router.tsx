import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { ErrorView } from '@workspace/ui/components/app/error-view';
import { TooltipProvider } from '@workspace/ui/components/ui/tooltip';
import { createConvexReactQueryStack } from '@workspace/web-foundation';

import { routeTree } from '#/routeTree.gen';

export const getRouter = () => {
  const { queryClient, convexClient, convexQueryClient } = createConvexReactQueryStack(() => {
    const url = import.meta.env.VITE_CONVEX_URL;
    if (!url)
      throw new Error('Environment variable VITE_CONVEX_URL is not set in the root environment');
    return url;
  });
  const router = createRouter({
    routeTree,
    context: { queryClient, convexClient, convexQueryClient },
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

  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });
  return router;
};

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

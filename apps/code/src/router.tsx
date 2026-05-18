import { ErrorView } from '#/components/app/error-view';
import { getEnv } from '#/lib/utils';
import { routeTree } from '#/routeTree.gen';
import { WorkosConvexProvider, createConvexReactQueryStack } from '@workspace/web-foundation';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';

const { queryClient, convexClient, convexQueryClient } = createConvexReactQueryStack(() =>
  getEnv('VITE_CONVEX_URL'),
);

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    context: {
      queryClient,
      convexClient,
      convexQueryClient,
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => <ErrorView title="Not found" />,
    defaultErrorComponent: ({ error, reset }) => (
      <ErrorView title="Something went wrong" error={error} onRetry={reset} />
    ),
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    InnerWrap: ({ children }) => (
      <WorkosConvexProvider convexQueryClient={convexQueryClient}>{children}</WorkosConvexProvider>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

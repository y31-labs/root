import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { ErrorView } from '@workspace/ui/components/app/error-view';
import { TooltipProvider } from '@workspace/ui/components/ui/tooltip';

import { routeTree } from '#/routeTree.gen';

export const getRouter = () =>
  createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => <ErrorView title='Not found' />,
    defaultErrorComponent: ({ error, reset }) => (
      <ErrorView title='Something went wrong' error={error} onRetry={reset} />
    ),
    Wrap: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

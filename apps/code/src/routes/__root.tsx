import type { ConvexQueryClient } from '@convex-dev/react-query';
import { type QueryClient } from '@tanstack/react-query';
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from '@tanstack/react-router';
import { getAuth } from '@workos/authkit-tanstack-react-start';
import { LoadingView } from '@workspace/ui/components/app/loading-view';
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/ui/sidebar';
import {
  WorkosConvexProvider,
  fetchWorkosAuth,
  setConvexQueryClientAuthForSsr,
} from '@workspace/web-foundation';
import { AuthLoading, Authenticated, type ConvexReactClient } from 'convex/react';
import { type PropsWithChildren, type ReactNode } from 'react';

import { AppSidebar } from '#/components/app/app-sidebar';

import themeOverridesUrl from '#/theme-overrides.css?url';
import appCssUrl from '@workspace/ui/globals.css?url';

interface Context {
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
}

export const Route = createRootRouteWithContext<Context>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Code' },
    ],
    links: [
      { rel: 'icon', href: '/code-favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/code-logo.ico', sizes: 'any' },
      { rel: 'stylesheet', href: appCssUrl },
      { rel: 'stylesheet', href: themeOverridesUrl },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const { initialAuth, token } = await fetchWorkosAuth();
    setConvexQueryClientAuthForSsr(context.convexQueryClient, token);
    return { initialAuth };
  },
  loader: async () => {
    const { user } = await getAuth();
    if (!user) throw redirect({ to: '/api/auth/sign-in' });
    return { user };
  },
  component: RootComponent,
});

function RootComponent() {
  const { convexQueryClient, initialAuth } = Route.useRouteContext();

  return (
    <WorkosConvexProvider convexQueryClient={convexQueryClient} initialAuth={initialAuth}>
      <RootDocument>
        <AuthLoading>
          <LoadingView />
        </AuthLoading>
        <Authenticated>
          <LayoutComponent>
            <Outlet />
          </LayoutComponent>
        </Authenticated>
      </RootDocument>
    </WorkosConvexProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang='en' className='dark'>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function LayoutComponent({ children }: PropsWithChildren) {
  const { user } = Route.useLoaderData();

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar user={user} />
      <SidebarInset>
        <div className='flex min-h-svh flex-1 flex-col'>
          <div className='@container/main flex min-h-svh flex-1 flex-col gap-2'>{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

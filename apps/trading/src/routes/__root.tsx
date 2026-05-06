import { AppSidebar } from '#/components/navigation/app-sidebar';
import { SiteHeader } from '#/components/site-header';
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar';
import appCssUrl from '#/styles.css?url';
import type { ConvexQueryClient } from '@convex-dev/react-query';
import { type QueryClient } from '@tanstack/react-query';
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  getAuth,
  getSignInUrl,
  getSignUpUrl,
} from '@workos/authkit-tanstack-react-start';
import { type ConvexReactClient } from 'convex/react';
import { type PropsWithChildren, type ReactNode } from 'react';

interface Context {
  title?: string;
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
}

export const Route = createRootRouteWithContext<Context>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'trading-app' },
    ],
    links: [{ rel: 'stylesheet', href: appCssUrl }],
  }),
  beforeLoad: async ({ context }) => {
    const { userId, token } = await fetchWorkosAuth();

    // During SSR only (the only time serverHttpClient exists),
    // set the WorkOS auth token to make HTTP queries with.
    if (token) context.convexQueryClient.serverHttpClient?.setAuth(token);

    return { userId, token };
  },
  loader: async () =>
    await Promise.all([getAuth(), getSignInUrl(), getSignUpUrl()]).then(
      ([{ user }, signInUrl, signUpUrl]) => ({
        user,
        signInUrl,
        signUpUrl,
      }),
    ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <LayoutComponent>
        <Outlet />
      </LayoutComponent>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang='en'>
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
  const { user, signInUrl, signUpUrl } = Route.useLoaderData();

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <AppSidebar variant='inset' />
      <SidebarInset>
        <SiteHeader user={user} signInUrl={signInUrl} signUpUrl={signUpUrl} />
        <div className='flex flex-1 flex-col'>
          <div className='@container/main flex flex-1 flex-col gap-2'>
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

const fetchWorkosAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const auth = await getAuth();
  const { user } = auth;

  return {
    userId: user?.id ?? null,
    token: user ? auth.accessToken : null,
  };
});


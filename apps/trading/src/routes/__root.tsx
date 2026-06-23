import type { ConvexQueryClient } from '@convex-dev/react-query';
import { type QueryClient } from '@tanstack/react-query';
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from '@tanstack/react-router';
import { getAuth, getSignInUrl, getSignUpUrl } from '@workos/authkit-tanstack-react-start';
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/ui/sidebar';
import { fetchWorkosAuth, setConvexQueryClientAuthForSsr } from '@workspace/web-foundation';
import { type ConvexReactClient } from 'convex/react';
import { type PropsWithChildren, type ReactNode } from 'react';

import { AppSidebar } from '#/components/navigation/app-sidebar';
import { SiteHeader } from '#/components/site-header';

import appCssUrl from '#/styles.css?url';

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
    const { token } = await fetchWorkosAuth();
    setConvexQueryClientAuthForSsr(context.convexQueryClient, token);
    return { token };
  },
  loader: async () => {
    const [{ user }, signInUrl, signUpUrl] = await Promise.all([
      getAuth(),
      getSignInUrl(),
      getSignUpUrl(),
    ]);
    if (!user) throw redirect({ to: '/api/auth/sign-in' });
    return { signInUrl, signUpUrl };
  },
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
  const { signInUrl, signUpUrl } = Route.useLoaderData();

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
        <SiteHeader signInUrl={signInUrl} signUpUrl={signUpUrl} />
        <div className='flex flex-1 flex-col'>
          <div className='@container/main flex flex-1 flex-col gap-2'>{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

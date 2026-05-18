import appCssUrl from '#/styles.css?url';
import type { ConvexQueryClient } from '@convex-dev/react-query';
import { type QueryClient } from '@tanstack/react-query';
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from '@tanstack/react-router';
import { fetchWorkosAuth, setConvexQueryClientAuthForSsr } from '@workspace/web-foundation';
import { getAuth } from '@workos/authkit-tanstack-react-start';
import { type ConvexReactClient } from 'convex/react';
import { type ReactNode } from 'react';

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
    links: [{ rel: 'stylesheet', href: appCssUrl }],
  }),
  beforeLoad: async ({ context }) => {
    const { userId, token } = await fetchWorkosAuth();
    setConvexQueryClientAuthForSsr(context.convexQueryClient, token);
    return { userId, token };
  },
  loader: async () => {
    const { user } = await getAuth();
    if (!user) throw redirect({ to: '/api/auth/sign-in' });
    return {};
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <main className="min-h-dvh bg-background text-foreground">
        <Outlet />
      </main>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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

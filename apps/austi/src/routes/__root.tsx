import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { ChatDraftsProvider } from '#/providers/chat-drafts-provider';
import { ThemeProvider } from '#/providers/theme-provider';
import { AppShell } from '#/shell/app-shell';

import themeUrl from '#/theme-overrides.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#0a0a0a' },
      {
        name: 'description',
        content: 'Your workspace for building tools and simplifying everyday work with Austi.',
      },
      { title: 'Austi' },
    ],
    links: [
      { rel: 'icon', href: '/austi-logo.svg', type: 'image/svg+xml' },
      {
        rel: 'preload',
        href: '/fonts/ClarityCity-Regular.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: themeUrl },
    ],
  }),
  shellComponent: RootDocument,
  component: RootRoute,
  notFoundComponent: NotFound,
});

export function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

export function RootRoute() {
  return (
    <ChatDraftsProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ChatDraftsProvider>
  );
}

export function NotFound() {
  return (
    <div className='m-auto space-y-4 p-8 text-center'>
      <h1 className='text-2xl font-bold'>Page not found</h1>
      <Link to='/' className='underline underline-offset-4'>
        Back to your workspace
      </Link>
    </div>
  );
}

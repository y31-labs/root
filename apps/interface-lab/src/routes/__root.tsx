import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { type ReactNode } from 'react';

import { APP_NAME } from '#/lib/app-config';

import appCssUrl from '#/styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: APP_NAME },
    ],
    links: [
      { rel: 'icon', href: '/code-favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/code-logo.ico', sizes: 'any' },
      { rel: 'stylesheet', href: appCssUrl },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
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

import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { type ReactNode } from 'react';

import appCssUrl from '#/styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Interface Lab' },
    ],
    links: [{ rel: 'stylesheet', href: appCssUrl }],
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

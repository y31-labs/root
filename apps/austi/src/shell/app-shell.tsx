import { SidebarInset, SidebarProvider } from '@workspace/ui/components/ui/sidebar';
import type { CSSProperties, ReactNode } from 'react';

import { AppSidebar } from '#/components/navigation/app-sidebar';
import { SiteHeader, type AuthKitProps } from '#/components/site-header';

export function AppShell({
  children,
  signInUrl,
  signUpUrl,
}: AuthKitProps & { children: ReactNode }) {
  return (
    <SidebarProvider
      defaultOpen
      className='h-svh min-h-0 overflow-hidden'
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as CSSProperties
      }
    >
      <AppSidebar variant='inset' />
      <SidebarInset className='min-h-0 min-w-0 overflow-hidden'>
        <SiteHeader signInUrl={signInUrl} signUpUrl={signUpUrl} />
        <div
          id='main-content'
          tabIndex={-1}
          className='@container/main flex min-h-0 min-w-0 flex-1 flex-col outline-none'
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

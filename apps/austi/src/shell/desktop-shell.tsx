import { SidebarInset, SidebarProvider } from '@workspace/ui/components/ui/sidebar';
import type { ReactNode } from 'react';

import { AppSidebar } from '#/components/navigation/app-sidebar';

export function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset className='h-svh min-w-0 overflow-hidden pt-10'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

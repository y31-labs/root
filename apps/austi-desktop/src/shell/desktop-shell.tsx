import { Button } from '@workspace/ui/components/ui/button';
import { SidebarInset, SidebarProvider, useSidebar } from '@workspace/ui/components/ui/sidebar';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';

import { AppSidebar } from '#/components/navigation/app-sidebar';

export function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <SidebarToggle />
      <AppSidebar />
      <SidebarInset className='h-svh min-w-0 overflow-hidden pt-(--window-titlebar-height)'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidebarToggle() {
  const { open, setOpen } = useSidebar();

  return (
    <div className='fixed top-0 left-(--window-sidebar-toggle-inline-start) z-70 flex h-(--window-titlebar-height) items-center'>
      <Button
        size='icon-sm'
        variant='ghost'
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        onClick={() => setOpen(!open)}
      >
        {open ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
    </div>
  );
}

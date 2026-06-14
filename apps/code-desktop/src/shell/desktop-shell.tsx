import { listen } from '@tauri-apps/api/event';
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/ui/sidebar';
import { useEffect, type ReactNode } from 'react';

import { AppSidebar } from '#/components/navigation/app-sidebar';
import { localApi } from '#/lib/local-api';

export function DesktopShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    const unlisten = listen('quit-confirmation-required', () => {
      if (window.confirm('A change session is active. Quit immediately?')) {
        void localApi.quit(true);
      }
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset className='h-svh min-w-0 overflow-x-hidden pt-10'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <div className='@container/main flex min-h-0 min-w-0 flex-1 flex-col gap-2'>
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

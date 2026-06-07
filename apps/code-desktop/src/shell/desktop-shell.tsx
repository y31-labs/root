import { listen } from '@tauri-apps/api/event';
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/ui/sidebar';
import { useEffect, type ReactNode } from 'react';

import { AppSidebar } from '#/components/navigation/app-sidebar';
import { useRunSync } from '#/hooks/use-run-sync';
import { localApi } from '#/lib/local-api';

export function DesktopShell({ children }: { children: ReactNode }) {
  useRunSync();
  useEffect(() => {
    const unlisten = listen('quit-confirmation-required', () => {
      if (window.confirm('A local run is active. Quit immediately?')) {
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
      <SidebarInset className='min-w-0 overflow-x-hidden'>
        <div className='flex min-h-svh min-w-0 flex-1 flex-col'>
          <div className='@container/main flex min-h-svh min-w-0 flex-1 flex-col gap-2'>
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

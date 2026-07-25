import { Outlet, createRootRoute } from '@tanstack/react-router';

import { ChatHistoryProvider } from '#/providers/chat-history-provider';
import { DesktopShell } from '#/shell/desktop-shell';

export const Route = createRootRoute({ component: RootComponent });

function RootComponent() {
  return (
    <ChatHistoryProvider>
      <DesktopShell>
        <Outlet />
      </DesktopShell>
    </ChatHistoryProvider>
  );
}

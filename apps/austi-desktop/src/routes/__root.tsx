import { Outlet, createRootRoute } from '@tanstack/react-router';

import { ChatHistoryProvider } from '#/providers/chat-history-provider';
import { GeneratedAppsProvider } from '#/providers/generated-apps-provider';
import { DesktopShell } from '#/shell/desktop-shell';

export const Route = createRootRoute({ component: RootComponent });

function RootComponent() {
  return (
    <ChatHistoryProvider>
      <GeneratedAppsProvider>
        <DesktopShell>
          <Outlet />
        </DesktopShell>
      </GeneratedAppsProvider>
    </ChatHistoryProvider>
  );
}

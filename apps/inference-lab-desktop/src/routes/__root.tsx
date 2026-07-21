import { Outlet, createRootRoute } from '@tanstack/react-router';

import { DesktopShell } from '#/shell/desktop-shell';

export const Route = createRootRoute({ component: RootComponent });

function RootComponent() {
  return (
    <DesktopShell>
      <Outlet />
    </DesktopShell>
  );
}

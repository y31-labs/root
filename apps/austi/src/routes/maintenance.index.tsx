import { createFileRoute } from '@tanstack/react-router';

import { MaintenanceInbox } from '#/features/maintenance/inbox';

export const Route = createFileRoute('/maintenance/')({
  head: () => ({ meta: [{ title: 'Maintenance · Austi' }] }),
  component: MaintenanceInbox,
});

import { createFileRoute } from '@tanstack/react-router';

import { Dashboard } from '#/features/dashboard';

export const Route = createFileRoute('/')({
  staticData: { breadcrumb: 'Dashboard' },
  head: () => ({ meta: [{ title: 'Dashboard · Austi' }] }),
  component: Dashboard,
});

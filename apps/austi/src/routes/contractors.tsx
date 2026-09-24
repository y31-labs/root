import { createFileRoute } from '@tanstack/react-router';

import { ContractorsPage } from '#/features/maintenance/contractors';

export const Route = createFileRoute('/contractors')({
  staticData: { breadcrumb: 'Contractors' },
  head: () => ({ meta: [{ title: 'Contractors · Austi' }] }),
  component: ContractorsPage,
});

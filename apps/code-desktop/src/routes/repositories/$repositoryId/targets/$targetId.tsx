import { createFileRoute } from '@tanstack/react-router';

import { TargetPage } from '#/views/target-page';

export const Route = createFileRoute('/repositories/$repositoryId/targets/$targetId')({
  validateSearch: (search): { tab?: string } => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
  component: TargetPage,
});

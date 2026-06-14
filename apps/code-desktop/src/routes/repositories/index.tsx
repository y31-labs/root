import { createFileRoute } from '@tanstack/react-router';

import { RepositoriesPage } from '#/views/repositories-page';

export const Route = createFileRoute('/repositories/')({
  component: RepositoriesPage,
});

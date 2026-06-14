import { createFileRoute } from '@tanstack/react-router';

import { RepositoryPage } from '#/views/repository-page';

export const Route = createFileRoute('/repositories/$repositoryId')({
  component: RepositoryPage,
});

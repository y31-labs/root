import { createFileRoute } from '@tanstack/react-router';

import { RunPage } from '#/views/run-page';

export const Route = createFileRoute('/runs/$runId')({
  component: RunPage,
});

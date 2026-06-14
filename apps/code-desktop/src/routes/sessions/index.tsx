import { createFileRoute } from '@tanstack/react-router';

import { SessionsPage } from '#/views/sessions-page';

export const Route = createFileRoute('/sessions/')({
  component: SessionsPage,
});

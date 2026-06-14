import { createFileRoute } from '@tanstack/react-router';

import { ChangeSessionPage } from '#/views/change-session-page';

export const Route = createFileRoute('/sessions/$sessionId')({
  component: ChangeSessionPage,
});

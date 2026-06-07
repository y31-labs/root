import { createFileRoute } from '@tanstack/react-router';

import { SetupPage } from '#/views/setup-page';

export const Route = createFileRoute('/')({
  component: SetupPage,
});

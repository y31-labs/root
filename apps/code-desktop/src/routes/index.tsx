import { createFileRoute } from '@tanstack/react-router';

import { HomePage } from '#/views/home-page';

export const Route = createFileRoute('/')({
  component: HomePage,
});

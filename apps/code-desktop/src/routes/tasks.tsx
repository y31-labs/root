import { createFileRoute } from '@tanstack/react-router';

import { TasksPage } from '#/views/tasks-page';

export const Route = createFileRoute('/tasks')({
  component: TasksPage,
});

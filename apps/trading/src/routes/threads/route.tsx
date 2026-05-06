import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/threads')({
  beforeLoad: () => ({ title: 'Threads' }),
  component: ThreadsLayoutComponent,
});

function ThreadsLayoutComponent() {
  return <Outlet />;
}

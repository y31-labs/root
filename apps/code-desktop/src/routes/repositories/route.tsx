import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/repositories')({
  component: RepositoryLayout,
});

function RepositoryLayout() {
  return <Outlet />;
}

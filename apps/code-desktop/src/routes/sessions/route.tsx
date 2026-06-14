import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/sessions')({
  component: SessionLayout,
});

function SessionLayout() {
  return <Outlet />;
}

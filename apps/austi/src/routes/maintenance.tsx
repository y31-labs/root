import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/maintenance')({
  staticData: { breadcrumb: 'Maintenance' },
  component: Outlet,
});

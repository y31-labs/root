import { createFileRoute, notFound } from '@tanstack/react-router';
import { ErrorView } from '@workspace/ui/components/app/error-view';

import { CaseDetail } from '#/features/maintenance/case-detail';
import { cases } from '#/features/maintenance/data';
import { Route as MaintenanceIndexRoute } from '#/routes/maintenance.index';

export const Route = createFileRoute('/maintenance/$caseId')({
  staticData: { breadcrumb: ({ loaderData, params }) => loaderData?.item?.title ?? params.caseId },
  loader: ({ params }) => {
    const item = cases.find((item) => item.id === params.caseId);
    if (!item) throw notFound();
    return { item };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.item?.title ?? 'Case not found'} · Austi`,
      },
    ],
  }),
  component: MaintenanceCasePage,
  notFoundComponent: () => <ErrorView title='Case not found' backPath={MaintenanceIndexRoute.to} />,
});

function MaintenanceCasePage() {
  const { item } = Route.useLoaderData();
  return <CaseDetail item={item} />;
}

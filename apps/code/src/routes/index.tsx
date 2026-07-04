import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { LoadingView } from '@workspace/ui/components/app/loading-view';
import { useBoolean } from '@workspace/ui/hooks/use-boolean';
import { useMutation } from 'convex/react';
import { useCallback } from 'react';

import { FlowMemoryCanvas } from '#/components/flow-memory/flow-memory-canvas';
import { RepoSelectorDropdown } from '#/components/repos/repo-selector-dropdown';
import { ReposDialog } from '#/components/repos/repos-dialog';
import { flowMemoryQueries, repoQueries } from '#/queries';
import { api } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';

export const Route = createFileRoute('/')({
  component: HomePage,
  loader: async ({ context: { queryClient } }) =>
    await Promise.all([
      queryClient.ensureQueryData(repoQueries.list),
      queryClient.ensureQueryData(flowMemoryQueries.graph),
    ]),
  pendingComponent: LoadingView,
});

function HomePage() {
  const selectRepo = useMutation(api.repos.select);
  const { value: open, setValue: setOpen, setTrue } = useBoolean(false);

  const onSelectRepo = useCallback(
    (id: Id<'repos'>, selected: boolean) => selectRepo({ id, selected }).then((r) => r.updated),
    [selectRepo],
  );

  return (
    <>
      <div className='flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6'>
        <PageHeader
          title='Code'
          actions={<RepoSelectorDropdown onSelectRepo={onSelectRepo} onManageRepos={setTrue} />}
        />
        <FlowMemoryCanvas />
      </div>
      <ReposDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

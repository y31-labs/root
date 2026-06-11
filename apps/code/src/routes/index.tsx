import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { LoadingView } from '@workspace/ui/components/app/loading-view';
import { useBoolean } from '@workspace/ui/hooks/use-boolean';
import { useMutation } from 'convex/react';
import { useCallback } from 'react';

import { RepoSelectorDropdown } from '#/components/repos/repo-selector-dropdown';
import { ReposDialog } from '#/components/repos/repos-dialog';
import { repoQueries } from '#/queries';
import { api } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';

export const Route = createFileRoute('/')({
  component: HomePage,
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(repoQueries.list),
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
      <div className='flex flex-1 flex-col gap-6 p-4 md:p-6'>
        <PageHeader
          title='Code'
          actions={<RepoSelectorDropdown onSelectRepo={onSelectRepo} onManageRepos={setTrue} />}
        />
      </div>
      <ReposDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

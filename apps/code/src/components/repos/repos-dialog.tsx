import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { LoadingView } from '@workspace/ui/components/app/loading-view';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/ui/alert-dialog';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandList,
} from '@workspace/ui/components/ui/command';
import { Spinner } from '@workspace/ui/components/ui/spinner';
import { useMutation } from 'convex/react';
import { Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Suspense, useEffect, useState, useTransition } from 'react';

import { SearchGroup } from '#/components/repos/search-group';
import { repoQueries } from '#/queries';
import { api } from '#convex/_generated/api';
import type { Doc } from '#convex/_generated/dataModel';
import type { RepoSearchResult } from '#convex/githubActions';

interface ReposDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReposDialog({ open, onOpenChange }: ReposDialogProps) {
  const { data: repos } = useSuspenseQuery(repoQueries.list);
  const queryClient = useQueryClient();
  const createRepo = useMutation(api.repos.create);
  const removeRepo = useMutation(api.repos.remove);

  const [query, setQuery] = useState('');
  const [confirmRepo, setConfirmRepo] = useState<Doc<'repos'>>();
  const [isRemoving, startRemovingTransition] = useTransition();
  const [isSyncing, startSyncingTransition] = useTransition();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const onSelect = (repo: RepoSearchResult) =>
    startSyncingTransition(async () => {
      await createRepo({
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        selected: repos.length === 0,
        publicId: repo.publicId,
        private: repo.private,
        installationId: repo.installationId,
      });
      await queryClient.invalidateQueries({ queryKey: ['githubActions.searchRepos'] });
    });

  const onRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!confirmRepo) return;

    const repoId = confirmRepo._id;

    startRemovingTransition(async () => {
      const { removed } = await removeRepo({ id: repoId });
      if (removed) {
        await Promise.all([
          queryClient.invalidateQueries(repoQueries.list),
          queryClient.invalidateQueries({ queryKey: ['githubActions.searchRepos'] }),
        ]);
      }
      startRemovingTransition(() => setConfirmRepo(undefined));
    });
  };

  const isDisabled = isSyncing || isRemoving;

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title='Repositories'
        description='Add or remove tracked GitHub repositories'
        showCloseButton
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder='Search repositories...'
            value={query}
            onValueChange={setQuery}
            disabled={isDisabled}
          />
          <CommandList>
            <Suspense fallback={<LoadingView />}>
              {repos.length > 0 && (
                <>
                  <CommandGroup heading='Synced'>
                    {repos.map((repo) => (
                      <div
                        key={repo._id}
                        className='group flex items-center justify-between gap-2 rounded-sm px-2 py-1.5'
                      >
                        <span className='min-w-0 truncate text-sm'>
                          {repo.owner}/{repo.name}
                        </span>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-sm'
                          aria-label={`Remove ${repo.owner}/${repo.name}`}
                          disabled={isDisabled}
                          onClick={() => setConfirmRepo(repo)}
                          className='opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                        >
                          <Trash2 className='text-destructive' />
                        </Button>
                      </div>
                    ))}
                  </CommandGroup>
                </>
              )}
              {open ? (
                <SearchGroup
                  query={query}
                  enabled={open}
                  disabled={isDisabled}
                  onSelect={onSelect}
                />
              ) : null}
            </Suspense>
          </CommandList>
        </Command>
      </CommandDialog>

      <AlertDialog open={!!confirmRepo} onOpenChange={(next) => next || setConfirmRepo(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmRepo?.owner}/{confirmRepo?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This repository will be removed from your list. You can add it again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant='destructive' disabled={isRemoving} onClick={onRemove}>
              {isRemoving ? <Spinner data-icon='inline-start' /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

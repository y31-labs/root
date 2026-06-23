import { useNavigate } from '@tanstack/react-router';
import { open } from '@tauri-apps/plugin-dialog';
import type { Repository, RepositoryTarget } from '@workspace/code-agent-contracts/sessions';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { FolderGit2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { RepositoryTargetPicker } from '#/components/repository-target-picker';
import {
  getActiveRepositoryId,
  getActiveTargetId,
  setActiveRepositoryId,
  setActiveTargetId,
} from '#/lib/active-target';
import { useLocalApi } from '#/providers/local-api-provider';

export function RepositoriesPage() {
  const api = useLocalApi();
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [targetsByRepository, setTargetsByRepository] = useState<Record<string, RepositoryTarget[]>>(
    {},
  );
  const [activeRepositoryId, setActiveRepositoryState] = useState<string>();
  const [activeTargetId, setActiveTargetState] = useState<string>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const nextRepositories = await api.listRepositories();
      const targetPairs = await Promise.all(
        nextRepositories.map(async (repository) => [
          repository.id,
          await api.listRepositoryTargets(repository.id),
        ] as const),
      );
      const nextTargets = Object.fromEntries(targetPairs);
      const storedRepositoryId = getActiveRepositoryId();
      const nextActiveRepository =
        nextRepositories.find((repository) => repository.id === storedRepositoryId) ??
        nextRepositories[0];
      setRepositories(nextRepositories);
      setTargetsByRepository(nextTargets);
      setActiveRepositoryState(nextActiveRepository?.id);
      setActiveTargetState(
        nextActiveRepository ? getActiveTargetId(nextActiveRepository.id) : undefined,
      );
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRepository = async () => {
    if (pending) return;
    const selected = window.__CODE_TEST_SELECT_DIRECTORY__
      ? await window.__CODE_TEST_SELECT_DIRECTORY__()
      : await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    setPending(true);
    try {
      const repository = await api.registerRepository(selected);
      await refresh();
      setActiveRepositoryId(repository.id);
      await navigate({
        to: '/repositories/$repositoryId',
        params: { repositoryId: repository.id },
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const selectTarget = (repositoryId: string, targetId?: string) => {
    setActiveRepositoryId(repositoryId);
    setActiveTargetId(repositoryId, targetId);
    setActiveRepositoryState(repositoryId);
    setActiveTargetState(targetId);
    void navigate({ to: '/repositories/$repositoryId', params: { repositoryId } });
  };

  const activeRepository = repositories.find((repository) => repository.id === activeRepositoryId);
  const activeTarget = activeRepositoryId
    ? targetsByRepository[activeRepositoryId]?.find((target) => target.id === activeTargetId)
    : undefined;

  return (
    <div className='min-w-0 space-y-6 p-6'>
      <PageHeader
        title='Code'
        description='Choose a local repository target, then start a verified change session.'
        actions={
          <RepositoryTargetPicker
            repositories={repositories}
            targetsByRepository={targetsByRepository}
            activeRepositoryId={activeRepositoryId}
            activeTargetId={activeTargetId}
            onSelect={selectTarget}
            onOpenRepository={addRepository}
            onManageTargets={() =>
              activeRepositoryId
                ? void navigate({
                    to: '/repositories/$repositoryId',
                    params: { repositoryId: activeRepositoryId },
                  })
                : undefined
            }
          />
        }
      />

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      {activeRepository ? (
        <section className='space-y-4'>
          <div>
            <h2 className='font-medium'>
              {activeTarget
                ? `${activeRepository.name} / ${activeTarget.name}`
                : activeRepository.name}
            </h2>
            <p className='text-muted-foreground text-sm'>
              {activeTarget
                ? `Work in ${activeTarget.path}.`
                : 'Open this repository to scan and choose app targets.'}
            </p>
          </div>
          <Button
            onClick={() =>
              navigate({
                to: '/repositories/$repositoryId',
                params: { repositoryId: activeRepository.id },
              })
            }
          >
            <FolderGit2 data-icon='inline-start' />
            Open workspace
          </Button>
        </section>
      ) : null}

      {repositories.length > 0 ? (
        <section className='space-y-4'>
          <div>
            <h2 className='font-medium'>Manage repositories</h2>
            <p className='text-muted-foreground text-sm'>
              Add local Git repositories and refresh their policy state.
            </p>
          </div>
          <div className='min-w-0 divide-y border-y'>
          {repositories.map((repository) => (
            <section key={repository.id} className='min-w-0 space-y-4 py-5'>
              <div className='flex min-w-0 items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <h2 className='truncate font-medium'>{repository.name}</h2>
                  <p className='text-muted-foreground truncate text-sm'>{repository.path}</p>
                </div>
                <Badge
                  variant={
                    repository.compatible && repository.policy?.valid ? 'default' : 'secondary'
                  }
                >
                  {!repository.compatible
                    ? 'Unsupported'
                    : repository.policy?.valid
                      ? 'Policy ready'
                      : 'Policy required'}
                </Badge>
              </div>
              <p className='text-muted-foreground text-sm'>
                {targetsByRepository[repository.id]?.filter((target) => target.selected).length ||
                  0}{' '}
                selected targets · {repository.branch || 'Detached'} ·{' '}
                {repository.dirty ? 'Working tree has local edits' : 'Working tree clean'}
              </p>
              {repository.dirty ? (
                <p className='text-warning text-sm'>
                  Uncommitted changes stay in this working tree and are excluded from sessions.
                </p>
              ) : null}
              {repository.compatibilityDetail ? (
                <p className='text-warning text-sm'>{repository.compatibilityDetail}</p>
              ) : null}
              <div className='flex gap-2'>
                <Button
                  onClick={() =>
                    navigate({
                      to: '/repositories/$repositoryId',
                      params: { repositoryId: repository.id },
                    })
                  }
                >
                  <FolderGit2 data-icon='inline-start' />
                  Manage targets
                </Button>
                <Button
                  variant='outline'
                  aria-label={`Refresh ${repository.name}`}
                  onClick={async () => {
                    await api.refreshRepository(repository.id);
                    await refresh();
                  }}
                >
                  <RefreshCw />
                </Button>
              </div>
            </section>
          ))}
          </div>
        </section>
      ) : (
        <section className='border-y py-12 text-center'>
          <FolderGit2 className='text-muted-foreground mx-auto mb-3 size-8' />
          <h2 className='font-medium'>Open a local repository to begin</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Code reads committed Git state and creates sessions in separate worktrees.
          </p>
        </section>
      )}
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

import { useNavigate } from '@tanstack/react-router';
import { open } from '@tauri-apps/plugin-dialog';
import type { Repository } from '@workspace/code-agent-contracts/sessions';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { FolderGit2, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useLocalApi } from '#/providers/local-api-provider';

export function RepositoriesPage() {
  const api = useLocalApi();
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRepositories(await api.listRepositories());
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRepository = async () => {
    const selected = window.__CODE_TEST_SELECT_DIRECTORY__
      ? await window.__CODE_TEST_SELECT_DIRECTORY__()
      : await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    setPending(true);
    try {
      const repository = await api.registerRepository(selected);
      await refresh();
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

  return (
    <div className='min-w-0 space-y-6 p-6'>
      <PageHeader
        title='Repositories'
        description='Local Git repositories available for isolated change sessions.'
        actions={
          <Button disabled={pending} onClick={addRepository}>
            <Plus data-icon='inline-start' />
            Open repository
          </Button>
        }
      />

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      {repositories.length > 0 ? (
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
              <div className='grid grid-cols-2 gap-3 text-sm'>
                <Metadata label='HEAD' value={repository.headSha.slice(0, 12)} />
                <Metadata label='Branch' value={repository.branch || 'Detached'} />
                <Metadata label='Working tree' value={repository.dirty ? 'Dirty' : 'Clean'} />
                <Metadata
                  label='Policy'
                  value={repository.policy?.valid ? 'Approved' : 'Review required'}
                />
              </div>
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
                  Open
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

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='truncate font-mono text-xs'>{value}</p>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

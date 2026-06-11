import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { EngineHealthCard } from '@workspace/code-workbench/engine-health-card';
import { ManifestEditor } from '@workspace/code-workbench/manifest-editor';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { RepositoryPolicyCard } from '@workspace/code-workbench/repository-policy-card';
import { Button } from '@workspace/ui/components/ui/button';
import { useAction, useMutation } from 'convex/react';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

import { localApi } from '#/lib/local-api';
import { desktopQueries } from '#/lib/queries';
import { api } from '#convex/_generated/api';

export function SettingsPage() {
  const [health, setHealth] = useState({
    available: false,
    authenticated: false,
    dockerAvailable: false,
  });
  const [proposal, setProposal] = useState<{
    baseCommitSha: string;
    manifest: unknown;
  }>();
  const [manifestText, setManifestText] = useState('');
  const [isPending, startTransition] = useTransition();
  const reposQuery = useQuery(desktopQueries.repos);
  const approveManifest = useMutation(api.repos.approveManifest);
  const selectRepo = useMutation(api.repos.select);
  const proposeManifest = useAction(api.githubActions.proposeVerificationManifest);
  const selectedRepo = reposQuery.data?.find((repo) => repo.selected);

  const refresh = () => void localApi.engineHealth().then(setHealth);

  useEffect(refresh, []);

  const onPropose = () => {
    if (!selectedRepo) return;
    startTransition(async () => {
      const next = await proposeManifest({ repoId: selectedRepo._id });
      setProposal(next);
      setManifestText(JSON.stringify(next.manifest, null, 2));
    });
  };

  const onApprove = () => {
    if (!selectedRepo || !proposal) return;
    startTransition(async () => {
      await approveManifest({
        id: selectedRepo._id,
        baseCommitSha: proposal.baseCommitSha,
        manifest: JSON.parse(manifestText) as unknown,
      });
      setProposal(undefined);
    });
  };

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-8 p-4 md:p-6'>
      <PageHeader title='Settings' />

      <EngineHealthCard
        health={health}
        actions={
          !health.authenticated ? (
            <Button
              variant='outline'
              disabled={isPending}
              onClick={() => localApi.startCodexLogin()}
            >
              <ExternalLink data-icon='inline-start' />
              Open Codex login
            </Button>
          ) : undefined
        }
      />

      <section className='min-w-0 space-y-4'>
        <div>
          <h2 className='font-medium'>GitHub repositories</h2>
          <p className='text-muted-foreground text-sm'>
            Repository connections are shared with the web setup app.
          </p>
        </div>

        <div className='divide-y border-y'>
          {reposQuery.data?.length ? (
            reposQuery.data.map((repo) => (
              <div
                key={repo._id}
                className='flex min-w-0 items-center justify-between gap-3 py-3 text-sm'
              >
                <span className='min-w-0 truncate font-medium'>
                  {repo.owner}/{repo.name}
                </span>
                <Button
                  size='sm'
                  variant={repo.selected ? 'secondary' : 'outline'}
                  disabled={isPending || repo.selected}
                  onClick={() =>
                    startTransition(async () => {
                      await selectRepo({ id: repo._id, selected: true });
                    })
                  }
                >
                  {repo.selected ? 'Selected' : 'Select'}
                </Button>
              </div>
            ))
          ) : (
            <p className='text-muted-foreground py-3 text-sm'>No connected repositories.</p>
          )}
          <div className='flex items-center justify-between gap-3 py-3'>
            <div>
              <p className='text-sm font-medium'>GitHub connections</p>
              <p className='text-muted-foreground text-sm'>
                Add or remove repositories in the web app.
              </p>
            </div>
            <Button
              variant='outline'
              onClick={() =>
                openUrl(
                  `${import.meta.env.VITE_CODE_WEB_URL ?? 'http://localhost:3000'}/api/github/install`,
                )
              }
            >
              Manage
              <ExternalLink data-icon='inline-end' />
            </Button>
          </div>
        </div>
      </section>

      {selectedRepo ? (
        <RepositoryPolicyCard
          fullName={`${selectedRepo.owner}/${selectedRepo.name}`}
          approved={Boolean(selectedRepo.manifest)}
          disabled={isPending}
          onPropose={onPropose}
        >
          {proposal ? (
            <ManifestEditor
              baseCommitSha={proposal.baseCommitSha}
              value={manifestText}
              disabled={isPending}
              onChange={setManifestText}
              onApprove={onApprove}
              onCancel={() => setProposal(undefined)}
            />
          ) : undefined}
        </RepositoryPolicyCard>
      ) : null}
    </div>
  );
}

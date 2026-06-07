import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { EngineHealthCard } from '@workspace/code-workbench/engine-health-card';
import { ManifestEditor } from '@workspace/code-workbench/manifest-editor';
import { RepositoryPolicyCard } from '@workspace/code-workbench/repository-policy-card';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/ui/card';
import { useAction, useMutation } from 'convex/react';
import { ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

import { localApi } from '#/lib/local-api';
import { desktopQueries } from '#/lib/queries';
import { api } from '#convex/_generated/api';

export function SetupPage() {
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
    <div className='grid min-w-0 gap-6 p-6 xl:grid-cols-2'>
      <Card className='min-w-0'>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>WorkOS identity is shared with the web setup app.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-muted-foreground text-sm'>
            Desktop is authenticated. Refresh credentials are stored in macOS Keychain.
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              disabled={isPending}
              onClick={() => startTransition(() => localApi.logout())}
            >
              <LogOut data-icon='inline-start' />
              Sign out
            </Button>
            <Button variant='ghost' onClick={refresh}>
              <RefreshCw data-icon='inline-start' />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

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

      <Card className='min-w-0'>
        <CardHeader>
          <CardTitle>GitHub repositories</CardTitle>
          <CardDescription>
            Repository connections are shared with the web setup app.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {reposQuery.data?.length ? (
            reposQuery.data.map((repo) => (
              <div
                key={repo._id}
                className='flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3 text-sm'
              >
                <span className='min-w-0 truncate'>
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
            <p className='text-muted-foreground text-sm'>No connected repositories.</p>
          )}
          <Button
            variant='outline'
            onClick={() =>
              openUrl(
                `${import.meta.env.VITE_CODE_WEB_URL ?? 'http://localhost:3000'}/api/github/install`,
              )
            }
          >
            <ExternalLink data-icon='inline-start' />
            Manage in browser
          </Button>
        </CardContent>
      </Card>

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

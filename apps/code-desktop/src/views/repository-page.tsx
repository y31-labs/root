import { useNavigate, useParams } from '@tanstack/react-router';
import type {
  AppServerConfig,
  VerificationManifest,
} from '@workspace/code-agent-contracts/manifest';
import type { ChangeSession, Repository } from '@workspace/code-agent-contracts/sessions';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { Input } from '@workspace/ui/components/ui/input';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { CheckCircle2, Play, RefreshCw, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ChangeSessionStatusBadge } from '#/components/change-session-status';
import type { PolicyProposal } from '#/lib/local-api';
import { useLocalApi } from '#/providers/local-api-provider';

type SessionSummary = ChangeSession & { repositoryName: string };

export function RepositoryPage() {
  const { repositoryId } = useParams({ from: '/repositories/$repositoryId' });
  const api = useLocalApi();
  const navigate = useNavigate();
  const [repository, setRepository] = useState<Repository>();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [proposal, setProposal] = useState<PolicyProposal>();
  const [manifestText, setManifestText] = useState('');
  const [request, setRequest] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [repositories, nextSessions] = await Promise.all([
        api.listRepositories(),
        api.listChangeSessions(repositoryId),
      ]);
      setRepository(repositories.find((item) => item.id === repositoryId));
      setSessions(nextSessions);
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api, repositoryId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!repository) {
    return <div className='p-6'>{error || 'Loading repository...'}</div>;
  }

  const propose = async () => {
    setPending(true);
    try {
      const next = await api.proposeRepositoryPolicy(repository.id);
      setProposal(next);
      setManifestText(JSON.stringify(next.manifest, null, 2));
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const approve = async () => {
    setPending(true);
    try {
      await api.approveRepositoryPolicy(
        repository.id,
        JSON.parse(manifestText) as VerificationManifest,
      );
      setProposal(undefined);
      await refresh();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const updateManifest = (update: (manifest: VerificationManifest) => void) => {
    try {
      const manifest = JSON.parse(manifestText) as VerificationManifest;
      update(manifest);
      setManifestText(JSON.stringify(manifest, null, 2));
      setError('');
    } catch {
      setError('Fix the manifest JSON before editing structured policy fields.');
    }
  };

  const updateAppServer = <Key extends keyof AppServerConfig>(
    key: Key,
    value: AppServerConfig[Key],
  ) => {
    updateManifest((manifest) => {
      if (manifest.appServer) manifest.appServer[key] = value;
    });
  };

  const draftManifest = parseManifest(manifestText);

  const start = async () => {
    setPending(true);
    try {
      const sessionId = await api.startChangeSession(repository.id, request);
      setRequest('');
      await navigate({ to: '/sessions/$sessionId', params: { sessionId } });
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className='min-w-0 space-y-6 p-6'>
      <PageHeader
        title={repository.name}
        description={repository.path}
        meta={
          <Badge variant={repository.policy?.valid ? 'default' : 'secondary'}>
            {repository.policy?.valid ? 'Policy ready' : 'Policy required'}
          </Badge>
        }
        actions={
          <Button
            variant='outline'
            disabled={pending}
            onClick={async () => {
              await api.refreshRepository(repository.id);
              await refresh();
            }}
          >
            <RefreshCw data-icon='inline-start' />
            Refresh
          </Button>
        }
      />

      {repository.dirty ? (
        <p className='border-warning/40 border-y py-3 text-sm'>
          This working tree has uncommitted changes. Sessions start from{' '}
          <code>{repository.headSha.slice(0, 12)}</code>; current edits remain untouched and are
          excluded.
        </p>
      ) : null}
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      <div className='min-w-0 divide-y border-y xl:grid xl:grid-cols-2 xl:divide-x xl:divide-y-0'>
        <section className='min-w-0 space-y-4 py-5 xl:pr-6'>
          <div>
            <h2 className='font-medium'>Repository policy</h2>
            <p className='text-muted-foreground text-sm'>
              Review the exact commands Code may use as deterministic gates.
            </p>
          </div>
          {proposal ? (
            <>
              <p className='text-muted-foreground text-xs'>
                Fingerprint {proposal.fingerprint.slice(0, 16)} from{' '}
                {proposal.fingerprintPaths.length} configuration files.
              </p>
              <div className='divide-y border-y'>
                <div className='flex items-center justify-between gap-3 py-3'>
                  <div>
                    <p className='text-sm font-medium'>Application server</p>
                    <p className='text-muted-foreground text-xs'>
                      Optional localhost process for browser exploration and authoritative gates.
                    </p>
                  </div>
                  {draftManifest?.appServer ? (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        updateManifest((manifest) => {
                          delete manifest.appServer;
                        })
                      }
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        updateManifest((manifest) => {
                          manifest.appServer = defaultAppServer();
                        })
                      }
                    >
                      Configure
                    </Button>
                  )}
                </div>
                {draftManifest?.appServer ? (
                  <div className='grid gap-4 py-4 sm:grid-cols-2'>
                    <PolicyField label='Command'>
                      <Input
                        value={draftManifest.appServer.command}
                        onChange={(event) => updateAppServer('command', event.target.value)}
                      />
                    </PolicyField>
                    <PolicyField label='Arguments (JSON array)'>
                      <Input
                        key={JSON.stringify(draftManifest.appServer.args)}
                        defaultValue={JSON.stringify(draftManifest.appServer.args)}
                        onBlur={(event) => {
                          const args = parseStringArray(event.target.value);
                          if (args) updateAppServer('args', args);
                          else setError('Application server arguments must be a JSON string array.');
                        }}
                      />
                    </PolicyField>
                    <PolicyField label='Health URL'>
                      <Input
                        value={draftManifest.appServer.healthUrl}
                        onChange={(event) => updateAppServer('healthUrl', event.target.value)}
                      />
                    </PolicyField>
                    <PolicyField label='Browser URL'>
                      <Input
                        value={draftManifest.appServer.browserBaseUrl}
                        onChange={(event) => updateAppServer('browserBaseUrl', event.target.value)}
                      />
                    </PolicyField>
                    <PolicyField label='Process timeout (ms)'>
                      <Input
                        type='number'
                        value={draftManifest.appServer.timeoutMs}
                        onChange={(event) =>
                          updateAppServer('timeoutMs', Number(event.target.value))
                        }
                      />
                    </PolicyField>
                    <PolicyField label='Health timeout (ms)'>
                      <Input
                        type='number'
                        value={draftManifest.appServer.healthTimeoutMs}
                        onChange={(event) =>
                          updateAppServer('healthTimeoutMs', Number(event.target.value))
                        }
                      />
                    </PolicyField>
                    <PolicyField label='Environment (JSON object)'>
                      <Input
                        key={JSON.stringify(draftManifest.appServer.env ?? {})}
                        defaultValue={JSON.stringify(draftManifest.appServer.env ?? {})}
                        onBlur={(event) => {
                          const environment = parseEnvironment(event.target.value);
                          if (environment) updateAppServer('env', environment);
                          else setError('Application server environment must be a JSON string map.');
                        }}
                      />
                    </PolicyField>
                    <div className='text-muted-foreground self-end text-xs'>
                      Origin: {appServerOrigin(draftManifest.appServer) ?? 'invalid'}. External
                      navigation and requests are blocked.
                    </div>
                  </div>
                ) : null}
                {draftManifest ? (
                  <div className='py-3 text-xs'>
                    <p className='font-medium'>Gate network policy</p>
                    <p className='text-muted-foreground mt-1'>
                      {Object.entries(draftManifest.gates)
                        .map(([kind, gate]) => `${kind}: ${gate?.network ?? 'disabled'}`)
                        .join(' · ')}
                    </p>
                  </div>
                ) : null}
              </div>
              <div>
                <p className='mb-2 text-sm font-medium'>Advanced manifest</p>
                <p className='text-muted-foreground mb-3 text-xs'>
                  Edit gate commands and runtime details directly when needed.
                </p>
              <Textarea
                className='min-h-80 font-mono text-xs'
                value={manifestText}
                onChange={(event) => setManifestText(event.target.value)}
              />
              </div>
              <div className='flex gap-2'>
                <Button disabled={pending} onClick={approve}>
                  <CheckCircle2 data-icon='inline-start' />
                  Approve policy
                </Button>
                <Button variant='outline' onClick={() => setProposal(undefined)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className='space-y-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <p className='font-medium'>
                    {repository.policy?.valid ? 'Approved and current' : 'Review required'}
                  </p>
                  <p className='text-muted-foreground text-sm'>
                    Script and lockfile changes invalidate this approval.
                  </p>
                </div>
                <Button variant='outline' disabled={pending} onClick={propose}>
                  <Settings2 data-icon='inline-start' />
                  {repository.policy ? 'Review policy' : 'Propose policy'}
                </Button>
              </div>
              {repository.policy ? (
                <pre className='bg-muted max-h-72 overflow-auto rounded-lg p-4 text-xs'>
                  {JSON.stringify(repository.policy.manifest, null, 2)}
                </pre>
              ) : null}
            </div>
          )}
        </section>

        <section className='min-w-0 space-y-4 py-5 xl:pl-6'>
          <div>
            <h2 className='font-medium'>Start change</h2>
            <p className='text-muted-foreground text-sm'>
              Codex works in an app-managed worktree. Your active tree is never modified.
            </p>
          </div>
          <Textarea
            className='min-h-44'
            placeholder='Describe the change and the behavior that should be verified.'
            value={request}
            onChange={(event) => setRequest(event.target.value)}
          />
          <Button
            disabled={
              pending ||
              !repository.compatible ||
              !repository.policy?.valid ||
              request.trim().length === 0
            }
            onClick={start}
          >
            <Play data-icon='inline-start' />
            Start isolated session
          </Button>
        </section>
      </div>

      <section className='space-y-4'>
        <h2 className='font-medium'>Change sessions</h2>
        <div className='divide-y border-y'>
          {sessions.map((session) => (
            <button
              key={session.id}
              type='button'
              className='hover:bg-muted flex w-full items-center justify-between gap-3 py-3 text-left'
              onClick={() =>
                navigate({ to: '/sessions/$sessionId', params: { sessionId: session.id } })
              }
            >
              <span className='min-w-0'>
                <span className='block truncate font-medium'>{session.request}</span>
                <span className='text-muted-foreground text-xs'>
                  {session.baseSha.slice(0, 12)}
                </span>
              </span>
              <ChangeSessionStatusBadge status={session.status} />
            </button>
          ))}
          {sessions.length === 0 ? (
            <p className='text-muted-foreground py-6 text-sm'>No change sessions yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function PolicyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className='space-y-1.5 text-xs'>
      <span className='text-muted-foreground'>{label}</span>
      {children}
    </label>
  );
}

function parseManifest(value: string) {
  try {
    return JSON.parse(value) as VerificationManifest;
  } catch {
    return undefined;
  }
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function parseEnvironment(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return undefined;
    return Object.values(parsed).every((item) => typeof item === 'string')
      ? (parsed as Record<string, string>)
      : undefined;
  } catch {
    return undefined;
  }
}

function defaultAppServer(): AppServerConfig {
  return {
    command: 'bun',
    args: ['run', 'dev'],
    timeoutMs: 300_000,
    healthUrl: 'http://127.0.0.1:3000',
    healthTimeoutMs: 30_000,
    browserBaseUrl: 'http://127.0.0.1:3000',
  };
}

function appServerOrigin(server: AppServerConfig) {
  try {
    const health = new URL(server.healthUrl);
    const browser = new URL(server.browserBaseUrl);
    return health.origin === browser.origin ? browser.origin : undefined;
  } catch {
    return undefined;
  }
}

import { useNavigate, useParams } from '@tanstack/react-router';
import type {
  AppServerConfig,
  VerificationManifest,
} from '@workspace/code-agent-contracts/manifest';
import type {
  ChangeSession,
  Repository,
  RepositoryTarget,
} from '@workspace/code-agent-contracts/sessions';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { Checkbox } from '@workspace/ui/components/ui/checkbox';
import { Input } from '@workspace/ui/components/ui/input';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { CheckCircle2, Play, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ChangeSessionStatusBadge } from '#/components/change-session-status';
import { RepositoryTargetPicker } from '#/components/repository-target-picker';
import {
  getActiveTargetId,
  setActiveRepositoryId,
  setActiveTargetId,
} from '#/lib/active-target';
import type { PolicyProposal, SaveRepositoryTarget } from '#/lib/local-api';
import { useLocalApi } from '#/providers/local-api-provider';

type SessionSummary = ChangeSession & { repositoryName: string };

export function RepositoryPage() {
  const { repositoryId } = useParams({ from: '/repositories/$repositoryId' });
  const api = useLocalApi();
  const navigate = useNavigate();
  const [repository, setRepository] = useState<Repository>();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [targets, setTargets] = useState<RepositoryTarget[]>([]);
  const [targetDrafts, setTargetDrafts] = useState<RepositoryTarget[]>();
  const [activeTargetId, setActiveTargetState] = useState<string>();
  const [scanAttempted, setScanAttempted] = useState(false);
  const [scanDetail, setScanDetail] = useState('');
  const [manualTargetName, setManualTargetName] = useState('');
  const [manualTargetPath, setManualTargetPath] = useState('');
  const [proposal, setProposal] = useState<PolicyProposal>();
  const [manifestText, setManifestText] = useState('');
  const [request, setRequest] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextRepositories, nextSessions, nextTargets] = await Promise.all([
        api.listRepositories(),
        api.listChangeSessions(repositoryId),
        api.listRepositoryTargets(repositoryId),
      ]);
      const nextRepository = nextRepositories.find((item) => item.id === repositoryId);
      setRepositories(nextRepositories);
      setRepository(nextRepository);
      setSessions(nextSessions);
      setTargets(nextTargets);
      if (nextRepository) {
        setActiveRepositoryId(nextRepository.id);
        const storedTargetId = getActiveTargetId(nextRepository.id);
        const fallbackTarget = nextTargets.find((target) => target.selected);
        const nextTargetId = nextTargets.some((target) => target.id === storedTargetId)
          ? storedTargetId
          : fallbackTarget?.id;
        setActiveTargetState(nextTargetId);
        setActiveTargetId(nextRepository.id, nextTargetId);
      }
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api, repositoryId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setScanAttempted(false);
    setTargetDrafts(undefined);
    setScanDetail('');
  }, [repositoryId]);

  const scanTargets = useCallback(async (force = false) => {
    if (!repository || (!force && scanAttempted)) return;
    setScanAttempted(true);
    setPending(true);
    try {
      const scan = await api.scanRepositoryTargets(repository.id);
      setTargetDrafts(scan.targets);
      setScanDetail(scan.assistanceDetail ?? '');
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  }, [api, repository, scanAttempted]);

  useEffect(() => {
    if (repository?.compatible && targets.length === 0 && !targetDrafts && !scanAttempted) {
      void scanTargets();
    }
  }, [repository, scanAttempted, scanTargets, targetDrafts, targets.length]);

  if (!repository) {
    return <div className='p-6'>{error || 'Loading repository...'}</div>;
  }

  const visibleTargets = targetDrafts ?? targets;
  const selectedTarget = targets.find((target) => target.id === activeTargetId);
  const targetLabel = selectedTarget ? `${repository.name} / ${selectedTarget.name}` : repository.name;
  const targetsByRepository = { [repository.id]: targets };

  const updateTargetDraft = (targetId: string, selected: boolean) => {
    setTargetDrafts((current) =>
      (current ?? targets).map((target) =>
        target.id === targetId ? { ...target, selected } : target,
      ),
    );
  };

  const addManualTarget = () => {
    const name = manualTargetName.trim();
    const path = manualTargetPath.trim();
    if (!name || !path) {
      setError('Add a target name and repository-relative path.');
      return;
    }
    setTargetDrafts([
      ...(targetDrafts ?? targets),
      {
        id: `manual-${Date.now()}`,
        repositoryId: repository.id,
        name,
        path,
        kind: 'manual',
        scripts: {},
        source: 'manual',
        selected: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    setManualTargetName('');
    setManualTargetPath('');
  };

  const saveTargets = async () => {
    const drafts = targetDrafts;
    if (!drafts) return;
    setPending(true);
    try {
      const saved = await api.saveRepositoryTargets(
        repository.id,
        drafts.map(
          (target): SaveRepositoryTarget => ({
            id: target.id.startsWith('manual-') ? undefined : target.id,
            name: target.name,
            path: target.path,
            kind: target.kind,
            packageName: target.packageName,
            scripts: target.scripts,
            source: target.source,
            selected: target.selected,
          }),
        ),
      );
      setTargets(saved);
      setTargetDrafts(undefined);
      const firstSelected = saved.find((target) => target.selected);
      setActiveTargetState(firstSelected?.id);
      setActiveTargetId(repository.id, firstSelected?.id);
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const propose = async () => {
    setPending(true);
    try {
      const next = await api.proposeRepositoryPolicy(repository.id, selectedTarget?.id);
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
      const sessionId = await api.startChangeSession(repository.id, request, selectedTarget?.id);
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
        title={targetLabel}
        description={selectedTarget ? `Target path: ${selectedTarget.path}` : repository.path}
        meta={
          <Badge variant={repository.policy?.valid ? 'default' : 'secondary'}>
            {repository.policy?.valid ? 'Policy ready' : 'Policy required'}
          </Badge>
        }
        actions={
          <>
            <RepositoryTargetPicker
              repositories={repositories.length ? repositories : [repository]}
              targetsByRepository={{ ...targetsByRepository, [repository.id]: targets }}
              activeRepositoryId={repository.id}
              activeTargetId={activeTargetId}
              onSelect={(nextRepositoryId, nextTargetId) => {
                setActiveRepositoryId(nextRepositoryId);
                setActiveTargetId(nextRepositoryId, nextTargetId);
                if (nextRepositoryId === repository.id) setActiveTargetState(nextTargetId);
                else
                  void navigate({
                    to: '/repositories/$repositoryId',
                    params: { repositoryId: nextRepositoryId },
                  });
              }}
              onOpenRepository={() => navigate({ to: '/repositories' })}
              onManageTargets={() => document.getElementById('repository-map')?.scrollIntoView()}
            />
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
          </>
        }
      />

      {repository.dirty ? (
        <p className='border-warning/40 border-y py-3 text-sm'>
          This working tree has uncommitted changes. Sessions start from committed repository state;
          current edits remain untouched and are excluded.
        </p>
      ) : null}
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      <section id='repository-map' className='space-y-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <h2 className='font-medium'>Repository map</h2>
            <p className='text-muted-foreground text-sm'>
              Select the apps and packages you want available as work targets.
            </p>
            {scanDetail ? <p className='text-muted-foreground mt-1 text-xs'>{scanDetail}</p> : null}
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' disabled={pending} onClick={() => scanTargets(true)}>
              <RefreshCw data-icon='inline-start' />
              Scan again
            </Button>
            {targetDrafts ? (
              <Button disabled={pending} onClick={saveTargets}>
                <CheckCircle2 data-icon='inline-start' />
                Save map
              </Button>
            ) : null}
          </div>
        </div>
        <div className='divide-y border-y'>
          {visibleTargets.map((target) => (
            <label
              key={target.id}
              className='flex cursor-pointer items-start justify-between gap-3 py-3'
            >
              <span className='flex min-w-0 items-start gap-3'>
                <Checkbox
                  checked={target.selected}
                  onCheckedChange={(checked) => updateTargetDraft(target.id, Boolean(checked))}
                  className='mt-0.5'
                />
                <span className='min-w-0'>
                  <span className='block truncate text-sm font-medium'>{target.name}</span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {target.path}
                    {target.packageName ? ` · ${target.packageName}` : ''}
                  </span>
                </span>
              </span>
              <Badge variant={target.kind === 'app' ? 'default' : 'secondary'}>
                {target.kind}
              </Badge>
            </label>
          ))}
          {visibleTargets.length === 0 ? (
            <p className='text-muted-foreground py-5 text-sm'>
              No targets yet. Scan this repository or add one manually.
            </p>
          ) : null}
        </div>
        <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
          <Input
            placeholder='Target name'
            value={manualTargetName}
            onChange={(event) => setManualTargetName(event.target.value)}
          />
          <Input
            placeholder='apps/example'
            value={manualTargetPath}
            onChange={(event) => setManualTargetPath(event.target.value)}
          />
          <Button variant='outline' onClick={addManualTarget}>
            <Plus data-icon='inline-start' />
            Add target
          </Button>
        </div>
      </section>

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
              <p className='text-muted-foreground text-sm'>
                {selectedTarget
                  ? `Suggested gates for ${selectedTarget.name}.`
                  : 'Suggested gates for this repository.'}
              </p>
              {draftManifest ? <PolicySummary manifest={draftManifest} /> : null}
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
              <details className='border-y py-3'>
                <summary className='cursor-pointer text-sm font-medium'>Technical details</summary>
                <p className='text-muted-foreground mt-2 text-xs'>
                  Fingerprint {proposal.fingerprint.slice(0, 16)} from{' '}
                  {proposal.fingerprintPaths.length} configuration files.
                </p>
                <Textarea
                  className='mt-3 min-h-80 font-mono text-xs'
                  value={manifestText}
                  onChange={(event) => setManifestText(event.target.value)}
                />
              </details>
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
                <>
                  <PolicySummary manifest={repository.policy.manifest} />
                  <details className='border-y py-3'>
                    <summary className='cursor-pointer text-sm font-medium'>
                      Technical details
                    </summary>
                    <p className='text-muted-foreground mt-2 text-xs'>
                      Fingerprint {repository.policy.fingerprint.slice(0, 16)} from{' '}
                      {repository.policy.fingerprintPaths.length} configuration files.
                    </p>
                    <pre className='bg-muted mt-3 max-h-72 overflow-auto rounded-lg p-4 text-xs'>
                      {JSON.stringify(repository.policy.manifest, null, 2)}
                    </pre>
                  </details>
                </>
              ) : null}
            </div>
          )}
        </section>

        <section className='min-w-0 space-y-4 py-5 xl:pl-6'>
          <div>
            <h2 className='font-medium'>Start change</h2>
            <p className='text-muted-foreground text-sm'>
              Codex works in an app-managed worktree
              {selectedTarget ? ` for ${selectedTarget.name}` : ''}. Your active tree is never
              modified.
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
                  {session.targetName
                    ? `${session.repositoryName} / ${session.targetName}`
                    : session.repositoryName}
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

function PolicySummary({ manifest }: { manifest: VerificationManifest }) {
  const gates = Object.entries(manifest.gates);
  const required = gates.filter(([, gate]) => gate?.required);

  return (
    <div className='divide-y border-y'>
      {required.map(([kind, gate]) => (
        <div key={kind} className='flex items-center justify-between gap-3 py-3'>
          <span className='min-w-0'>
            <span className='block text-sm font-medium'>{kind}</span>
            <span className='text-muted-foreground block truncate text-xs'>
              {gate?.command} {gate?.args.join(' ')}
            </span>
          </span>
          <Badge variant={gate?.network === 'enabled' ? 'secondary' : 'outline'}>
            {gate?.network === 'enabled' ? 'networked install' : 'local'}
          </Badge>
        </div>
      ))}
      {required.length === 0 ? (
        <p className='text-muted-foreground py-5 text-sm'>No required gates configured.</p>
      ) : null}
    </div>
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

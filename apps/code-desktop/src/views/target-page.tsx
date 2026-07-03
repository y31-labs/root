import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { open } from '@tauri-apps/plugin-dialog';
import type { VerificationManifest } from '@workspace/code-agent-contracts/manifest';
import type {
  ChangeSession,
  Repository,
  RepositoryTarget,
  TargetFlowCoverageEvidence,
  TargetFlowOverview,
} from '@workspace/code-agent-contracts/sessions';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { Badge } from '@workspace/ui/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@workspace/ui/components/ui/breadcrumb';
import { Button } from '@workspace/ui/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/ui/tabs';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { CheckCircle2, Play, RefreshCw, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ChangeSessionStatusBadge } from '#/components/change-session-status';
import { FlowWorkbench } from '#/components/flow-workbench';
import { RepositoryTargetPicker } from '#/components/repository-target-picker';
import { setActiveRepositoryId, setActiveTargetId } from '#/lib/active-target';
import type { PolicyProposal } from '#/lib/local-api';
import { useLocalApi } from '#/providers/local-api-provider';

type SessionSummary = ChangeSession & { repositoryName: string };
type TargetTab =
  | 'overview'
  | 'flows'
  | 'changes'
  | 'sessions'
  | 'policy'
  | 'runtime'
  | 'api'
  | 'scope';

export function TargetPage() {
  const { repositoryId, targetId } = useParams({
    from: '/repositories/$repositoryId/targets/$targetId',
  });
  const { tab: searchTab } = useSearch({
    from: '/repositories/$repositoryId/targets/$targetId',
  });
  const api = useLocalApi();
  const navigate = useNavigate();
  const [repository, setRepository] = useState<Repository>();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [targets, setTargets] = useState<RepositoryTarget[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [overview, setOverview] = useState<TargetFlowOverview>();
  const [proposal, setProposal] = useState<PolicyProposal>();
  const [manifestText, setManifestText] = useState('');
  const [request, setRequest] = useState('');
  const [artifactPreview, setArtifactPreview] = useState<{
    id: string;
    label: string;
    content: string;
  }>();
  const [tab, setTab] = useState<TargetTab>('overview');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextRepositories, nextTargets, nextSessions, nextOverview] = await Promise.all([
        api.listRepositories(),
        api.listRepositoryTargets(repositoryId),
        api.listChangeSessions(repositoryId),
        api.getTargetFlowOverview(repositoryId, targetId),
      ]);
      const nextRepository = nextRepositories.find((item) => item.id === repositoryId);
      setRepositories(nextRepositories);
      setRepository(nextRepository);
      setTargets(nextTargets);
      setSessions(nextSessions);
      setOverview(nextOverview);
      if (nextRepository) {
        setActiveRepositoryId(nextRepository.id);
        setActiveTargetId(nextRepository.id, targetId);
      }
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api, repositoryId, targetId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const target = useMemo(
    () => targets.find((item) => item.id === targetId) ?? overview?.snapshot.target,
    [overview?.snapshot.target, targetId, targets],
  );
  const targetSessions = sessions.filter((session) => session.targetId === target?.id);
  const tabs = target ? targetTabs(target.kind) : [];
  const draftManifest = parseManifest(manifestText);

  useEffect(() => {
    const nextTab = parseTargetTab(searchTab);
    if (!nextTab || !target) return;
    if (targetTabs(target.kind).some((item) => item.value === nextTab)) setTab(nextTab);
  }, [searchTab, target]);

  if (!repository || !target) {
    return <div className='p-6'>{error || 'Loading target...'}</div>;
  }

  const targetsByRepository = { [repository.id]: targets };

  const propose = async () => {
    setPending(true);
    try {
      const next = await api.proposeRepositoryPolicy(repository.id, target.id);
      setProposal(next);
      setManifestText(JSON.stringify(next.manifest, null, 2));
      setError('');
      setTab('policy');
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

  const start = async () => {
    setPending(true);
    try {
      const sessionId = await api.startChangeSession(repository.id, request, target.id);
      setRequest('');
      await navigate({ to: '/sessions/$sessionId', params: { sessionId } });
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const previewCoverageArtifact = async (artifact: TargetFlowCoverageEvidence) => {
    setPending(true);
    try {
      const content = await api.readArtifact(artifact.path);
      setArtifactPreview({
        id: artifact.artifactId,
        label: artifact.label,
        content,
      });
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const revealCoverageArtifact = async (artifact: TargetFlowCoverageEvidence) => {
    try {
      await api.revealArtifact(artifact.path);
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  };

  const addRepository = async () => {
    if (pending) return;
    const selected = window.__CODE_TEST_SELECT_DIRECTORY__
      ? await window.__CODE_TEST_SELECT_DIRECTORY__()
      : await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    setPending(true);
    try {
      const nextRepository = await api.registerRepository(selected);
      setActiveRepositoryId(nextRepository.id);
      await navigate({ to: '/' });
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className='min-w-0 space-y-6 p-6'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <button
              type='button'
              className='transition-colors hover:text-foreground'
              onClick={() => navigate({ to: '/repositories' })}
            >
              Repositories
            </button>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <button
              type='button'
              className='transition-colors hover:text-foreground'
              onClick={() =>
                navigate({ to: '/repositories/$repositoryId', params: { repositoryId } })
              }
            >
              {repository.name}
            </button>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>{targetKindLabel(target.kind)}</BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={target.name}
        description={`${repository.name} / ${target.path}`}
        meta={
          <span className='flex items-center gap-2'>
            <Badge variant={target.kind === 'app' ? 'default' : 'secondary'}>{target.kind}</Badge>
            <Badge variant={target.source === 'manual' ? 'outline' : 'secondary'}>
              {target.source}
            </Badge>
            <Badge variant={repository.policy?.valid ? 'default' : 'secondary'}>
              {repository.policy?.valid ? 'Policy ready' : 'Policy required'}
            </Badge>
          </span>
        }
        actions={
          <>
            <RepositoryTargetPicker
              repositories={repositories.length ? repositories : [repository]}
              targetsByRepository={{ ...targetsByRepository, [repository.id]: targets }}
              activeRepositoryId={repository.id}
              activeTargetId={target.id}
              onSelect={(nextRepositoryId, nextTargetId) => {
                setActiveRepositoryId(nextRepositoryId);
                setActiveTargetId(nextRepositoryId, nextTargetId);
                if (nextTargetId) {
                  void navigate({
                    to: '/repositories/$repositoryId/targets/$targetId',
                    params: { repositoryId: nextRepositoryId, targetId: nextTargetId },
                  });
                } else {
                  void navigate({
                    to: '/repositories/$repositoryId',
                    params: { repositoryId: nextRepositoryId },
                  });
                }
              }}
              onOpenRepository={addRepository}
              onManageRepositories={() => navigate({ to: '/' })}
            />
            <Button
              type='button'
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

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const nextTab = value as TargetTab;
          setTab(nextTab);
          void navigate({
            to: '/repositories/$repositoryId/targets/$targetId',
            params: { repositoryId, targetId },
            search: { tab: nextTab },
          });
        }}
      >
        <TabsList variant='line' className='max-w-full flex-wrap justify-start'>
          {tabs.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value='overview' className='space-y-6'>
          <OverviewTab
            repository={repository}
            target={target}
            sessions={targetSessions}
            request={request}
            pending={pending}
            onRequestChange={setRequest}
            onStart={start}
          />
        </TabsContent>

        <TabsContent value='flows' className='space-y-6'>
          <FlowsTab
            overview={overview}
            artifactPreview={artifactPreview}
            onPreviewArtifact={(artifact) => void previewCoverageArtifact(artifact)}
            onRevealArtifact={(artifact) => void revealCoverageArtifact(artifact)}
            onCloseArtifactPreview={() => setArtifactPreview(undefined)}
          />
        </TabsContent>

        <TabsContent value='changes' className='space-y-4'>
          <ChangesTab overview={overview} />
        </TabsContent>

        <TabsContent value='sessions' className='space-y-4'>
          <SessionsTab sessions={targetSessions} />
        </TabsContent>

        <TabsContent value='policy' className='space-y-4'>
          <PolicyTab
            repository={repository}
            proposal={proposal}
            manifestText={manifestText}
            draftManifest={draftManifest}
            pending={pending}
            onManifestTextChange={setManifestText}
            onPropose={propose}
            onApprove={approve}
            onCancelProposal={() => setProposal(undefined)}
          />
        </TabsContent>

        <TabsContent value='runtime' className='space-y-4'>
          <TargetDetailsTab title='Runtime' target={target}>
            <DetailRow label='App server'>
              {repository.policy?.manifest.appServer
                ? repository.policy.manifest.appServer.browserBaseUrl
                : 'No app server configured in the current policy.'}
            </DetailRow>
          </TargetDetailsTab>
        </TabsContent>

        <TabsContent value='api' className='space-y-4'>
          <TargetDetailsTab title='Exports and API' target={target}>
            <DetailRow label='Package name'>{target.packageName ?? 'Not detected'}</DetailRow>
          </TargetDetailsTab>
        </TabsContent>

        <TabsContent value='scope' className='space-y-4'>
          <TargetDetailsTab title='Manual Scope' target={target}>
            <DetailRow label='Included path'>{target.path}</DetailRow>
          </TargetDetailsTab>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({
  repository,
  target,
  sessions,
  request,
  pending,
  onRequestChange,
  onStart,
}: {
  repository: Repository;
  target: RepositoryTarget;
  sessions: SessionSummary[];
  request: string;
  pending: boolean;
  onRequestChange: (value: string) => void;
  onStart: () => void;
}) {
  const lastSession = sessions[0];
  return (
    <>
      <section className='space-y-4'>
        <div>
          <h2 className='font-medium'>Target overview</h2>
          <p className='text-muted-foreground text-sm'>
            Code will scope prompts and verification context to this starting point.
          </p>
        </div>
        <div className='divide-y border-y'>
          <DetailRow label='Path'>{target.path}</DetailRow>
          <DetailRow label='Source'>{target.source}</DetailRow>
          <DetailRow label='Package'>{target.packageName ?? 'Not detected'}</DetailRow>
          <DetailRow label='Scripts'>{scriptSummary(target.scripts)}</DetailRow>
          <DetailRow label='Last session'>
            {lastSession ? `${lastSession.request} (${lastSession.status})` : 'No sessions yet'}
          </DetailRow>
        </div>
      </section>

      <section className='space-y-4'>
        <div>
          <h2 className='font-medium'>Start change</h2>
          <p className='text-muted-foreground text-sm'>
            Codex works in an app-managed worktree for {target.name}. Your active tree is never
            modified.
          </p>
        </div>
        <Textarea
          className='min-h-44'
          placeholder='Describe the change and the behavior that should be verified.'
          value={request}
          onChange={(event) => onRequestChange(event.target.value)}
        />
        <Button
          disabled={
            !repository.compatible || !repository.policy?.valid || pending || !request.trim()
          }
          onClick={onStart}
        >
          <Play data-icon='inline-start' />
          Start isolated session
        </Button>
      </section>
    </>
  );
}

function FlowsTab({
  overview,
  artifactPreview,
  onPreviewArtifact,
  onRevealArtifact,
  onCloseArtifactPreview,
}: {
  overview?: TargetFlowOverview;
  artifactPreview?: { id: string; label: string; content: string };
  onPreviewArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onRevealArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onCloseArtifactPreview: () => void;
}) {
  const flows = overview?.snapshot.flows ?? [];
  const unscopedFlows = overview?.snapshot.unscopedFlows ?? [];
  const proposals = overview?.snapshot.proposals ?? [];
  const invalidDocuments = overview?.snapshot.invalidDocuments ?? [];

  return (
    <>
      <section className='space-y-4'>
        <div>
          <h2 className='font-medium'>Flows visualization</h2>
          <p className='text-muted-foreground text-sm'>
            Flowguard contracts matched by source paths under this target.
          </p>
        </div>
        <FlowWorkbench
          flows={flows}
          empty='No scoped flows matched this target.'
          onPreviewArtifact={onPreviewArtifact}
          onRevealArtifact={onRevealArtifact}
        />
      </section>
      {unscopedFlows.length ? (
        <section className='space-y-4'>
          <div>
            <h2 className='font-medium'>Unscoped flows</h2>
            <p className='text-muted-foreground text-sm'>
              These Flowguard files do not declare source paths yet.
            </p>
          </div>
          <FlowWorkbench
            flows={unscopedFlows}
            empty=''
            onPreviewArtifact={onPreviewArtifact}
            onRevealArtifact={onRevealArtifact}
          />
        </section>
      ) : null}
      {artifactPreview ? (
        <section className='space-y-3 border-y py-4'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='font-medium'>{artifactPreview.label}</h2>
            <Button variant='ghost' size='sm' onClick={onCloseArtifactPreview}>
              Close
            </Button>
          </div>
          {artifactPreview.content.startsWith('data:image/') ? (
            <img
              className='max-h-[42rem] max-w-full object-contain'
              src={artifactPreview.content}
              alt={artifactPreview.label}
            />
          ) : (
            <pre className='bg-muted max-h-[42rem] overflow-auto rounded-lg p-4 text-xs'>
              {artifactPreview.content}
            </pre>
          )}
        </section>
      ) : null}
      <section className='space-y-4'>
        <h2 className='font-medium'>Proposals</h2>
        <div className='divide-y border-y'>
          {proposals.map((proposal) => (
            <div key={proposal.proposalId} className='flex justify-between gap-3 py-3'>
              <span className='min-w-0'>
                <span className='block truncate font-medium'>{proposal.summary}</span>
                <span className='text-muted-foreground block truncate text-xs'>
                  {proposal.relativePath} - {proposal.operationCount} operations
                </span>
              </span>
              <Badge variant='secondary'>{proposal.confidence}</Badge>
            </div>
          ))}
          {proposals.length === 0 ? (
            <p className='text-muted-foreground py-5 text-sm'>
              No pending proposals for these flows.
            </p>
          ) : null}
        </div>
      </section>
      {invalidDocuments.length ? (
        <section className='space-y-4'>
          <h2 className='font-medium'>Invalid Flowguard documents</h2>
          <div className='divide-y border-y'>
            {invalidDocuments.map((document) => (
              <div key={`${document.kind}:${document.relativePath}`} className='py-3'>
                <p className='font-medium'>{document.relativePath}</p>
                <p className='text-muted-foreground text-xs'>
                  {document.kind} - {document.issueCount} issues
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ChangesTab({ overview }: { overview?: TargetFlowOverview }) {
  const timeline = overview?.timeline ?? [];
  return (
    <>
      <div>
        <h2 className='font-medium'>Changes timeline</h2>
        <p className='text-muted-foreground text-sm'>
          Flowguard flow files added, deleted, or changed over repository history.
        </p>
      </div>
      <div className='divide-y border-y'>
        {timeline.map((item) => (
          <div key={item.id} className='flex items-start justify-between gap-3 py-3'>
            <span className='min-w-0'>
              <span className='block truncate font-medium'>{item.summary}</span>
              <span className='text-muted-foreground block truncate text-xs'>
                {formatDate(item.committedAt)} - {item.commitSubject} - {item.commitSha.slice(0, 8)}
              </span>
            </span>
            <Badge variant={item.changeType === 'deleted' ? 'secondary' : 'outline'}>
              {item.changeType}
            </Badge>
          </div>
        ))}
        {timeline.length === 0 ? (
          <p className='text-muted-foreground py-5 text-sm'>No flow changes found yet.</p>
        ) : null}
      </div>
    </>
  );
}

function SessionsTab({ sessions }: { sessions: SessionSummary[] }) {
  const navigate = useNavigate();
  return (
    <>
      <h2 className='font-medium'>Target sessions</h2>
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
              <span className='text-muted-foreground block truncate text-xs'>
                {formatDate(session.createdAt)}
              </span>
            </span>
            <ChangeSessionStatusBadge status={session.status} />
          </button>
        ))}
        {sessions.length === 0 ? (
          <p className='text-muted-foreground py-5 text-sm'>No sessions for this target yet.</p>
        ) : null}
      </div>
    </>
  );
}

function PolicyTab({
  repository,
  proposal,
  manifestText,
  draftManifest,
  pending,
  onManifestTextChange,
  onPropose,
  onApprove,
  onCancelProposal,
}: {
  repository: Repository;
  proposal?: PolicyProposal;
  manifestText: string;
  draftManifest?: VerificationManifest;
  pending: boolean;
  onManifestTextChange: (value: string) => void;
  onPropose: () => void;
  onApprove: () => void;
  onCancelProposal: () => void;
}) {
  return (
    <>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h2 className='font-medium'>Policy and gates</h2>
          <p className='text-muted-foreground text-sm'>
            Repository policy is approved at repository level, with target-aware suggestions.
          </p>
        </div>
        <Button variant='outline' disabled={pending} onClick={onPropose}>
          <Settings2 data-icon='inline-start' />
          {repository.policy ? 'Review policy' : 'Propose policy'}
        </Button>
      </div>
      {proposal ? (
        <>
          {draftManifest ? <PolicySummary manifest={draftManifest} /> : null}
          <Textarea
            className='min-h-80 font-mono text-xs'
            value={manifestText}
            onChange={(event) => onManifestTextChange(event.target.value)}
          />
          <div className='flex gap-2'>
            <Button disabled={pending} onClick={onApprove}>
              <CheckCircle2 data-icon='inline-start' />
              Approve policy
            </Button>
            <Button variant='outline' onClick={onCancelProposal}>
              Cancel
            </Button>
          </div>
        </>
      ) : repository.policy ? (
        <PolicySummary manifest={repository.policy.manifest} />
      ) : (
        <p className='text-muted-foreground border-y py-5 text-sm'>
          No policy has been approved yet.
        </p>
      )}
    </>
  );
}

function TargetDetailsTab({
  title,
  target,
  children,
}: {
  title: string;
  target: RepositoryTarget;
  children: ReactNode;
}) {
  return (
    <section className='space-y-4'>
      <div>
        <h2 className='font-medium'>{title}</h2>
        <p className='text-muted-foreground text-sm'>
          {target.name} at {target.path}
        </p>
      </div>
      <div className='divide-y border-y'>
        {children}
        <DetailRow label='Scripts'>{scriptSummary(target.scripts)}</DetailRow>
      </div>
    </section>
  );
}

function PolicySummary({ manifest }: { manifest: VerificationManifest }) {
  const required = Object.entries(manifest.gates).filter(([, gate]) => gate?.required);
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

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='grid gap-1 py-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='min-w-0 break-words'>{children}</span>
    </div>
  );
}

function targetTabs(kind: RepositoryTarget['kind']): Array<{ value: TargetTab; label: string }> {
  const tabs: Array<{ value: TargetTab; label: string }> = [
    { value: 'overview', label: 'Overview' },
    { value: 'flows', label: 'Flows' },
    { value: 'changes', label: 'Changes' },
    { value: 'sessions', label: 'Sessions' },
    { value: 'policy', label: 'Policy' },
  ];
  if (kind === 'app') tabs.push({ value: 'runtime', label: 'Runtime' });
  if (kind === 'package') tabs.push({ value: 'api', label: 'API' });
  if (kind === 'other') tabs.push({ value: 'scope', label: 'Scope' });
  return tabs;
}

function parseTargetTab(value: unknown): TargetTab | undefined {
  return targetTabValues.includes(value as TargetTab) ? (value as TargetTab) : undefined;
}

const targetTabValues: TargetTab[] = [
  'overview',
  'flows',
  'changes',
  'sessions',
  'policy',
  'runtime',
  'api',
  'scope',
];

function targetKindLabel(kind: RepositoryTarget['kind']) {
  if (kind === 'app') return 'Apps';
  if (kind === 'package') return 'Packages';
  return 'Other';
}

function scriptSummary(scripts: Record<string, string>) {
  const names = Object.keys(scripts);
  return names.length ? names.join(', ') : 'No scripts detected';
}

function parseManifest(value: string) {
  try {
    return JSON.parse(value) as VerificationManifest;
  } catch {
    return undefined;
  }
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

import { open } from '@tauri-apps/plugin-dialog';
import type {
  Repository,
  RepositoryMappingMode,
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
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/ui/breadcrumb';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@workspace/ui/components/ui/command';
import {
  Bot,
  Cloud,
  Code2,
  FileText,
  FolderGit2,
  GitBranch,
  Image,
  Plus,
  RefreshCw,
  Video,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { FlowWorkbench } from '#/components/flow-workbench';
import { RepositoryTargetPicker } from '#/components/repository-target-picker';
import {
  getActiveRepositoryId,
  getActiveTargetId,
  setActiveRepositoryId,
  setActiveTargetId,
} from '#/lib/active-target';
import type { SaveRepositoryTarget } from '#/lib/local-api';
import { useLocalApi } from '#/providers/local-api-provider';

type HomeView = 'flows' | 'artifacts';

export function HomePage() {
  const api = useLocalApi();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [targetsByRepository, setTargetsByRepository] = useState<
    Record<string, RepositoryTarget[]>
  >({});
  const [activeRepositoryId, setActiveRepositoryState] = useState<string>();
  const [activeTargetId, setActiveTargetState] = useState<string>();
  const [overview, setOverview] = useState<TargetFlowOverview>();
  const [artifactPreview, setArtifactPreview] = useState<{
    id: string;
    label: string;
    content: string;
  }>();
  const [view, setView] = useState<HomeView>('flows');
  const [actionOpen, setActionOpen] = useState(false);
  const [mappingMode, setMappingMode] = useState<RepositoryMappingMode>('code');
  const [mapDetail, setMapDetail] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [overviewPending, setOverviewPending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const nextRepositories = await api.listRepositories();
      const targetPairs = await Promise.all(
        nextRepositories.map(
          async (repository) =>
            [repository.id, await api.listRepositoryTargets(repository.id)] as const,
        ),
      );
      const nextTargets = Object.fromEntries(targetPairs);
      const storedRepositoryId = getActiveRepositoryId();
      const nextActiveRepository =
        nextRepositories.find((repository) => repository.id === storedRepositoryId) ??
        nextRepositories[0];
      const storedTargetId = nextActiveRepository
        ? getActiveTargetId(nextActiveRepository.id)
        : undefined;
      const fallbackTarget = nextActiveRepository
        ? nextTargets[nextActiveRepository.id]?.find((target) => target.selected)
        : undefined;
      const nextActiveTargetId =
        nextActiveRepository &&
        nextTargets[nextActiveRepository.id]?.some((target) => target.id === storedTargetId)
          ? storedTargetId
          : fallbackTarget?.id;

      setRepositories(nextRepositories);
      setTargetsByRepository(nextTargets);
      setActiveRepositoryState(nextActiveRepository?.id);
      setActiveTargetState(nextActiveTargetId);
      if (nextActiveRepository) {
        setActiveRepositoryId(nextActiveRepository.id);
        setActiveTargetId(nextActiveRepository.id, nextActiveTargetId);
      }
      setError('');
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeRepository = repositories.find((repository) => repository.id === activeRepositoryId);
  const activeTargets = activeRepositoryId ? (targetsByRepository[activeRepositoryId] ?? []) : [];
  const selectedTargets = activeTargets.filter((target) => target.selected);
  const activeTarget =
    selectedTargets.find((target) => target.id === activeTargetId) ?? selectedTargets[0];
  const flowArtifacts = useMemo(() => artifactEvidence(overview), [overview]);
  const scopedFlows = overview?.snapshot.flows ?? [];

  useEffect(() => {
    if (!activeRepository || !activeTarget) {
      setOverview(undefined);
      return;
    }

    let cancelled = false;
    setOverviewPending(true);
    void api
      .getTargetFlowOverview(activeRepository.id, activeTarget.id)
      .then((nextOverview) => {
        if (!cancelled) {
          setOverview(nextOverview);
          setError('');
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setOverview(undefined);
          setError(errorMessage(nextError));
        }
      })
      .finally(() => {
        if (!cancelled) setOverviewPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeRepository, activeTarget, api]);

  const status = useMemo(() => {
    if (!activeRepository) return 'No repository';
    if (!selectedTargets.length) return 'Mapping required';
    if (!activeRepository.compatible) return 'Unsupported';
    if (!activeRepository.policy?.valid) return 'Policy required';
    return 'Ready';
  }, [activeRepository, selectedTargets.length]);

  const addRepository = async () => {
    if (pending) return;
    const selected = window.__CODE_TEST_SELECT_DIRECTORY__
      ? await window.__CODE_TEST_SELECT_DIRECTORY__()
      : await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    setPending(true);
    try {
      const repository = await api.registerRepository(selected);
      setActiveRepositoryId(repository.id);
      setActiveRepositoryState(repository.id);
      setView('flows');
      setArtifactPreview(undefined);
      await refresh();
      setActionOpen(false);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const selectTarget = (repositoryId: string, targetId?: string) => {
    const repositoryTargets = targetsByRepository[repositoryId] ?? [];
    const nextTargetId = targetId ?? repositoryTargets.find((target) => target.selected)?.id;
    setActiveRepositoryId(repositoryId);
    setActiveTargetId(repositoryId, nextTargetId);
    setActiveRepositoryState(repositoryId);
    setActiveTargetState(nextTargetId);
    setView('flows');
    setArtifactPreview(undefined);
  };

  const mapRepository = async (repositoryId: string, mode = mappingMode) => {
    setPending(true);
    try {
      const scan = await api.scanRepositoryTargets(repositoryId, mode);
      const discovered = scan.targets.length
        ? scan.targets
        : [
            {
              id: `root-${repositoryId}`,
              repositoryId,
              name:
                repositories.find((repository) => repository.id === repositoryId)?.name ?? 'Root',
              path: '.',
              kind: 'other' as const,
              scripts: {},
              source: 'detected' as const,
              selected: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ];
      const drafts = discovered.some((target) => target.selected)
        ? discovered
        : discovered.map((target) => ({ ...target, selected: true }));
      const saved = await api.saveRepositoryTargets(
        repositoryId,
        drafts.map(
          (target): SaveRepositoryTarget => ({
            id: target.id.startsWith('root-') ? undefined : target.id,
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
      const firstSelected = saved.find((target) => target.selected);
      setTargetsByRepository((current) => ({ ...current, [repositoryId]: saved }));
      if (repositoryId === activeRepositoryId || !activeRepositoryId) {
        setActiveRepositoryId(repositoryId);
        setActiveTargetId(repositoryId, firstSelected?.id);
        setActiveRepositoryState(repositoryId);
        setActiveTargetState(firstSelected?.id);
      }
      setMapDetail(scan.assisted ? mappedWithMode(mode) : (scan.assistanceDetail ?? ''));
      setView('flows');
      setArtifactPreview(undefined);
      setError('');
      setActionOpen(false);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  const refreshRepository = async (repositoryId: string) => {
    setPending(true);
    try {
      await api.refreshRepository(repositoryId);
      await refresh();
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

  const headerActions = (
    <>
      {activeTarget ? (
        <Button
          variant={view === 'artifacts' ? 'default' : 'outline'}
          onClick={() => {
            setView(view === 'artifacts' ? 'flows' : 'artifacts');
            setArtifactPreview(undefined);
          }}
        >
          <FileText data-icon='inline-start' />
          Artifacts
        </Button>
      ) : null}
      {activeRepository ? (
        <Button
          variant='outline'
          disabled={pending}
          onClick={() => void mapRepository(activeRepository.id)}
        >
          <Workflow data-icon='inline-start' />
          Remap
        </Button>
      ) : null}
      <RepositoryTargetPicker
        repositories={repositories}
        targetsByRepository={targetsByRepository}
        activeRepositoryId={activeRepositoryId}
        activeTargetId={activeTarget?.id}
        onSelect={selectTarget}
        onOpenRepository={addRepository}
        onManageRepositories={() => setActionOpen(true)}
      />
    </>
  );

  return (
    <>
      <div className='flex min-h-0 flex-col gap-5 p-6'>
        {activeTarget ? (
          <header className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <HomeBreadcrumb target={activeTarget} view={view} onViewChange={setView} />
            <div className='flex shrink-0 flex-wrap items-center gap-2 sm:justify-end'>
              {headerActions}
            </div>
          </header>
        ) : (
          <PageHeader
            title='Code'
            description={
              activeRepository ? activeRepository.path : 'Local verified change workspace'
            }
            meta={
              status === 'Policy required' ? null : (
                <Badge variant={status === 'Ready' ? 'default' : 'secondary'}>{status}</Badge>
              )
            }
            actions={headerActions}
          />
        )}

        {error ? <p className='text-destructive text-sm'>{error}</p> : null}

        {activeRepository ? (
          selectedTargets.length && activeTarget ? (
            view === 'artifacts' ? (
              <ArtifactsView
                artifacts={flowArtifacts}
                artifactPreview={artifactPreview}
                onPreviewArtifact={(artifact) => void previewCoverageArtifact(artifact)}
                onRevealArtifact={(artifact) => void revealCoverageArtifact(artifact)}
                onCloseArtifactPreview={() => setArtifactPreview(undefined)}
              />
            ) : (
              <section className='min-h-0 flex-1'>
                {overviewPending && !overview ? (
                  <p className='text-muted-foreground border-y py-5 text-sm'>Loading flows...</p>
                ) : !overview ? (
                  <p className='text-muted-foreground border-y py-5 text-sm'>
                    Flow overview unavailable.
                  </p>
                ) : scopedFlows.length ? (
                  <FlowWorkbench
                    layout='unified'
                    flows={scopedFlows}
                    empty='No flows scoped to this app yet.'
                    className='min-h-0'
                    canvasClassName='h-[calc(100vh-15rem)] min-h-[34rem]'
                    onPreviewArtifact={(artifact) => void previewCoverageArtifact(artifact)}
                    onRevealArtifact={(artifact) => void revealCoverageArtifact(artifact)}
                  />
                ) : (
                  <ScopedFlowsEmptyState
                    target={activeTarget}
                    overview={overview}
                    pending={pending}
                    onConfigureMap={() => setActionOpen(true)}
                    onRemap={() => void mapRepository(activeRepository.id)}
                  />
                )}
                {mapDetail ? (
                  <p className='text-muted-foreground mt-3 text-xs'>{mapDetail}</p>
                ) : null}
              </section>
            )
          ) : (
            <MapPrompt
              pending={pending}
              repository={activeRepository}
              mapDetail={mapDetail}
              onMap={() => void mapRepository(activeRepository.id)}
            />
          )
        ) : (
          <EmptyHome />
        )}
      </div>

      <RepositoryActionDialog
        open={actionOpen}
        pending={pending}
        repositories={repositories}
        targetsByRepository={targetsByRepository}
        activeRepositoryId={activeRepositoryId}
        activeTargetId={activeTarget?.id}
        mappingMode={mappingMode}
        onOpenChange={setActionOpen}
        onOpenRepository={addRepository}
        onSelectTarget={selectTarget}
        onMapRepository={(repositoryId) => void mapRepository(repositoryId)}
        onRefreshRepository={(repositoryId) => void refreshRepository(repositoryId)}
        onMappingModeChange={setMappingMode}
      />
    </>
  );
}

function HomeBreadcrumb({
  target,
  view,
  onViewChange,
}: {
  target: RepositoryTarget;
  view: HomeView;
  onViewChange: (view: HomeView) => void;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {view === 'artifacts' ? (
            <button
              type='button'
              className='transition-colors hover:text-foreground'
              onClick={() => onViewChange('flows')}
            >
              {target.name}
            </button>
          ) : (
            <BreadcrumbPage>{target.name}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {view === 'artifacts' ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Artifacts</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function ArtifactsView({
  artifacts,
  artifactPreview,
  onPreviewArtifact,
  onRevealArtifact,
  onCloseArtifactPreview,
}: {
  artifacts: TargetFlowCoverageEvidence[];
  artifactPreview?: { id: string; label: string; content: string };
  onPreviewArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onRevealArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onCloseArtifactPreview: () => void;
}) {
  return (
    <section className='grid min-h-0 gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]'>
      <div className='h-[calc(100vh-15rem)] min-h-[34rem] overflow-auto border-y'>
        <div className='divide-y'>
          {artifacts.map((artifact) => (
            <ArtifactRow
              key={artifact.artifactId}
              artifact={artifact}
              onPreviewArtifact={onPreviewArtifact}
              onRevealArtifact={onRevealArtifact}
            />
          ))}
          {artifacts.length === 0 ? (
            <p className='text-muted-foreground py-5 text-sm'>No recordings yet.</p>
          ) : null}
        </div>
      </div>
      <div className='h-[calc(100vh-15rem)] min-h-[34rem] overflow-auto border-y py-4'>
        {artifactPreview ? (
          <ArtifactPreview artifactPreview={artifactPreview} onClose={onCloseArtifactPreview} />
        ) : (
          <p className='text-muted-foreground text-sm'>Select an artifact.</p>
        )}
      </div>
    </section>
  );
}

function ArtifactRow({
  artifact,
  onPreviewArtifact,
  onRevealArtifact,
}: {
  artifact: TargetFlowCoverageEvidence;
  onPreviewArtifact: (artifact: TargetFlowCoverageEvidence) => void;
  onRevealArtifact: (artifact: TargetFlowCoverageEvidence) => void;
}) {
  const Icon = artifactIcon(artifact.kind);
  return (
    <div className='flex items-center justify-between gap-3 py-3'>
      <span className='flex min-w-0 items-center gap-2'>
        <Icon className='text-muted-foreground size-4 shrink-0' />
        <span className='min-w-0'>
          <span className='block truncate text-sm font-medium'>{artifact.label}</span>
          <span className='text-muted-foreground block truncate text-xs'>
            {artifactKindLabel(artifact.kind)}
          </span>
        </span>
      </span>
      <span className='flex shrink-0 gap-2'>
        {artifact.kind !== 'playwrightTrace' ? (
          <Button size='sm' variant='outline' onClick={() => onPreviewArtifact(artifact)}>
            Preview
          </Button>
        ) : null}
        <Button size='sm' variant='ghost' onClick={() => onRevealArtifact(artifact)}>
          Reveal
        </Button>
      </span>
    </div>
  );
}

function ArtifactPreview({
  artifactPreview,
  onClose,
}: {
  artifactPreview: { id: string; label: string; content: string };
  onClose: () => void;
}) {
  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <h2 className='truncate font-medium'>{artifactPreview.label}</h2>
        <Button variant='ghost' size='sm' onClick={onClose}>
          Close
        </Button>
      </div>
      {artifactPreview.content.startsWith('data:image/') ? (
        <img
          className='max-h-[calc(100vh-20rem)] max-w-full object-contain'
          src={artifactPreview.content}
          alt={artifactPreview.label}
        />
      ) : (
        <pre className='bg-muted max-h-[calc(100vh-20rem)] overflow-auto rounded-md p-4 text-xs'>
          {artifactPreview.content}
        </pre>
      )}
    </div>
  );
}

function RepositoryActionDialog({
  open,
  pending,
  repositories,
  targetsByRepository,
  activeRepositoryId,
  activeTargetId,
  mappingMode,
  onOpenChange,
  onOpenRepository,
  onSelectTarget,
  onMapRepository,
  onRefreshRepository,
  onMappingModeChange,
}: {
  open: boolean;
  pending: boolean;
  repositories: Repository[];
  targetsByRepository: Record<string, RepositoryTarget[]>;
  activeRepositoryId?: string;
  activeTargetId?: string;
  mappingMode: RepositoryMappingMode;
  onOpenChange: (open: boolean) => void;
  onOpenRepository: () => void;
  onSelectTarget: (repositoryId: string, targetId?: string) => void;
  onMapRepository: (repositoryId: string) => void;
  onRefreshRepository: (repositoryId: string) => void;
  onMappingModeChange: (mode: RepositoryMappingMode) => void;
}) {
  const [query, setQuery] = useState('');
  const filteredRepositories = repositories.filter((repository) =>
    `${repository.name} ${repository.path}`.toLowerCase().includes(query.toLowerCase()),
  );
  const activeRepository = repositories.find((repository) => repository.id === activeRepositoryId);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Repositories'
      description='Add, switch, and map local repositories'
      showCloseButton
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder='Search local repositories...'
          value={query}
          onValueChange={setQuery}
          disabled={pending}
        />
        <CommandList>
          <CommandEmpty>No repositories found.</CommandEmpty>
          <CommandGroup heading='Actions'>
            <CommandItem disabled={pending} onSelect={onOpenRepository}>
              <Plus />
              Open local repository
            </CommandItem>
            {activeRepository ? (
              <>
                <CommandItem
                  disabled={pending}
                  onSelect={() => onMapRepository(activeRepository.id)}
                >
                  <Workflow />
                  Map current project
                </CommandItem>
                <CommandItem
                  disabled={pending}
                  onSelect={() => onRefreshRepository(activeRepository.id)}
                >
                  <RefreshCw />
                  Refresh current repository
                </CommandItem>
              </>
            ) : null}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading='Mapping automation'>
            {mappingModes.map((mode) => {
              const Icon = mode.icon;
              return (
                <CommandItem
                  key={mode.id}
                  disabled={mode.disabled || pending}
                  data-checked={mode.id === mappingMode}
                  onSelect={() => onMappingModeChange(mode.id)}
                >
                  <Icon />
                  <span className='min-w-0'>
                    <span className='block truncate'>{mode.label}</span>
                    <span className='text-muted-foreground block truncate text-xs'>
                      {mode.detail}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          {filteredRepositories.length ? (
            <>
              <CommandSeparator />
              <CommandGroup heading='Repositories'>
                {filteredRepositories.map((repository) => {
                  const targets = targetsByRepository[repository.id]?.filter(
                    (target) => target.selected,
                  );
                  return (
                    <div key={repository.id} className='px-1 py-1'>
                      <CommandItem
                        value={`repo:${repository.id}`}
                        disabled={pending}
                        onSelect={() => onSelectTarget(repository.id)}
                      >
                        <FolderGit2 />
                        <span className='min-w-0'>
                          <span className='block truncate'>{repository.name}</span>
                          <span className='text-muted-foreground block truncate text-xs'>
                            {repository.path}
                          </span>
                        </span>
                      </CommandItem>
                      {targets?.map((target) => (
                        <CommandItem
                          key={target.id}
                          value={`target:${target.id}`}
                          disabled={pending}
                          data-checked={target.id === activeTargetId}
                          onSelect={() => onSelectTarget(repository.id, target.id)}
                          className='ml-5'
                        >
                          <GitBranch />
                          <span className='min-w-0'>
                            <span className='block truncate'>{target.name}</span>
                            <span className='text-muted-foreground block truncate text-xs'>
                              {target.path}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </div>
                  );
                })}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function MapPrompt({
  repository,
  pending,
  mapDetail,
  onMap,
}: {
  repository: Repository;
  pending: boolean;
  mapDetail: string;
  onMap: () => void;
}) {
  return (
    <section className='border-y py-12'>
      <div className='max-w-xl space-y-4'>
        <Workflow className='text-muted-foreground size-8' />
        <div>
          <h2 className='font-medium'>Map {repository.name}</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Automatic project mapping will identify apps, packages, and scopes for the workspace.
          </p>
          {mapDetail ? <p className='text-muted-foreground mt-1 text-xs'>{mapDetail}</p> : null}
        </div>
        <Button disabled={pending} onClick={onMap}>
          <Workflow data-icon='inline-start' />
          Map project
        </Button>
      </div>
    </section>
  );
}

function EmptyHome() {
  return (
    <section className='border-y py-12'>
      <div className='max-w-xl space-y-4'>
        <FolderGit2 className='text-muted-foreground size-8' />
        <div>
          <h2 className='font-medium'>Open a local repository</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            Code builds the project map from committed repository state.
          </p>
        </div>
      </div>
    </section>
  );
}

function ScopedFlowsEmptyState({
  target,
  overview,
  pending,
  onConfigureMap,
  onRemap,
}: {
  target: RepositoryTarget;
  overview: TargetFlowOverview;
  pending: boolean;
  onConfigureMap: () => void;
  onRemap: () => void;
}) {
  const unscopedFlowCount = overview.snapshot.unscopedFlows.length;
  const invalidDocumentCount = overview.snapshot.invalidDocuments.length;
  const targetPath = targetPathLabel(target);

  return (
    <section className='border-y py-8'>
      <div className='max-w-2xl space-y-5'>
        <div className='space-y-2'>
          <Workflow className='text-muted-foreground size-8' />
          <div>
            <h2 className='font-medium'>No scoped flows for {target.name}</h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              This view renders committed Flowguard contracts whose source paths match {targetPath}.
              Sessions and exported evidence still live in the session and artifact views.
            </p>
          </div>
        </div>

        <div className='divide-y border-y'>
          <EmptyStateRow
            icon={Workflow}
            title='Flow contracts'
            detail={
              unscopedFlowCount
                ? `${formatCount(unscopedFlowCount, 'flow')} found without source paths for this target.`
                : 'No committed .flowguard/flows documents matched this target.'
            }
          />
          <EmptyStateRow
            icon={FileText}
            title='Coverage'
            detail='Committed .flowguard/coverage documents add expected e2e behavior and artifacts.'
          />
          <EmptyStateRow
            icon={GitBranch}
            title='Target map'
            detail={
              invalidDocumentCount
                ? `${formatCount(invalidDocumentCount, 'invalid document')} found. Configure the map or fix the documents, then remap.`
                : `Remap after ${target.name}'s path, package, or scripts change.`
            }
          />
        </div>

        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' disabled={pending} onClick={onConfigureMap}>
            <FolderGit2 data-icon='inline-start' />
            Configure project map
          </Button>
          <Button disabled={pending} onClick={onRemap}>
            <Workflow data-icon='inline-start' />
            Remap
          </Button>
        </div>
      </div>
    </section>
  );
}

function EmptyStateRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Workflow;
  title: string;
  detail: string;
}) {
  return (
    <div className='flex items-start gap-3 py-3'>
      <Icon className='text-muted-foreground mt-0.5 size-4 shrink-0' />
      <div className='min-w-0'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-muted-foreground text-sm'>{detail}</p>
      </div>
    </div>
  );
}

function artifactEvidence(overview?: TargetFlowOverview): TargetFlowCoverageEvidence[] {
  const seen = new Set<string>();
  return (overview?.snapshot.flows ?? [])
    .flatMap((flow) => flow.coverageScenarios)
    .flatMap((scenario) => scenario.evidence)
    .filter((artifact) => {
      if (seen.has(artifact.artifactId)) return false;
      seen.add(artifact.artifactId);
      return true;
    });
}

function artifactIcon(kind: TargetFlowCoverageEvidence['kind']) {
  if (kind === 'screenshot') return Image;
  if (kind === 'playwrightTrace') return Video;
  return FileText;
}

function artifactKindLabel(kind: TargetFlowCoverageEvidence['kind']) {
  if (kind === 'screenshot') return 'Image';
  if (kind === 'playwrightTrace') return 'Recording';
  return 'Assertions';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function targetPathLabel(target: RepositoryTarget) {
  return target.path === '.' ? 'the repository root' : target.path;
}

function formatCount(count: number, label: string) {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

const mappingModes: Array<{
  id: RepositoryMappingMode;
  label: string;
  detail: string;
  disabled?: boolean;
  icon: typeof Code2;
}> = [
  {
    id: 'code',
    label: 'Code automatic',
    detail: 'Available now',
    icon: Code2,
  },
  {
    id: 'claude',
    label: 'Claude local',
    detail: 'Planned',
    disabled: true,
    icon: Bot,
  },
  {
    id: 'cloudApi',
    label: 'Cloud API',
    detail: 'Planned',
    disabled: true,
    icon: Cloud,
  },
];

const mappedWithMode = (mode: RepositoryMappingMode) =>
  mappingModes.find((item) => item.id === mode)?.label ?? 'Automatic mapping';

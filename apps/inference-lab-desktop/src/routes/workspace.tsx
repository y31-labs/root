import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  RotateCcw,
  Settings,
  Sparkles,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { GeneratedAppSandbox } from '#/components/generated-app-sandbox';
import type { Project } from '#/lib/types';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/workspace')({
  validateSearch: (search: Record<string, unknown>) => ({
    projectId: typeof search.projectId === 'string' ? search.projectId : '',
  }),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { projectId } = Route.useSearch();
  const api = useLocalApi();
  const [project, setProject] = useState<Project>();
  const [activeVersion, setActiveVersion] = useState(0);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const initialGeneration = useRef<string | undefined>(undefined);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    const nextProject = await api.getProject(projectId);
    if (!nextProject) throw new Error('Project not found.');
    setProject(nextProject);
    setActiveVersion((current) =>
      nextProject.versions[current] ? current : Math.max(nextProject.versions.length - 1, 0),
    );
    return nextProject;
  }, [api, projectId]);

  const generate = useCallback(
    async (instruction: string, baseVersionId?: string) => {
      setPending(true);
      setError('');
      try {
        const nextProject = await api.generateProjectRevision(
          projectId,
          instruction,
          baseVersionId,
        );
        setProject(nextProject);
        setActiveVersion(Math.max(nextProject.versions.length - 1, 0));
        window.dispatchEvent(new Event('y31:projects-changed'));
      } catch (nextError) {
        setError(errorMessage(nextError));
      } finally {
        setPending(false);
      }
    },
    [api, projectId],
  );

  useEffect(() => {
    let cancelled = false;
    if (!projectId) return;
    void loadProject()
      .then((nextProject) => {
        if (
          cancelled ||
          !nextProject ||
          nextProject.versions.length ||
          initialGeneration.current === nextProject.id
        ) {
          return;
        }
        initialGeneration.current = nextProject.id;
        void generate(nextProject.brief);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(errorMessage(nextError));
      });
    return () => {
      cancelled = true;
    };
  }, [generate, loadProject, projectId]);

  const version = project?.versions[activeVersion];
  const canGoBack = activeVersion > 0 && !pending;
  const canGoForward = Boolean(project?.versions[activeVersion + 1]) && !pending;

  const refine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instruction = draft.trim();
    if (instruction.length < 8 || pending || !version) return;
    setDraft('');
    void generate(instruction, version.id);
  };

  if (!projectId) return <MissingProject />;

  return (
    <main className='flex min-h-0 flex-1 flex-col bg-background text-foreground'>
      <header className='flex h-14 shrink-0 items-center justify-between gap-4 border-b px-5'>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <h1 className='truncate text-sm font-medium'>{project?.title ?? 'Opening tool'}</h1>
            {pending ? (
              <Badge variant='secondary'>Inferring</Badge>
            ) : version ? (
              <Badge variant='outline'>Version {version.ordinal}</Badge>
            ) : null}
          </div>
          {project?.description ? (
            <p className='truncate text-xs text-muted-foreground'>{project.description}</p>
          ) : null}
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Previous version'
            disabled={!canGoBack}
            onClick={() => setActiveVersion((current) => current - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label='Next version'
            disabled={!canGoForward}
            onClick={() => setActiveVersion((current) => current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </header>

      <div className='flex min-h-0 flex-1'>
        <aside className='flex w-80 shrink-0 flex-col border-r'>
          <div className='min-h-0 flex-1 overflow-y-auto'>
            <section className='px-5 py-5'>
              <p className='text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground'>
                Original process
              </p>
              <p className='mt-3 text-sm leading-6'>{project?.brief ?? 'Loading…'}</p>
            </section>
            {project?.versions.length ? (
              <section className='border-t px-5 py-5'>
                <div className='flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground'>
                  <History className='size-3.5' />
                  Revision history
                </div>
                <ol className='mt-3 divide-y border-y'>
                  {project.versions.map((projectVersion, index) => (
                    <li key={projectVersion.id}>
                      <button
                        type='button'
                        className='grid w-full grid-cols-[1.75rem_1fr] gap-2 py-3 text-left'
                        onClick={() => setActiveVersion(index)}
                      >
                        <span className='font-mono text-xs text-muted-foreground'>
                          {String(projectVersion.ordinal).padStart(2, '0')}
                        </span>
                        <span className='min-w-0'>
                          <span className='block truncate text-sm'>
                            {projectVersion.instruction}
                          </span>
                          <span className='mt-0.5 block text-xs text-muted-foreground'>
                            {index === activeVersion ? 'Viewing now' : projectVersion.title}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <form className='shrink-0 border-t p-4' onSubmit={refine}>
            <label htmlFor='refinement' className='text-xs font-medium'>
              Refine this tool
            </label>
            <Textarea
              id='refinement'
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              className='mt-2 min-h-24 resize-none'
              placeholder='Add a finance review step before approval…'
              disabled={!version || pending}
            />
            <div className='mt-2 flex items-center justify-between gap-2'>
              <span className='text-xs text-muted-foreground'>
                Keeps the current app in context
              </span>
              <Button
                type='submit'
                size='icon-sm'
                aria-label='Apply refinement'
                disabled={!version || pending || draft.trim().length < 8}
              >
                {pending ? <LoaderCircle className='animate-spin' /> : <ArrowUp />}
              </Button>
            </div>
          </form>
        </aside>

        <section className='relative min-w-0 flex-1' aria-live='polite'>
          {version ? (
            <GeneratedAppSandbox title={version.title} html={version.html} />
          ) : (
            <GenerationStage
              brief={project?.brief}
              error={error}
              pending={pending || !project}
              onRetry={() => project && void generate(project.brief)}
            />
          )}
          {pending && version ? (
            <div className='pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm'>
              <div className='flex items-center gap-3 text-sm'>
                <LoaderCircle className='size-4 animate-spin' />
                Reworking the interface
              </div>
            </div>
          ) : null}
          {error && version ? (
            <div className='absolute inset-x-0 bottom-0 border-t bg-background px-5 py-3 text-sm text-danger'>
              {error}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function GenerationStage({
  brief,
  error,
  pending,
  onRetry,
}: {
  brief?: string;
  error: string;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <div className='flex h-full items-center justify-center px-8'>
      <div className='max-w-lg text-center'>
        {pending ? (
          <LoaderCircle className='mx-auto size-5 animate-spin text-muted-foreground' />
        ) : (
          <Sparkles className='mx-auto size-5 text-muted-foreground' />
        )}
        <p className='mt-5 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground'>
          {pending ? 'Inferring the operational model' : 'Generation paused'}
        </p>
        <h2 className='mt-3 text-balance text-xl font-medium leading-8'>
          {pending ? (brief ?? 'Opening the workspace') : error}
        </h2>
        {error ? (
          <div className='mt-6 flex items-center justify-center gap-2'>
            <Button type='button' variant='outline' onClick={onRetry}>
              <RotateCcw /> Retry
            </Button>
            <Button type='button' variant='ghost' render={<Link to='/settings' />}>
              <Settings /> Service settings
            </Button>
          </div>
        ) : (
          <p className='mt-3 text-sm text-muted-foreground'>
            Modeling states, actions, ownership, and the smallest useful interface.
          </p>
        )}
      </div>
    </div>
  );
}

function MissingProject() {
  const navigate = useNavigate();
  return (
    <main className='flex min-h-0 flex-1 items-center justify-center px-8 text-center'>
      <div>
        <h1 className='text-xl font-medium'>Choose or create a tool.</h1>
        <Button className='mt-5' onClick={() => void navigate({ to: '/' })}>
          Go home
        </Button>
      </div>
    </main>
  );
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

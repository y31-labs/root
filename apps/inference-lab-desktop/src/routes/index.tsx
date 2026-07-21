import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@workspace/ui/components/ui/button';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { ArrowRight, ClipboardCheck, LoaderCircle, Plus, Workflow } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type { ProjectSummary } from '#/lib/types';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/')({ component: HomeRoute });

const examples = [
  'Turn emailed vendor requests into an intake queue with owners, evidence, and approval status.',
  'Track new employee onboarding across IT, finance, facilities, and each hiring manager.',
  'Review customer contract exceptions with risk, required evidence, and a clear decision trail.',
] as const;

function HomeRoute() {
  const api = useLocalApi();
  const navigate = useNavigate();
  const [brief, setBrief] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api
      .listProjects()
      .then((nextProjects) => {
        if (!cancelled) setProjects(nextProjects);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(errorMessage(nextError));
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const createTool = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instruction = brief.trim();
    if (instruction.length < 8 || pending) return;

    setPending(true);
    setError('');
    try {
      const project = await api.createProject(instruction);
      await navigate({ to: '/workspace', search: { projectId: project.id } });
    } catch (nextError) {
      setError(errorMessage(nextError));
      setPending(false);
    }
  };

  return (
    <main className='min-h-0 flex-1 overflow-y-auto bg-background text-foreground'>
      <section className='mx-auto flex w-full max-w-5xl flex-col px-8 pb-16 pt-20'>
        <div className='max-w-3xl'>
          <p className='mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground'>
            Operational software, inferred
          </p>
          <h1 className='text-balance text-4xl font-semibold tracking-[-0.04em] md:text-6xl'>
            Describe the work that should not live in a spreadsheet.
          </h1>
          <p className='mt-5 max-w-2xl text-base leading-7 text-muted-foreground'>
            y31 turns the process in your head, inbox, and files into a focused internal tool you
            can refine and keep.
          </p>
        </div>

        <form className='mt-10 max-w-3xl' onSubmit={createTool}>
          <div className='border-y border-border py-4 focus-within:border-foreground/30'>
            <label htmlFor='process-brief' className='sr-only'>
              Describe the process or problem
            </label>
            <Textarea
              id='process-brief'
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              className='min-h-32 resize-none border-0 bg-transparent px-0 text-base leading-7 shadow-none focus-visible:ring-0'
              placeholder='Every purchase request arrives by email. Operations copies it into a sheet, chases finance and security, then tries to remember who still needs to approve…'
              autoFocus
            />
            <div className='mt-3 flex items-center justify-between gap-4 border-t border-border pt-3'>
              <span className='text-xs text-muted-foreground'>Shift + Enter for a new line</span>
              <Button type='submit' disabled={brief.trim().length < 8 || pending}>
                {pending ? <LoaderCircle className='animate-spin' /> : <Plus />}
                {pending ? 'Opening workspace' : 'Create tool'}
              </Button>
            </div>
          </div>
          {error ? (
            <p className='mt-3 text-sm text-danger' role='alert'>
              {error}
            </p>
          ) : null}
        </form>

        <section className='mt-12 max-w-3xl'>
          <h2 className='text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground'>
            Start from a common process
          </h2>
          <div className='mt-3 divide-y border-y'>
            {examples.map((example) => (
              <button
                type='button'
                key={example}
                className='group flex w-full items-center gap-4 py-4 text-left text-sm leading-6 transition-colors hover:text-foreground'
                onClick={() => setBrief(example)}
              >
                <ClipboardCheck className='size-4 shrink-0 text-muted-foreground' />
                <span className='flex-1 text-muted-foreground group-hover:text-foreground'>
                  {example}
                </span>
                <ArrowRight className='size-4 shrink-0 text-muted-foreground' />
              </button>
            ))}
          </div>
        </section>

        {projects.length ? (
          <section className='mt-16'>
            <div>
              <h2 className='font-medium'>Your tools</h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                Local workspaces and their complete revision history.
              </p>
            </div>
            <div className='mt-4 divide-y border-y'>
              {projects.map((project) => (
                <Link
                  key={project.id}
                  to='/workspace'
                  search={{ projectId: project.id }}
                  className='grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'
                >
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <Workflow className='size-4 shrink-0 text-muted-foreground' />
                      <h3 className='truncate text-sm font-medium'>{project.title}</h3>
                    </div>
                    <p className='mt-1 truncate pl-6 text-sm text-muted-foreground'>
                      {project.description || project.brief}
                    </p>
                  </div>
                  <span className='pl-6 text-xs text-muted-foreground sm:pl-0'>
                    {project.versionCount
                      ? `${project.versionCount} version${project.versionCount === 1 ? '' : 's'}`
                      : 'Ready to generate'}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

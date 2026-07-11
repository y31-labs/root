import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type SubmitEvent, useCallback, useEffect, useState } from 'react';

import { APP_NAME } from '#/lib/app-config';
import { generateInterface } from '#/lib/generate-interface';
import type { GeneratedInterface } from '#/lib/interface-contract';
import { type WorkspaceMessage, WorkspaceShell } from '#/routes/index';

export const Route = createFileRoute('/workspace')({
  validateSearch: (search: Record<string, unknown>) => ({
    brief: typeof search.brief === 'string' ? search.brief : '',
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const navigate = useNavigate();
  const { brief: initialBrief } = Route.useSearch();
  const [brief, setBrief] = useState(initialBrief);
  const [chatMessages, setChatMessages] = useState<WorkspaceMessage[]>(
    initialBrief ? [{ label: 'You', message: initialBrief }] : [],
  );
  const [surface, setSurface] = useState<GeneratedInterface>();
  const [status, setStatus] = useState<'idle' | 'loading'>(initialBrief ? 'loading' : 'idle');
  const [error, setError] = useState<string>();

  const loadSurface = useCallback(async (nextBrief: string) => {
    setStatus('loading');
    setSurface(undefined);
    setError(undefined);

    try {
      setSurface(await generateInterface(nextBrief));
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Unable to generate an interface.',
      );
    } finally {
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    if (!initialBrief) return;

    setBrief(initialBrief);
    setChatMessages([{ label: 'You', message: initialBrief }]);
    void loadSurface(initialBrief);
  }, [initialBrief, loadSurface]);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formBrief = new FormData(event.currentTarget).get('brief');
    const nextBrief = typeof formBrief === 'string' ? formBrief.trim() : brief.trim();
    if (nextBrief.length < 8 || status === 'loading') return;

    setBrief(nextBrief);
    setChatMessages((current) =>
      current.some((message) => message.label === 'You' && message.message === nextBrief)
        ? current
        : [...current, { label: 'You', message: nextBrief }],
    );
    void loadSurface(nextBrief);
  };

  return (
    <main
      className='relative min-h-dvh overflow-hidden text-foreground'
      style={{ backgroundColor: '#000000' }}
    >
      <WorkspaceNavbar onBack={() => void navigate({ to: '/' })} />
      {initialBrief ? (
        <WorkspaceShell
          brief={brief}
          canGenerate={brief.trim().length >= 8 && status !== 'loading'}
          chatMessages={chatMessages}
          error={error}
          onBriefChange={setBrief}
          onSubmit={submit}
          status={status}
          surface={surface}
        />
      ) : (
        <EmptyWorkspace onBack={() => void navigate({ to: '/' })} />
      )}
    </main>
  );
}

function WorkspaceNavbar({ onBack }: { onBack: () => void }) {
  return (
    <header className='relative z-20 border-b border-border/60 bg-background/80 px-4 py-4 backdrop-blur-xl md:px-6'>
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-4'>
        <Link to='/' className='text-sm font-semibold tracking-tight text-foreground'>
          {APP_NAME}
        </Link>
        <div className='flex items-center gap-4 text-xs'>
          <span className='text-muted-foreground'>Workspace</span>
          <button
            type='button'
            onClick={onBack}
            className='text-muted-foreground transition-colors hover:text-foreground'
          >
            Back to landing
          </button>
        </div>
      </div>
    </header>
  );
}

function EmptyWorkspace({ onBack }: { onBack: () => void }) {
  return (
    <section className='mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center'>
      <p className='text-muted-foreground text-xs font-medium uppercase tracking-[0.18em]'>
        {APP_NAME} workspace
      </p>
      <h1 className='text-3xl font-semibold tracking-tight'>Start with a brief.</h1>
      <p className='text-muted-foreground max-w-md text-sm leading-6'>
        Describe what you want to work through and {APP_NAME} will build an application for it.
      </p>
      <button
        type='button'
        onClick={onBack}
        className='rounded-xl border border-border px-4 py-2 text-sm transition-colors hover:bg-muted/50'
      >
        Back to landing
      </button>
    </section>
  );
}

import { Button } from '@workspace/ui/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/ui/sheet';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import {
  ArrowUp,
  ChevronLeft,
  History,
  LoaderCircle,
  Redo2,
  Undo2,
  WandSparkles,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { GeneratedAppSandbox } from '#/components/generated-app-sandbox';
import { Shader14Background } from '#/components/shader14-background';
import { APP_NAME } from '#/lib/app-config';
import type { GeneratedInterface } from '#/lib/interface-contract';

export type WorkspaceMessage = {
  kind: 'initial' | 'adjustment';
  message: string;
};

type WorkspaceShellProps = {
  activeVersion: number;
  error?: string;
  messages: WorkspaceMessage[];
  onBack: () => void;
  onRedo: () => void;
  onRefine: (instruction: string) => void;
  onUndo: () => void;
  status: 'idle' | 'loading';
  surface?: GeneratedInterface;
  versionCount: number;
};

export function WorkspaceShell({
  activeVersion,
  error,
  messages,
  onBack,
  onRedo,
  onRefine,
  onUndo,
  status,
  surface,
  versionCount,
}: WorkspaceShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const isRefining = status === 'loading' && Boolean(surface);
  const canUndo = activeVersion > 0 && status !== 'loading';
  const canRedo = activeVersion < versionCount - 1 && status !== 'loading';

  useEffect(() => {
    const openDrawer = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;

      event.preventDefault();
      setDrawerOpen(true);
    };

    window.addEventListener('keydown', openDrawer);
    return () => window.removeEventListener('keydown', openDrawer);
  }, []);

  useEffect(() => {
    if (error && surface) setDrawerOpen(true);
  }, [error, surface]);

  const submitRefinement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instruction = draft.trim();
    if (instruction.length < 8 || status === 'loading' || !surface) return;

    onRefine(instruction);
    setDraft('');
    setDrawerOpen(false);
  };

  return (
    <section
      className='relative isolate h-dvh overflow-hidden bg-background text-foreground'
      data-testid='workspace-shell'
    >
      <WorkspaceChrome
        isRefining={isRefining}
        onBack={onBack}
        status={status}
        title={surface?.title}
      />

      <section
        className='absolute inset-0 overflow-hidden bg-background [view-transition-name:workspace-canvas]'
        data-testid='app-panel'
      >
        {surface ? (
          <div className='h-full' key={surface.html}>
            <GeneratedAppSandbox title={surface.title} html={surface.html} />
          </div>
        ) : (
          <BuildingStage brief={messages[0]?.message} error={error} status={status} />
        )}
        {isRefining ? <RefinementVeil /> : null}
      </section>

      {surface ? (
        <div className='fixed bottom-5 right-5 z-30 flex items-center gap-1 rounded-full border border-border/70 bg-background/80 p-1 shadow-2xl backdrop-blur-xl [view-transition-name:interface-chat] md:bottom-6 md:right-6'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='rounded-full text-muted-foreground'
            disabled={!canUndo}
            onClick={onUndo}
            aria-label='Undo last adjustment'
          >
            <Undo2 />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='rounded-full text-muted-foreground'
            disabled={!canRedo}
            onClick={onRedo}
            aria-label='Redo adjustment'
          >
            <Redo2 />
          </Button>
          <span aria-hidden='true' className='mx-1 h-5 w-px bg-border' />
          <Button
            type='button'
            className='y31-refine-button relative h-9 overflow-hidden rounded-full px-4 shadow-lg'
            onClick={() => setDrawerOpen(true)}
            aria-label='Refine this app'
            data-testid='workspace-prompt'
          >
            {isRefining ? <LoaderCircle className='animate-spin' /> : <WandSparkles />}
            {isRefining ? 'Adjusting' : 'Refine'}
            <span className='ml-1 hidden text-[0.68rem] opacity-55 sm:inline'>⌘K</span>
          </Button>
        </div>
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side='right'
          className='w-[min(100%,28rem)] gap-0 border-border/70 bg-background/88 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-[28rem]'
        >
          <SheetHeader className='border-b border-border/70 px-5 py-5 pr-14'>
            <div className='mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground'>
              <WandSparkles className='size-3.5' />
              Inference lab
            </div>
            <SheetTitle className='text-xl tracking-tight'>Refine this app</SheetTitle>
            <SheetDescription className='leading-5'>
              Describe one adjustment. The current app and its working behavior stay in context.
            </SheetDescription>
          </SheetHeader>

          <RevisionHistory messages={messages} />

          <SheetFooter className='border-t border-border/70 bg-background/60 p-4'>
            <form className='w-full' onSubmit={submitRefinement}>
              <div className='rounded-2xl border border-border bg-muted/25 p-2 transition-colors focus-within:border-foreground/30 focus-within:bg-background/80'>
                <label htmlFor='refinement' className='sr-only'>
                  What should change in this app?
                </label>
                <Textarea
                  id='refinement'
                  name='refinement'
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || event.shiftKey) return;

                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }}
                  className='min-h-28 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 shadow-none placeholder:text-muted-foreground focus-visible:ring-0'
                  placeholder='Make the ranking easier to scan and add a language filter…'
                  autoFocus
                />
                {error ? <p className='px-2 pb-2 text-sm text-danger'>{error}</p> : null}
                <div className='flex items-center justify-between gap-3 border-t border-border/70 px-1 pt-2'>
                  <span className='pl-1 text-xs text-muted-foreground'>
                    Shift + Enter for a new line
                  </span>
                  <Button
                    type='submit'
                    size='icon'
                    className='rounded-full'
                    disabled={draft.trim().length < 8 || status === 'loading' || !surface}
                    aria-label='Apply adjustment'
                  >
                    {status === 'loading' ? <LoaderCircle className='animate-spin' /> : <ArrowUp />}
                  </Button>
                </div>
              </div>
              <div className='mt-3 flex items-center justify-between px-1 text-xs text-muted-foreground'>
                <span>
                  Version {activeVersion + 1} of {versionCount}
                </span>
                <div className='flex gap-1'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='xs'
                    disabled={!canUndo}
                    onClick={onUndo}
                  >
                    <Undo2 /> Undo
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='xs'
                    disabled={!canRedo}
                    onClick={onRedo}
                  >
                    <Redo2 /> Redo
                  </Button>
                </div>
              </div>
            </form>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function WorkspaceChrome({
  isRefining,
  onBack,
  status,
  title,
}: {
  isRefining: boolean;
  onBack: () => void;
  status: 'idle' | 'loading';
  title?: string;
}) {
  return (
    <header className='y31-workspace-chrome pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4 md:p-5'>
      <Button
        type='button'
        variant='outline'
        className='pointer-events-auto rounded-full border-border/70 bg-background/75 px-3 shadow-lg backdrop-blur-xl'
        onClick={onBack}
        aria-label='Back to landing'
      >
        <ChevronLeft />
        <img src='/code-logo.svg' alt='' aria-hidden='true' className='size-3.5 invert' />
        <span>{APP_NAME}</span>
      </Button>

      <div className='min-w-0 rounded-full border border-border/70 bg-background/75 px-3 py-2 text-xs shadow-lg backdrop-blur-xl'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className={`size-1.5 shrink-0 rounded-full ${status === 'loading' ? 'y31-status-pulse bg-warning' : 'bg-success'}`}
          />
          <span className='max-w-[42vw] truncate text-muted-foreground'>
            {isRefining ? 'Applying adjustment' : (title ?? 'Generating app')}
          </span>
        </div>
      </div>
    </header>
  );
}

function RevisionHistory({ messages }: { messages: WorkspaceMessage[] }) {
  return (
    <div className='min-h-0 flex-1 overflow-y-auto px-5' data-testid='chat-thread'>
      <div className='flex items-center gap-2 border-b border-border/70 py-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground'>
        <History className='size-3.5' />
        Revision history
      </div>
      <ol className='divide-y divide-border/70'>
        {messages.map((message, index) => (
          <li className='grid grid-cols-[2rem_1fr] gap-3 py-4' key={`${message.kind}-${index}`}>
            <span className='font-mono text-xs text-muted-foreground'>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className='min-w-0'>
              <p className='mb-1 text-xs text-muted-foreground'>
                {message.kind === 'initial' ? 'Original brief' : 'Adjustment'}
              </p>
              <p className='text-sm leading-6 text-foreground'>{message.message}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BuildingStage({
  brief,
  error,
  status,
}: {
  brief?: string;
  error?: string;
  status: 'idle' | 'loading';
}) {
  return (
    <div className='relative flex h-full items-center justify-center overflow-hidden bg-background px-6'>
      <Shader14Background className='opacity-45' />
      <div aria-hidden='true' className='y31-prism-haze absolute inset-0' />
      <div aria-hidden='true' className='absolute inset-0 bg-background/55' />
      <div
        className='relative z-10 w-full max-w-2xl [view-transition-name:interface-chat]'
        role='status'
        aria-live='polite'
      >
        <div className='y31-thinking-instrument overflow-hidden rounded-[2rem] border border-foreground/15 bg-background/72 p-2 shadow-2xl backdrop-blur-2xl'>
          <div className='relative rounded-[1.5rem] border border-border/70 bg-background/78 px-5 py-5 md:px-7 md:py-6'>
            <div className='flex items-start gap-4'>
              <div className='y31-generation-mark mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-muted/50'>
                {status === 'loading' ? (
                  <LoaderCircle className='size-4 animate-spin' />
                ) : (
                  <WandSparkles className='size-4' />
                )}
              </div>
              <div className='min-w-0 flex-1 text-left'>
                <p className='mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground'>
                  Composing your interface
                </p>
                <h1 className='text-balance text-lg font-medium leading-7 tracking-[-0.02em] md:text-2xl md:leading-8'>
                  {brief ?? 'Your app will appear here.'}
                </h1>
              </div>
            </div>
            <div className='mt-6 flex items-center justify-between gap-4 border-t border-border/70 pt-4 text-xs text-muted-foreground'>
              <span className={error ? 'text-danger' : undefined}>
                {error ?? 'Modeling interactions · Connecting capabilities'}
              </span>
              {!error ? (
                <span className='y31-thinking-dots' aria-hidden='true'>
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RefinementVeil() {
  return (
    <div
      className='y31-refinement-veil pointer-events-none absolute inset-0 z-20 overflow-hidden'
      aria-hidden='true'
    >
      <div className='y31-refinement-scan absolute inset-y-0 w-1/3' />
    </div>
  );
}

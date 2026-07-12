import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@workspace/ui/components/ui/button';
import { ArrowLeft, WandSparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { type WorkspaceMessage, WorkspaceShell } from '#/components/workspace-shell';
import { APP_NAME } from '#/lib/app-config';
import { generateInterface } from '#/lib/generate-interface';
import type { GeneratedInterface } from '#/lib/interface-contract';
import { runViewTransition } from '#/lib/view-transition';

export const Route = createFileRoute('/workspace')({
  validateSearch: (search: Record<string, unknown>) => ({
    brief: typeof search.brief === 'string' ? search.brief : '',
  }),
  component: WorkspacePage,
});

const runWorkspaceTransition = (update: () => void) => {
  runViewTransition(() => flushSync(update));
};

function WorkspacePage() {
  const navigate = useNavigate();
  const { brief: initialBrief } = Route.useSearch();
  const startedBriefRef = useRef<string | undefined>(undefined);
  const [messages, setMessages] = useState<WorkspaceMessage[]>(
    initialBrief ? [{ kind: 'initial', message: initialBrief }] : [],
  );
  const [versions, setVersions] = useState<GeneratedInterface[]>([]);
  const [activeVersion, setActiveVersion] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading'>(initialBrief ? 'loading' : 'idle');
  const [error, setError] = useState<string>();
  const surface = versions[activeVersion];

  const loadInitialSurface = useCallback(async (brief: string) => {
    setStatus('loading');
    setError(undefined);
    setVersions([]);
    setActiveVersion(0);
    setMessages([{ kind: 'initial', message: brief }]);

    try {
      const generatedSurface = await generateInterface(brief);

      runWorkspaceTransition(() => {
        setVersions([generatedSurface]);
        setStatus('idle');
      });
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Unable to generate an interface.',
      );
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    if (!initialBrief || startedBriefRef.current === initialBrief) return;

    startedBriefRef.current = initialBrief;
    void loadInitialSurface(initialBrief);
  }, [initialBrief, loadInitialSurface]);

  const refineSurface = async (instruction: string) => {
    if (!surface || status === 'loading') return;

    const baseVersion = activeVersion;
    setMessages((current) => [
      ...current.slice(0, baseVersion + 1),
      { kind: 'adjustment', message: instruction },
    ]);
    setStatus('loading');
    setError(undefined);

    try {
      const generatedSurface = await generateInterface(instruction, surface);

      runWorkspaceTransition(() => {
        setVersions((current) => [...current.slice(0, baseVersion + 1), generatedSurface]);
        setActiveVersion(baseVersion + 1);
        setStatus('idle');
      });
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Unable to adjust the interface.',
      );
      setStatus('idle');
    }
  };

  const selectVersion = (nextVersion: number) => {
    if (status === 'loading' || !versions[nextVersion]) return;

    runWorkspaceTransition(() => setActiveVersion(nextVersion));
  };

  const backToLanding = () => void navigate({ to: '/' });

  if (!initialBrief) return <EmptyWorkspace onBack={backToLanding} />;

  return (
    <main className='h-dvh overflow-hidden bg-background text-foreground'>
      <WorkspaceShell
        activeVersion={activeVersion}
        error={error}
        messages={messages}
        onBack={backToLanding}
        onRedo={() => selectVersion(activeVersion + 1)}
        onRefine={(instruction) => void refineSurface(instruction)}
        onUndo={() => selectVersion(activeVersion - 1)}
        status={status}
        surface={surface}
        versionCount={versions.length}
      />
    </main>
  );
}

function EmptyWorkspace({ onBack }: { onBack: () => void }) {
  return (
    <main className='flex min-h-dvh items-center justify-center bg-background px-4 text-center text-foreground'>
      <section className='max-w-md'>
        <WandSparkles className='mx-auto mb-6 size-6 text-muted-foreground' />
        <p className='mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground'>
          {APP_NAME} workspace
        </p>
        <h1 className='text-3xl font-semibold tracking-tight'>Start with a brief.</h1>
        <p className='mt-3 text-sm leading-6 text-muted-foreground'>
          Describe the work on the landing page and the generated app will open here.
        </p>
        <Button type='button' variant='outline' className='mt-6' onClick={onBack}>
          <ArrowLeft /> Back to landing
        </Button>
      </section>
    </main>
  );
}

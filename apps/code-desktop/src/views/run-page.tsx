import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { listen } from '@tauri-apps/api/event';
import { GateTimeline } from '@workspace/code-workbench/gate-timeline';
import { RunStatusBadge } from '@workspace/code-workbench/run-status-badge';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/ui/card';
import { FolderOpen, Square } from 'lucide-react';
import { useEffect, useState } from 'react';

import { localApi, type LocalRunRecord } from '#/lib/local-api';
import { desktopQueries } from '#/lib/queries';
import type { Id } from '#convex/_generated/dataModel';

export function RunPage() {
  const { runId } = useParams({ from: '/runs/$runId' });
  const { data } = useQuery(desktopQueries.run(runId as Id<'runs'>));
  const [localRun, setLocalRun] = useState<LocalRunRecord | null>(null);
  const [patch, setPatch] = useState('');

  const refresh = () =>
    localApi.getRun(runId).then(async (run) => {
      setLocalRun(run);
      if (run?.artifacts.patchPath) {
        setPatch(await localApi.readArtifact(run.artifacts.patchPath));
      }
    });

  useEffect(() => {
    void refresh();
    const unlisten = listen('local-run-event', () => void refresh());
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [runId]);

  if (!data) return <div className='p-6'>Loading run...</div>;
  const terminal = ['verified', 'failed', 'cancelled', 'needs_input'].includes(data.run.status);

  return (
    <div className='min-w-0 space-y-6 p-6'>
      <header className='flex items-start justify-between gap-4'>
        <div>
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-semibold'>Run {runId.slice(-8)}</h1>
            <RunStatusBadge status={data.run.status} />
          </div>
          <p className='text-muted-foreground text-sm'>
            {data.run.baseCommitSha.slice(0, 12)} · {data.run.codexVersion}
          </p>
        </div>
        {!terminal ? (
          <Button variant='destructive' onClick={() => localApi.cancelRun(runId)}>
            <Square data-icon='inline-start' />Cancel
          </Button>
        ) : null}
      </header>

      <div className='grid min-w-0 gap-6 xl:grid-cols-2'>
        <Card className='min-w-0'>
          <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
          <CardContent>
            <GateTimeline
              summary={data.run.verificationSummary}
              items={data.gateResults.map((gate) => ({
                id: gate._id,
                kind: gate.kind,
                status: gate.status,
                attempt: gate.attempt,
                durationMs: gate.durationMs,
              }))}
            />
          </CardContent>
        </Card>
        <Card className='min-w-0'>
          <CardHeader>
            <CardTitle>Local evidence</CardTitle>
            <CardDescription>Artifacts stay on this Mac.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {[...(localRun?.artifacts.logs ?? []), ...(localRun?.artifacts.tracePaths ?? [])].map(
              (path) => (
                <Button
                  key={path}
                  variant='outline'
                  className='min-w-0 w-full justify-start'
                  onClick={() => localApi.revealArtifact(path)}
                >
                  <FolderOpen data-icon='inline-start' />
                  <span className='truncate'>{path.split('/').pop()}</span>
                </Button>
              ),
            )}
          </CardContent>
        </Card>
      </div>

      <Card className='min-w-0'>
        <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
        <CardContent className='space-y-2'>
          {localRun?.events.map((event) => (
            <div key={event.id} className='border-l-2 pl-3 text-sm'>
              <p>{event.message}</p>
              <p className='text-muted-foreground text-xs'>{event.kind}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {patch ? (
        <Card className='min-w-0'>
          <CardHeader><CardTitle>Patch</CardTitle></CardHeader>
          <CardContent>
            <pre className='bg-muted max-h-[40rem] overflow-auto rounded-lg p-4 text-xs'>{patch}</pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

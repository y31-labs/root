import { listen } from '@tauri-apps/api/event';
import { useMutation } from 'convex/react';
import { useEffect } from 'react';

import { api } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';
import { gateMutationArgs, type LocalRunEvent } from '#/lib/run-events';

export function useRunSync() {
  const transition = useMutation(api.runs.transition);
  const recordGate = useMutation(api.runs.recordGate);
  const complete = useMutation(api.runs.complete);

  useEffect(() => {
    const unlisten = listen<LocalRunEvent>('local-run-sync', async ({ payload }) => {
      const runId = payload.runId as Id<'runs'>;
      if (payload.type === 'transition') {
        await transition({ id: runId, status: payload.status, attempt: payload.attempt });
      } else if (payload.type === 'gate') {
        await recordGate({
          runId,
          ...gateMutationArgs(payload),
        });
      } else {
        await complete({
          id: runId,
          status: payload.status,
          changedFileCount: payload.changedFileCount,
          hasLocalPatch: payload.hasLocalPatch,
          terminalReason: payload.terminalReason,
        });
      }
    });
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [complete, recordGate, transition]);
}

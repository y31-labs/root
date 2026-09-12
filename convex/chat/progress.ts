import type { ChatIntegration } from '#convex/chat/types';
import { pause } from '#convex/lib/pause';

export const startReplyProgress = (integration: ChatIntegration, signal: AbortSignal) => {
  const controller = new AbortController();
  const progressSignal = AbortSignal.any([signal, controller.signal]);
  let text = '';
  let lastDraft = '';
  const loop = async (interval: number, send: () => Promise<void>) => {
    while (!progressSignal.aborted) {
      try {
        await send();
      } catch {
        /* Preview failures must not discard a response. */
      }
      try {
        await pause(interval, progressSignal);
      } catch {
        break;
      }
    }
  };
  const { typing, draft } = integration;
  const jobs: Promise<void>[] = [];
  if (typing) jobs.push(loop(typing.intervalMs, () => typing.send(progressSignal)));
  if (draft)
    jobs.push(
      loop(draft.intervalMs, async () => {
        const preview = text;
        if (preview && preview !== lastDraft) {
          await draft.send(preview, progressSignal);
          lastDraft = preview;
        }
      }),
    );
  return {
    update: (next: string) => {
      text = next;
    },
    stop: async () => {
      controller.abort();
      await Promise.all(jobs);
    },
  };
};

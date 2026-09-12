import { afterEach, expect, it, vi } from 'vitest';

import { startReplyProgress } from '#convex/chat/progress';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('refreshes typing, throttles drafts, and stops all progress when complete', async () => {
  vi.useFakeTimers();
  const integration = {
    typing: { intervalMs: 4000, send: vi.fn().mockResolvedValue(undefined) },
    draft: { intervalMs: 1000, send: vi.fn().mockResolvedValue(undefined) },
    sendText: vi.fn(),
    downloadImage: vi.fn(),
  };
  const progress = startReplyProgress(integration, new AbortController().signal);
  progress.update('H');
  progress.update('Hello');
  await vi.advanceTimersByTimeAsync(1000);
  expect(integration.draft.send).toHaveBeenCalledTimes(1);
  expect(integration.draft.send.mock.calls[0]![0]).toBe('Hello');
  await vi.advanceTimersByTimeAsync(3000);
  expect(integration.typing.send).toHaveBeenCalledTimes(2);
  expect(integration.draft.send).toHaveBeenCalledTimes(1);
  await progress.stop();
  await vi.advanceTimersByTimeAsync(5000);
  expect(integration.typing.send).toHaveBeenCalledTimes(2);
});

it('uses the adapter preview intervals and tolerates preview failures', async () => {
  vi.useFakeTimers();
  const typing = vi.fn().mockRejectedValue(new Error('Preview unavailable'));
  const draft = vi.fn().mockResolvedValue(undefined);
  const progress = startReplyProgress(
    {
      sendText: vi.fn(),
      typing: { intervalMs: 2000, send: typing },
      draft: { intervalMs: 500, send: draft },
    },
    new AbortController().signal,
  );
  progress.update('Hello');
  await vi.advanceTimersByTimeAsync(500);
  expect(draft).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1500);
  expect(typing).toHaveBeenCalledTimes(2);
  await progress.stop();
  await vi.advanceTimersByTimeAsync(2000);
  expect(typing).toHaveBeenCalledTimes(2);
});

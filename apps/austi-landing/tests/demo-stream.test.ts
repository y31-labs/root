import { afterEach, expect, it, vi } from 'vitest';

import { demoStreamUrl, streamDemoText, type DemoRequest } from '../src/lib/demo-stream';

const request: DemoRequest = {
  token: 'a'.repeat(64),
  history: [{ role: 'user', content: 'A leak' }],
  verificationToken: 'proof',
};
const event = (value: object) => new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
const content = (delta: string) => ({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'reply', delta });
const finished = { type: 'RUN_FINISHED', threadId: 'demo', runId: 'run' };

afterEach(() => vi.unstubAllGlobals());

it('preserves backend validation errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ error: 'Message too long' }, { status: 400 })),
  );
  await expect(
    streamDemoText(
      'https://demo.convex.site/demo/stream',
      request,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toMatchObject({ data: 'Message too long' });
});

it('resolves hosted and explicit local HTTP action URLs', () => {
  expect(demoStreamUrl(undefined, 'https://demo.convex.cloud')).toBe(
    'https://demo.convex.site/demo/stream',
  );
  expect(demoStreamUrl('http://127.0.0.1:3211', 'http://127.0.0.1:3210')).toBe(
    'http://127.0.0.1:3211/demo/stream',
  );
  expect(demoStreamUrl(undefined, 'http://127.0.0.1:3210')).toBeNull();
  expect(demoStreamUrl()).toBeNull();
});

it('delivers UTF-8 text split across network chunks before completion', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (value) => {
      controller = value;
    },
  });
  const fetcher = vi.fn().mockResolvedValue(new Response(body));
  vi.stubGlobal('fetch', fetcher);
  const previews: string[] = [];
  let firstChunk!: () => void;
  const first = new Promise<void>((resolve) => {
    firstChunk = resolve;
  });
  const pending = streamDemoText(
    'https://demo.convex.site/demo/stream',
    request,
    new AbortController().signal,
    (text) => {
      previews.push(text);
      firstChunk();
    },
  );
  const bytes = event(content('€250'));
  const split = bytes.indexOf(0xe2) + 1;
  controller.enqueue(bytes.slice(0, split));
  controller.enqueue(bytes.slice(split));
  await first;
  expect(previews).toEqual(['€250']);
  controller.enqueue(event(content(' needs approval.')));
  controller.enqueue(event(finished));
  controller.close();
  expect(await pending).toBe('€250 needs approval.');
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(request);
});

it.each(['disconnect', 'error', 'empty'])(
  'rejects %s instead of treating a partial reply as complete',
  async (failure) => {
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        if (failure !== 'empty') controller.enqueue(event(content('Partial reply')));
        if (failure === 'error')
          controller.enqueue(event({ type: 'RUN_ERROR', error: { message: 'Failed' } }));
        if (failure === 'empty') controller.enqueue(event(finished));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(
      streamDemoText(
        'https://demo.convex.site/demo/stream',
        request,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('interrupted');
  },
);

it('preserves a safe server verification error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: 'Please complete the verification and try again.' },
          { status: 400 },
        ),
      ),
  );
  await expect(
    streamDemoText(
      'https://demo.convex.site/demo/stream',
      request,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toMatchObject({ data: 'Please complete the verification and try again.' });
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ChatGenerationError, classifyGenerationError } from '#convex/chat/errors';
import { generateReply } from '#convex/chat/generation';
import { CHAT_MODEL } from '#convex/chat/policy';

const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetcher.mockReset();
});

const streamResponse = (deltas: string[]) =>
  new Response(
    [
      ...deltas.map((content) => ({
        id: 'completion-1',
        object: 'chat.completion.chunk',
        model: CHAT_MODEL,
        choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
      })),
      {
        id: 'completion-1',
        object: 'chat.completion.chunk',
        model: CHAT_MODEL,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
      .join('') + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );

it('streams through the real TanStack Gateway adapter with inline images and an output limit', async () => {
  fetcher.mockResolvedValueOnce(streamResponse(['Hello', ' there']));
  const onText = vi.fn();
  expect(
    await generateReply({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What is this?' },
            { type: 'image', source: { type: 'data', value: 'aW1hZ2U=', mimeType: 'image/png' } },
          ],
        },
      ],
      signal: new AbortController().signal,
      onText: onText,
    }),
  ).toBe('Hello there');
  expect(onText.mock.calls.map(([text]) => text)).toEqual(['Hello', 'Hello there']);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, request] = fetcher.mock.calls[0]!;
  expect(url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
  expect(JSON.parse(request!.body as string)).toMatchObject({
    model: CHAT_MODEL,
    max_tokens: 4096,
    stream: true,
    messages: [
      { role: 'system', content: expect.any(String) },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
        ],
      },
    ],
  });
});

it.each([
  [401, 'invalid_api_key', 'Invalid API key', 'access_denied'],
  [403, 'forbidden', 'Free tier users must upgrade to paid credits', 'access_denied'],
  [403, 'forbidden', 'Model disabled by policy', 'access_denied'],
  [403, '500', 'Forbidden', 'access_denied'],
  [429, 'rate_limit_exceeded', 'Rate limit exceeded', 'failed'],
  [500, '401', 'Internal server error', 'failed'],
])(
  'classifies HTTP %i (%s, %s) without leaking payloads or retrying',
  async (status, code, message, expectedCode) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetcher.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code,
            type: code,
            param: null,
            message: `${message}. secret-payload`,
          },
        },
        { status },
      ),
    );
    const error = await generateReply({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: new AbortController().signal,
      onText: vi.fn(),
    }).catch((error) => error);
    expect(error).toMatchObject({ code: expectedCode, statusCode: status });
    expect(error.message).toBe(
      expectedCode === 'access_denied' ? 'AI Gateway access denied' : 'Response generation failed',
    );
    expect(JSON.stringify(error)).not.toContain('secret-payload');
    expect(error.cause).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('does not turn empty output into a successful reply', async () => {
  fetcher.mockResolvedValueOnce(streamResponse([]));
  await expect(
    generateReply({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: new AbortController().signal,
      onText: vi.fn(),
    }),
  ).rejects.toMatchObject({ code: 'failed' });
});

it('propagates cancellation to the Gateway request', async () => {
  const controller = new AbortController();
  fetcher.mockImplementationOnce(async (_url, request) => {
    controller.abort();
    expect(request!.signal!.aborted).toBe(true);
    throw new DOMException('Request cancelled', 'AbortError');
  });
  await expect(
    generateReply({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: controller.signal,
      onText: vi.fn(),
    }),
  ).rejects.toMatchObject({ code: 'aborted' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not request generation when already cancelled or missing credentials', async () => {
  await expect(
    generateReply({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: AbortSignal.abort(),
      onText: vi.fn(),
    }),
  ).rejects.toMatchObject({ code: 'aborted' });
  vi.stubEnv('AI_GATEWAY_API_KEY', '');
  await expect(
    generateReply({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: new AbortController().signal,
      onText: vi.fn(),
    }),
  ).rejects.toMatchObject({ code: 'missing_api_key' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['401', '403', 'forbidden'])('does not infer an HTTP status from code %s', (code) => {
  expect(classifyGenerationError(undefined, code)).toMatchObject({
    code: 'failed',
    statusCode: undefined,
    message: 'Response generation failed',
  });
});

it('prioritizes the adapter cancellation code over HTTP status', () => {
  expect(classifyGenerationError(403, 'aborted')).toMatchObject({
    code: 'aborted',
    statusCode: 403,
  });
});

it('sanitizes network failures without inferring a status or retrying', async () => {
  fetcher.mockRejectedValueOnce(new TypeError('secret network details'));
  const error = await generateReply({
    messages: [{ role: 'user', content: 'Hi' }],
    signal: new AbortController().signal,
    onText: vi.fn(),
  }).catch((error) => error);
  expect(error).toMatchObject({
    code: 'failed',
    statusCode: undefined,
    message: 'Response generation failed',
  });
  expect(error.cause).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('preserves an existing generation error thrown during streaming', async () => {
  fetcher.mockResolvedValueOnce(streamResponse(['Hello']));
  const error = new ChatGenerationError('access_denied', 403);
  await expect(
    generateReply({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: new AbortController().signal,
      onText: () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
});

it('prioritizes an aborted signal over an existing generation error', async () => {
  fetcher.mockResolvedValueOnce(streamResponse(['Hello']));
  const controller = new AbortController();
  await expect(
    generateReply({
      messages: [{ role: 'user', content: 'Hi' }],
      signal: controller.signal,
      onText: () => {
        controller.abort();
        throw new ChatGenerationError('access_denied', 403);
      },
    }),
  ).rejects.toMatchObject({ code: 'aborted' });
});

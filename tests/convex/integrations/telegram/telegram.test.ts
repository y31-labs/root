import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { Doc } from '#convex/_generated/dataModel';
import { getChatIntegration } from '#convex/chat/integration';
import { MAX_IMAGE_BYTES } from '#convex/chat/policy';
import { createTelegramClient } from '#convex/integrations/telegram/client';
import { TelegramError } from '#convex/integrations/telegram/errors';
import { downloadTelegramImage, readImage } from '#convex/integrations/telegram/images';
import { splitTelegramText } from '#convex/integrations/telegram/text';
import type {
  TelegramFile,
  TelegramMessage,
  TelegramUpdate,
} from '#convex/integrations/telegram/types';
import { parseTelegramUpdate } from '#convex/integrations/telegram/updates';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const update = (fields: Partial<TelegramMessage> = {}): TelegramUpdate => ({
  update_id: 1,
  message: {
    message_id: 2,
    chat: { id: 123, type: 'private' },
    from: { id: 123, is_bot: false },
    ...fields,
  },
});

describe('Telegram input', () => {
  it('normalizes text and optional file metadata', () => {
    expect(parseTelegramUpdate(update({ text: 'Hello' }), '456')).toEqual({
      provider: 'telegram',
      conversationScope: 'personal',
      integrationAccountId: '456',
      externalConversationId: '123',
      externalAccountId: '123',
      externalEventId: '1',
      externalMessageId: '2',
      parts: [{ type: 'text', text: 'Hello' }],
    });
    expect(parseTelegramUpdate(update({ document: { file_id: 'file' } }), '456')).toMatchObject({
      unsupported: true,
    });
    expect(
      parseTelegramUpdate(
        update({
          document: { file_id: 'file', mime_type: 'image/webp', file_size: 42 },
        }),
        '456',
      ),
    ).toMatchObject({ image: { externalFileId: 'file', size: 42 } });
  });
  it('normalizes captions and chooses the largest photo', () => {
    const result = parseTelegramUpdate(
      update({
        caption: 'What is this?',
        photo: [
          { file_id: 'small', width: 10, height: 10 },
          { file_id: 'large', width: 100, height: 100 },
        ],
      }),
      '456',
    );
    expect(result!.image!.externalFileId).toBe('large');
    expect(result!.parts).toEqual([{ type: 'text', text: 'What is this?' }]);
    expect(result!.externalConversationId).toBe('123');
  });
  it('accepts image documents and explains unsupported attachments', () => {
    expect(
      parseTelegramUpdate(update({ document: { file_id: 'png', mime_type: 'image/png' } }), '456')!
        .image,
    ).toBeDefined();
    expect(parseTelegramUpdate(update({ voice: { file_id: 'voice' } }), '456')!.unsupported).toBe(
      true,
    );
    expect(
      parseTelegramUpdate(
        update({ document: { file_id: 'pdf', mime_type: 'application/pdf' } }),
        '456',
      )!.unsupported,
    ).toBe(true);
  });
  it('retains album IDs for photos, image documents, and unsupported album items', () => {
    for (const attachment of [
      { photo: [{ file_id: 'photo', width: 100, height: 100 }] },
      { document: { file_id: 'png', mime_type: 'image/png' } },
      { video: { file_id: 'video' } },
    ]) {
      expect(
        parseTelegramUpdate(update({ ...attachment, media_group_id: 'album-1' }), '456'),
      ).toMatchObject({ externalMediaGroupId: 'album-1' });
    }
    expect(parseTelegramUpdate(update({ text: 'Hello' }), '456')).not.toHaveProperty(
      'externalMediaGroupId',
    );
  });
  it('ignores groups, edited messages and service updates', () => {
    expect(
      parseTelegramUpdate(update({ chat: { id: 123, type: 'group' }, text: 'Hello' }), '456'),
    ).toBeNull();
    expect(
      parseTelegramUpdate({ update_id: 1, edited_message: update().message }, '456'),
    ).toBeNull();
    expect(parseTelegramUpdate(update({ new_chat_members: [] }), '456')).toBeNull();
    expect(parseTelegramUpdate(update({ from: undefined, text: 'Hello' }), '456')).toBeNull();
    expect(
      parseTelegramUpdate(update({ from: { id: 123, is_bot: true }, text: 'Hello' }), '456'),
    ).toBeNull();
    expect(parseTelegramUpdate({ update_id: 1 }, '456')).toBeNull();
    expect(() =>
      parseTelegramUpdate(update({ from: { id: 999, is_bot: false }, text: 'Hello' }), '456'),
    ).toThrow();
  });
});

it('validates image signatures and size, including missing Content-Length', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  expect((await readImage(new Response(png))).type).toBe('image/png');
  await expect(readImage(new Response('<html>not an image</html>'))).rejects.toThrow(
    'Unsupported image',
  );
  await expect(
    readImage(new Response(png, { headers: { 'Content-Length': String(MAX_IMAGE_BYTES + 1) } })),
  ).rejects.toThrow('10 MB');
  await expect(readImage(new Response(new Uint8Array(MAX_IMAGE_BYTES + 1)))).rejects.toThrow(
    '10 MB',
  );
});

it('splits long text without breaking emoji or losing content', () => {
  const text = 'a'.repeat(4095) + '🌍' + 'b'.repeat(5000);
  const chunks = splitTelegramText(text);
  expect(chunks.every((chunk) => chunk.length <= 4096 && chunk.isWellFormed())).toBe(true);
  expect(chunks.join('')).toBe(text);
});

it('delivers partial and completed Markdown through the native rich message API', async () => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '456:fake_token');
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ ok: true, result: true }))
    .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 99 } }));
  vi.stubGlobal('fetch', fetcher);
  const integration = getChatIntegration(
    {
      provider: 'telegram',
      integrationAccountId: '456',
      externalConversationId: '123',
    } as Doc<'chatChannels'>,
    { externalMessageId: '2' } as Doc<'messages'>,
  );
  const signal = new AbortController().signal;
  const partial = '# Answer\n\n**Hello 🌍';
  const complete = `${partial}**\n\n- First item\n\n\`\`\`ts\nconst value = 1;\n\`\`\``;
  await integration.draft!.send(partial, signal);
  expect(await integration.sendText(complete, signal)).toBe('99');
  expect(fetcher.mock.calls.map(([url, init]) => [url, JSON.parse(init!.body as string)])).toEqual([
    [
      'https://api.telegram.org/bot456:fake_token/sendRichMessageDraft',
      { chat_id: 123, draft_id: 2, rich_message: { markdown: partial } },
    ],
    [
      'https://api.telegram.org/bot456:fake_token/sendRichMessage',
      { chat_id: 123, rich_message: { markdown: complete } },
    ],
  ]);
});

it('respects retry_after and never retries ambiguous sends or exposes tokens', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { ok: false, error_code: 429, parameters: { retry_after: 2 } },
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 1 } }));
  const client = createTelegramClient('456:secret_token', fetcher);
  const body = { chat_id: 123, rich_message: { markdown: 'Hello' } };
  const pending = client.call('sendRichMessage', body, new AbortController().signal);
  expectTypeOf(pending).toEqualTypeOf<Promise<TelegramMessage>>();
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toEqual({ message_id: 1 });
  fetcher
    .mockReset()
    .mockRejectedValue(new Error('https://api.telegram.org/bot456:secret_token/sendMessage'));
  const failure = await client
    .call('sendRichMessage', body, new AbortController().signal)
    .catch((error) => error);
  expect(failure).toBeInstanceOf(TelegramError);
  expect(failure.uncertain).toBe(true);
  expect(failure.message).not.toContain('secret_token');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([400, 403, 429, 500])(
  'classifies API rejection %i without retrying or exposing payloads',
  async (code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          ok: false,
          error_code: code,
          description: 'Provider details containing secret_token',
        },
        { status: code },
      ),
    );
    const client = createTelegramClient('456:secret_token', fetcher);
    await expect(
      client.call(
        'sendRichMessage',
        {
          chat_id: 123,
          rich_message: { markdown: 'Hello' },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      message: `Telegram request failed (${code})`,
      uncertain: code >= 500,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('treats an unreadable response as uncertain without retrying', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('secret_token', { status: 502 }));
  const client = createTelegramClient('456:secret_token', fetcher);
  await expect(
    client.call(
      'sendRichMessage',
      {
        chat_id: 123,
        rich_message: { markdown: 'Hello' },
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    message: 'Telegram request failed',
    uncertain: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('bounds rate-limit retries and stops waiting when cancelled', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json(
      {
        ok: false,
        error_code: 429,
        description: 'Too many requests',
        parameters: { retry_after: 2 },
      },
      { status: 429 },
    ),
  );
  const client = createTelegramClient('456:token', fetcher);
  const pending = client.call(
    'sendChatAction',
    { chat_id: 123, action: 'typing' },
    new AbortController().signal,
  );
  const rejected = expect(pending).rejects.toMatchObject({ uncertain: false });
  await vi.advanceTimersByTimeAsync(6000);
  await rejected;
  expect(fetcher).toHaveBeenCalledTimes(4);

  fetcher.mockClear();
  const controller = new AbortController();
  const cancelled = client.call(
    'sendChatAction',
    { chat_id: 123, action: 'typing' },
    controller.signal,
  );
  const aborted = expect(cancelled).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await aborted;
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('passes cancellation and request deadlines to the transport', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
      }),
  );
  const client = createTelegramClient('456:token', fetcher);
  const controller = new AbortController();
  const cancelled = client.call(
    'sendChatAction',
    { chat_id: 123, action: 'typing' },
    controller.signal,
  );
  const aborted = expect(cancelled).rejects.toBeInstanceOf(TelegramError);
  controller.abort();
  await aborted;

  // Stub the platform timer so this verifies wiring without waiting for real time.
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  try {
    const pending = client.call(
      'sendChatAction',
      { chat_id: 123, action: 'typing' },
      new AbortController().signal,
    );
    const expired = expect(pending).rejects.toBeInstanceOf(TelegramError);
    expect(timeout).toHaveBeenCalledWith(15_000);
    deadline.abort();
    await expired;
  } finally {
    timeout.mockRestore();
  }
});

it('downloads images using typed file metadata and preserves the download policy', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const file: TelegramFile = { file_path: 'photos/my image.png', file_size: png.length };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ ok: true, result: file }))
    .mockResolvedValueOnce(new Response(png));
  const client = createTelegramClient('456:token', fetcher);
  const image = await downloadTelegramImage(
    client,
    { externalFileId: 'photo' },
    new AbortController().signal,
  );
  expect(image.type).toBe('image/png');
  expect(fetcher.mock.calls[0]![0]).toBe('https://api.telegram.org/bot456:token/getFile');
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ file_id: 'photo' });
  expect(fetcher.mock.calls[1]).toEqual([
    'https://api.telegram.org/file/bot456:token/photos/my image.png',
    { signal: expect.any(AbortSignal), redirect: 'error' },
  ]);
});

it('rejects oversized metadata before downloading and handles an unavailable file path', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        ok: true,
        result: { file_path: 'photo.png', file_size: MAX_IMAGE_BYTES + 1 },
      }),
    )
    .mockResolvedValueOnce(Response.json({ ok: true, result: {} }));
  const client = createTelegramClient('456:token', fetcher);
  const signal = new AbortController().signal;
  await expect(
    downloadTelegramImage(client, { externalFileId: 'photo', size: MAX_IMAGE_BYTES + 1 }, signal),
  ).rejects.toThrow('10 MB');
  expect(fetcher).not.toHaveBeenCalled();
  await expect(downloadTelegramImage(client, { externalFileId: 'photo' }, signal)).rejects.toThrow(
    '10 MB',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(downloadTelegramImage(client, { externalFileId: 'photo' }, signal)).rejects.toThrow(
    'path is unavailable',
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('keeps download failures free of token-bearing URLs', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ ok: true, result: { file_path: 'photo.png' } }))
    .mockRejectedValueOnce(
      new Error('https://api.telegram.org/file/bot456:secret_token/photo.png'),
    );
  const client = createTelegramClient('456:secret_token', fetcher);
  await expect(
    downloadTelegramImage(client, { externalFileId: 'photo' }, new AbortController().signal),
  ).rejects.toThrow('Image download failed');
});

import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { internal } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';
import { deliverChatResponse } from '#convex/chat/delivery';
import { ChatGenerationError, ImageInputError } from '#convex/chat/errors';
import { buildModelMessages, generateReply } from '#convex/chat/generation';
import { getChatIntegration } from '#convex/chat/integration';
import { CHAT_MODEL, MEDIA_GROUP_WAIT_MS } from '#convex/chat/policy';
import { prepareChatResponse } from '#convex/chat/response';
import { TelegramError } from '#convex/integrations/telegram/errors';
import { splitTelegramText } from '#convex/integrations/telegram/text';
import { parseTelegramUpdate } from '#convex/integrations/telegram/updates';
import schema from '#convex/schema';

vi.mock('#convex/chat/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#convex/chat/generation')>()),
  generateReply: vi.fn(),
}));
vi.mock('#convex/chat/integration', () => ({ getChatIntegration: vi.fn() }));
const modules = import.meta.glob('../../../convex/**/*.ts');
const integration = {
  splitText: splitTelegramText,
  typing: { intervalMs: 4000, send: vi.fn().mockResolvedValue(undefined) },
  draft: { intervalMs: 1000, send: vi.fn().mockResolvedValue(undefined) },
  sendText: vi.fn().mockResolvedValue('reply-1'),
  downloadImage: vi
    .fn()
    .mockResolvedValue(
      new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
    ),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getChatIntegration).mockReturnValue(integration);
  vi.mocked(generateReply).mockImplementation(async ({ onText }) => {
    onText?.('Hello');
    return 'Hello';
  });
  integration.sendText.mockResolvedValue('reply-1');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const receive = async (t: TestConvex<typeof schema>, image = false) => {
  const id = await t.mutation(internal.chats.receive, {
    message: {
      provider: 'telegram',
      conversationScope: 'personal',
      integrationAccountId: '456',
      externalAccountId: '123',
      externalConversationId: '123',
      externalEventId: '1',
      externalMessageId: '1',
      parts: [{ type: 'text', text: 'What is this?' }],
      ...(image ? { image: { externalFileId: 'image-file' } } : {}),
    },
  });
  return (await t.run((ctx) => ctx.db.get(id)))!;
};

const receiveAlbum = async (t: TestConvex<typeof schema>, count: number) => {
  const ids: Id<'messages'>[] = [];
  for (let index = count; index > 0; index--) {
    const message = parseTelegramUpdate(
      {
        update_id: index,
        message: {
          message_id: index,
          media_group_id: 'album',
          chat: { id: 123, type: 'private' },
          from: { id: 123, is_bot: false },
          ...(index === 1 ? { caption: 'Compare all these images' } : {}),
          photo: [{ file_id: `image-${index}`, width: 100, height: 100 }],
        },
      },
      '456',
    )!;
    ids.push(await t.mutation(internal.chats.receive, { message }));
  }
  expect(new Set(ids).size).toBe(1);
  return (await t.run((ctx) => ctx.db.get(ids[0]!)))!;
};

it('schedules one album response with every image, even when there are more than four', async () => {
  const t = convexTest(schema, modules);
  const message = await receiveAlbum(t, 10);
  await vi.advanceTimersByTimeAsync(MEDIA_GROUP_WAIT_MS - 1);
  expect(generateReply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
  expect(integration.downloadImage.mock.calls.map(([source]) => source.externalFileId)).toEqual(
    Array.from({ length: 10 }, (_, index) => `image-${index + 1}`),
  );
  expect(generateReply).toHaveBeenCalledTimes(1);
  const input = vi.mocked(generateReply).mock.calls[0]![0].messages;
  expect(input).toHaveLength(1);
  expect(input[0]!.content).toHaveLength(11);
  expect(input[0]!.content[0]).toEqual({ type: 'text', content: 'Compare all these images' });
  expect(integration.sendText).toHaveBeenCalledTimes(1);
  const stored = (await t.run((ctx) => ctx.db.get(message._id)))!;
  expect(stored.status).toBe('completed');
  expect(stored.parts.filter((part) => part.type === 'image')).toHaveLength(10);
  expect(stored.mediaGroupItems?.every((item) => !item.image)).toBe(true);
  expect((await receiveAlbum(t, 10))._id).toBe(message._id);
  expect(await t.run((ctx) => ctx.db.query('messages').collect())).toHaveLength(2);
});

it('reschedules an album when another item arrives and ignores retries during the wait', async () => {
  const t = convexTest(schema, modules);
  const message = await receiveAlbum(t, 1);
  await vi.advanceTimersByTimeAsync(MEDIA_GROUP_WAIT_MS - 500);
  await receiveAlbum(t, 2);
  await vi.advanceTimersByTimeAsync(500);
  await t.finishInProgressScheduledFunctions();
  expect(generateReply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(MEDIA_GROUP_WAIT_MS - 501);
  await receiveAlbum(t, 2);
  expect(generateReply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
  expect(generateReply).toHaveBeenCalledTimes(1);
  expect(integration.downloadImage).toHaveBeenCalledTimes(2);
  expect(integration.sendText).toHaveBeenCalledTimes(1);
  expect((await t.run((ctx) => ctx.db.get(message._id)))!.status).toBe('completed');
});

it('cleans up earlier downloads if a later album image fails', async () => {
  const t = convexTest(schema, modules);
  const message = await receiveAlbum(t, 2);
  integration.downloadImage
    .mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }))
    .mockRejectedValueOnce(new ImageInputError('too_large'));
  vi.setSystemTime(message.mediaGroupReadyAt!);
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(generateReply).not.toHaveBeenCalled();
  expect(integration.sendText).toHaveBeenCalledTimes(1);
  expect((await t.run((ctx) => ctx.db.get(message._id)))!.status).toBe('failed');
  expect(await t.run((ctx) => ctx.db.system.query('_storage').collect())).toHaveLength(0);
});

it('attempts every image cleanup and preserves the input explanation when cleanup fails', async () => {
  const t = convexTest(schema, modules);
  const message = await receiveAlbum(t, 3);
  vi.setSystemTime(message.mediaGroupReadyAt!);
  const turn = (await t.mutation(internal.chats.claim, { chatId: message.chatId }))!;
  integration.downloadImage
    .mockResolvedValueOnce(new Blob(['first'], { type: 'image/png' }))
    .mockResolvedValueOnce(new Blob(['second'], { type: 'image/png' }))
    .mockRejectedValueOnce(new ImageInputError('too_large'));
  const response = await t.action(async (ctx) => {
    const remove = vi
      .fn((id: Id<'_storage'>) => ctx.storage.delete(id))
      .mockRejectedValueOnce(new Error('secret cleanup payload'));
    const result = await prepareChatResponse(
      {
        ...ctx,
        storage: { ...ctx.storage, delete: remove },
      },
      turn.message,
      integration,
    );
    expect(remove).toHaveBeenCalledTimes(2);
    return result;
  });
  expect(response.text).toContain('JPEG, PNG, or WebP');
  expect(response.failure).toEqual({ code: 'too_large', message: 'Image exceeds 10 MB' });
  expect(generateReply).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.system.query('_storage').collect())).toHaveLength(1);
  expect(console.error).toHaveBeenCalledWith('Chat image cleanup failed', {
    messageId: message._id,
    storageId: expect.any(String),
    code: 'failed',
  });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    'secret cleanup payload',
  );
});

it('cleans up stored images when attaching them fails', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t, true);
  const failure = new Error('secret mutation payload');
  const response = await t.action(async (ctx) =>
    prepareChatResponse(
      {
        ...ctx,
        runMutation: async () => {
          throw failure;
        },
      },
      message,
      integration,
    ),
  );
  expect(response).toEqual({
    text: 'Sorry, I couldn’t complete that request. Please try again.',
    failure: { code: 'failed', message: 'Response generation failed' },
  });
  expect(generateReply).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.system.query('_storage').collect())).toHaveLength(0);
});

it('downloads and stores an image, generates with bytes, and persists the final delivery', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t, true);
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  const stored = (await t.run((ctx) => ctx.db.get(message._id)))!;
  expect(stored.sourceImage).toBeUndefined();
  expect(stored.parts[1]).toMatchObject({
    type: 'image',
    storageId: expect.any(String),
    mediaType: 'image/png',
  });
  expect(JSON.stringify(stored)).not.toContain('image-file');
  expect(vi.mocked(generateReply).mock.calls[0]![0].messages[0]).toMatchObject({
    role: 'user',
    content: [
      { type: 'text' },
      { type: 'image', source: { type: 'data', value: 'iVBORw0KGgo=', mimeType: 'image/png' } },
    ],
  });
  expect(integration.sendText).toHaveBeenCalledWith('Hello', expect.any(AbortSignal));
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs).toHaveLength(2);
  expect(docs[1]).toMatchObject({
    status: 'completed',
    deliveryStatus: 'sent',
    externalReplyIds: ['reply-1'],
  });
  expect((await t.run((ctx) => ctx.db.get(message.chatId)))!.activeMessageId).toBeUndefined();
});

it('keeps only the four latest image inputs, including follow-up context', async () => {
  const read = vi.fn().mockResolvedValue(new Uint8Array([1]));
  const history = Array.from({ length: 6 }, (_, index) => ({
    role: 'user' as const,
    parts: [
      {
        type: 'image' as const,
        storageId: String(index) as Id<'_storage'>,
        mediaType: 'image/png',
      },
    ],
  }));
  history.push({ role: 'user', parts: [] });
  const result = await buildModelMessages(history, read);
  expect(read.mock.calls.map(([id]) => id)).toEqual(['2', '3', '4', '5']);
  expect(result[0]!.content).toEqual([{ type: 'text', content: '[Earlier image omitted]' }]);
});

it('records generation failure, sends a short error, and unlocks the chat', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(generateReply).mockRejectedValueOnce(new Error('provider secret payload'));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({
    status: 'failed',
    deliveryStatus: 'sent',
    error: 'Response generation failed',
  });
  expect(JSON.stringify(docs)).not.toContain('secret payload');
  expect(integration.sendText).toHaveBeenCalledTimes(1);
  expect((await t.run((ctx) => ctx.db.get(message.chatId)))!.activeMessageId).toBeUndefined();
});

it('never retries or regenerates after an ambiguous final send', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  integration.sendText.mockRejectedValueOnce(new TelegramError(true));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({
    deliveryStatus: 'unknown',
    parts: [{ type: 'text', text: 'Hello' }],
  });
  expect(generateReply).toHaveBeenCalledTimes(1);
  expect(integration.sendText).toHaveBeenCalledTimes(1);
});

it('logs a safe Gateway failure and sends the generic failure reply', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(generateReply).mockRejectedValueOnce(new ChatGenerationError('access_denied', 403));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(integration.sendText.mock.calls[0]![0]).toBe(
    'Sorry, I couldn’t complete that request. Please try again.',
  );
  expect(console.error).toHaveBeenCalledWith('Chat response failed', {
    messageId: message._id,
    model: CHAT_MODEL,
    stage: 'generation',
    code: 'access_denied',
    statusCode: 403,
  });
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]!.error).toBe('AI Gateway access denied');
});

it('explains unsupported media without calling the model', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  await t.run((ctx) => ctx.db.patch(message._id, { unsupported: true }));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(generateReply).not.toHaveBeenCalled();
  expect(integration.sendText.mock.calls[0]![0]).toContain('JPEG, PNG, or WebP');
});

it('records a definite Telegram rejection without retrying delivery', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  integration.sendText.mockRejectedValueOnce(new TelegramError(false, 403));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]!.deliveryStatus).toBe('failed');
  expect(integration.sendText).toHaveBeenCalledTimes(1);
});

it('delivers long answers in order and records each resulting message ID', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(generateReply).mockResolvedValueOnce('x'.repeat(5000));
  integration.sendText.mockResolvedValueOnce('first').mockResolvedValueOnce('second');
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(integration.sendText.mock.calls.map(([text]) => text.length)).toEqual([4096, 904]);
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]!.externalReplyIds).toEqual(['first', 'second']);
});

it('works with an adapter that only supports sending text', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(getChatIntegration).mockReturnValue({ sendText: integration.sendText });
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(integration.sendText).toHaveBeenCalledWith('Hello', expect.any(AbortSignal));
  expect(integration.typing.send).not.toHaveBeenCalled();
  expect(integration.draft.send).not.toHaveBeenCalled();
  expect((await t.run((ctx) => ctx.db.get(message._id)))!.status).toBe('completed');
});

it('uses the same chunked delivery path for fallback replies', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(generateReply).mockRejectedValueOnce(new ChatGenerationError('access_denied', 401));
  vi.mocked(getChatIntegration).mockReturnValue({
    sendText: integration.sendText,
    splitText: (text) => [text.slice(0, 10), text.slice(10)],
  });
  integration.sendText.mockResolvedValueOnce('first').mockResolvedValueOnce('second');
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(integration.sendText).toHaveBeenCalledTimes(2);
  expect(docs[1]).toMatchObject({
    status: 'failed',
    deliveryStatus: 'sent',
    externalReplyIds: ['first', 'second'],
  });
  expect(integration.sendText.mock.calls.map(([text]) => text).join('')).toBe(
    'Sorry, I couldn’t complete that request. Please try again.',
  );
});

it('preserves confirmed chunks when a later send is ambiguous', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(generateReply).mockResolvedValueOnce('x'.repeat(5000));
  integration.sendText
    .mockResolvedValueOnce('first')
    .mockRejectedValueOnce(new TelegramError(true));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({
    status: 'failed',
    deliveryStatus: 'unknown',
    externalReplyIds: ['first'],
  });
  expect(integration.sendText).toHaveBeenCalledTimes(2);
});

it('records uncertainty when a sent chunk cannot be persisted, without sending later chunks', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  const turn = (await t.mutation(internal.chats.claim, { chatId: message.chatId }))!;
  const result = await t.action(async (ctx) => {
    let mutationCalls = 0;
    return deliverChatResponse(
      {
        runMutation: async (mutation, ...args) => {
          mutationCalls++;
          if (mutationCalls === 2) throw new Error('secret persistence payload');
          return ctx.runMutation(mutation, ...args);
        },
      },
      turn.responseId,
      integration,
      'x'.repeat(5000),
    );
  });
  expect(result).toEqual({
    delivery: 'unknown',
    failure: { code: 'failed', message: 'Response delivery failed' },
  });
  expect(integration.sendText).toHaveBeenCalledTimes(1);
});

it('does not deliver a fallback after the turn expires during generation', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(generateReply).mockImplementationOnce(async () => {
    await t.mutation(internal.chats.expire, { messageId: message._id });
    throw new Error('Generation interrupted');
  });
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(integration.sendText).not.toHaveBeenCalled();
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({ status: 'failed', deliveryStatus: 'failed', parts: [] });
});

it('explains an image sent to an adapter without image support', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t, true);
  vi.mocked(getChatIntegration).mockReturnValue({ sendText: integration.sendText });
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(generateReply).not.toHaveBeenCalled();
  expect(integration.sendText.mock.calls[0]![0]).toContain('text only');
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({ status: 'failed', deliveryStatus: 'sent' });
});

it('recognizes typed image errors independently of their wording', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t, true);
  const error = new ImageInputError('too_large');
  error.message = 'Different wording';
  integration.downloadImage.mockRejectedValueOnce(error);
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(generateReply).not.toHaveBeenCalled();
  expect(integration.sendText.mock.calls[0]![0]).toContain('JPEG, PNG, or WebP');
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]!.error).toBe('Image exceeds 10 MB');
});

it.each([false, true])(
  'does not resend a failed fallback and preserves the generation error (uncertain=%s)',
  async (uncertain) => {
    const t = convexTest(schema, modules);
    const message = await receive(t);
    vi.mocked(generateReply).mockRejectedValueOnce(new ChatGenerationError('access_denied', 403));
    integration.sendText.mockRejectedValueOnce(new TelegramError(uncertain, 403));
    await t.action(internal.chatActions.respond, { chatId: message.chatId });
    await t.action(internal.chatActions.respond, { chatId: message.chatId });
    expect(generateReply).toHaveBeenCalledTimes(1);
    expect(integration.sendText).toHaveBeenCalledTimes(1);
    const docs = await t.run((ctx) => ctx.db.query('messages').collect());
    expect(docs[1]).toMatchObject({
      status: 'failed',
      error: 'AI Gateway access denied',
      deliveryStatus: uncertain ? 'unknown' : 'failed',
    });
    expect(vi.mocked(console.error).mock.calls.map(([, context]) => context)).toEqual([
      {
        messageId: message._id,
        model: CHAT_MODEL,
        stage: 'generation',
        code: 'access_denied',
        statusCode: 403,
      },
      { messageId: message._id, model: CHAT_MODEL, stage: 'delivery', code: 'failed' },
    ]);
    expect((await t.run((ctx) => ctx.db.get(message.chatId)))!.activeMessageId).toBeUndefined();
  },
);

it('finalizes a turn when integration configuration fails', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t);
  vi.mocked(getChatIntegration).mockImplementationOnce(() => {
    throw new Error('secret token');
  });
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(generateReply).not.toHaveBeenCalled();
  expect(integration.sendText).not.toHaveBeenCalled();
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({
    status: 'failed',
    deliveryStatus: 'failed',
    error: 'Response generation failed',
  });
  expect(JSON.stringify(docs)).not.toContain('secret token');
  expect((await t.run((ctx) => ctx.db.get(message.chatId)))!.activeMessageId).toBeUndefined();
});

it('reports unexpected image download failures with the generic reply', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t, true);
  integration.downloadImage.mockRejectedValueOnce(new Error('provider secret payload'));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(generateReply).not.toHaveBeenCalled();
  expect(integration.sendText).toHaveBeenCalledWith(
    'Sorry, I couldn’t complete that request. Please try again.',
    expect.any(AbortSignal),
  );
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({
    status: 'failed',
    deliveryStatus: 'sent',
    error: 'Response generation failed',
  });
});

it('explains an unsupported image format', async () => {
  const t = convexTest(schema, modules);
  const message = await receive(t, true);
  integration.downloadImage.mockRejectedValueOnce(new ImageInputError('unsupported_format'));
  await t.action(internal.chatActions.respond, { chatId: message.chatId });
  expect(generateReply).not.toHaveBeenCalled();
  expect(integration.sendText.mock.calls[0]![0]).toContain('JPEG, PNG, or WebP');
  const docs = await t.run((ctx) => ctx.db.query('messages').collect());
  expect(docs[1]).toMatchObject({
    status: 'failed',
    deliveryStatus: 'sent',
    error: 'Unsupported image format',
  });
});

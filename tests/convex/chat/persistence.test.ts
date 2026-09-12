import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { internal } from '#convex/_generated/api';
import { MEDIA_GROUP_WAIT_MS } from '#convex/chat/policy';
import type { InboundMessage } from '#convex/chat/types';
import schema from '#convex/schema';

const modules = import.meta.glob('../../../convex/**/*.ts');
const inbound = (event = '1', account = '123'): InboundMessage => ({
  provider: 'telegram',
  conversationScope: 'personal',
  integrationAccountId: '456',
  externalConversationId: account,
  externalAccountId: account,
  externalEventId: event,
  externalMessageId: event,
  parts: [{ type: 'text', text: `Message ${event}` }],
});
const albumItem = (event: string, account = '123', group = 'album'): InboundMessage => ({
  ...inbound(event, account),
  externalMediaGroupId: group,
  image: { externalFileId: `image-${event}` },
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('chat persistence and queue', () => {
  it('groups out-of-order album items, extends the wait, and deduplicates every item', async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const id = await t.mutation(internal.chats.receive, { message: albumItem('2') });
    const first = (await t.run((ctx) => ctx.db.get(id)))!;
    vi.setSystemTime(now + MEDIA_GROUP_WAIT_MS - 1);
    expect(await t.mutation(internal.chats.receive, { message: albumItem('1') })).toBe(id);
    expect(await t.mutation(internal.chats.receive, { message: albumItem('2') })).toBe(id);
    vi.setSystemTime(now + MEDIA_GROUP_WAIT_MS);
    expect(await t.mutation(internal.chats.claim, { chatId: first.chatId })).toBeNull();
    const grouped = (await t.run((ctx) => ctx.db.get(id)))!;
    expect(grouped.mediaGroupItems?.map((item) => item.image?.externalFileId)).toEqual([
      'image-1',
      'image-2',
    ]);
    expect(grouped.parts).toEqual([
      { type: 'text', text: 'Message 1' },
      { type: 'text', text: 'Message 2' },
    ]);
    expect(grouped.externalMessageId).toBe('1');
    vi.setSystemTime(grouped.mediaGroupReadyAt!);
    const turn = (await t.mutation(internal.chats.claim, { chatId: first.chatId }))!;
    await t.mutation(internal.chats.finish, {
      messageId: id,
      responseId: turn.responseId,
      delivery: 'sent',
    });
    for (const event of ['1', '2']) {
      expect(await t.mutation(internal.chats.receive, { message: albumItem(event) })).toBe(id);
    }
    expect(await t.run((ctx) => ctx.db.query('messages').collect())).toHaveLength(2);
  });

  it('keeps text behind a collecting album while isolating other albums and routes', async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.chats.receive, { message: albumItem('1') });
    const textId = await t.mutation(internal.chats.receive, { message: inbound('2') });
    const otherAlbum = await t.mutation(internal.chats.receive, {
      message: albumItem('3', '123', 'other-album'),
    });
    const otherUser = await t.mutation(internal.chats.receive, {
      message: albumItem('1', '789'),
    });
    const otherBot = await t.mutation(internal.chats.receive, {
      message: { ...albumItem('1'), integrationAccountId: '999' },
    });
    expect(new Set([id, textId, otherAlbum, otherUser, otherBot]).size).toBe(5);
    const message = (await t.run((ctx) => ctx.db.get(id)))!;
    expect(await t.mutation(internal.chats.claim, { chatId: message.chatId })).toBeNull();
    vi.setSystemTime(message.mediaGroupReadyAt!);
    const turn = (await t.mutation(internal.chats.claim, { chatId: message.chatId }))!;
    expect(turn.message._id).toBe(id);
    await t.mutation(internal.chats.finish, {
      messageId: id,
      responseId: turn.responseId,
      delivery: 'sent',
    });
    expect((await t.mutation(internal.chats.claim, { chatId: message.chatId }))!.message._id).toBe(
      textId,
    );
  });

  it('keeps genuinely late items without changing a claimed album or replaying duplicates', async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(internal.chats.receive, { message: albumItem('1') });
    const message = (await t.run((ctx) => ctx.db.get(id)))!;
    vi.setSystemTime(message.mediaGroupReadyAt!);
    await t.mutation(internal.chats.claim, { chatId: message.chatId });
    const lateId = await t.mutation(internal.chats.receive, { message: albumItem('2') });
    expect(lateId).not.toBe(id);
    expect(await t.mutation(internal.chats.receive, { message: albumItem('1') })).toBe(id);
    expect(await t.mutation(internal.chats.receive, { message: albumItem('2') })).toBe(lateId);
    expect((await t.run((ctx) => ctx.db.get(id)))!.mediaGroupItems).toHaveLength(1);
  });

  it('deduplicates events and uses Convex system fields on all five tables', async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.chats.receive, { message: inbound() });
    const duplicate = await t.mutation(internal.chats.receive, { message: inbound() });
    expect(duplicate).toBe(first);
    await t.run(async (ctx) => {
      for (const table of ['users', 'identities', 'chats', 'chatChannels', 'messages'] as const) {
        const docs = await ctx.db.query(table).collect();
        expect(docs).toHaveLength(1);
        expect(docs[0]).toHaveProperty('_id');
        expect(docs[0]).toHaveProperty('_creationTime', expect.any(Number));
        expect(docs[0]).not.toHaveProperty('createdAt');
      }
    });
  });

  it('isolates users and processes each chat in arrival order', async () => {
    const t = convexTest(schema, modules);
    const firstId = await t.mutation(internal.chats.receive, { message: inbound('1') });
    const secondId = await t.mutation(internal.chats.receive, { message: inbound('2') });
    const otherId = await t.mutation(internal.chats.receive, { message: inbound('1', '789') });
    const [first, other] = await t.run(async (ctx) => [
      await ctx.db.get(firstId),
      await ctx.db.get(otherId),
    ]);
    expect(first!.chatId).not.toBe(other!.chatId);
    const [claim1, claim2] = await Promise.all([
      t.mutation(internal.chats.claim, { chatId: first!.chatId }),
      t.mutation(internal.chats.claim, { chatId: first!.chatId }),
    ]);
    const turn = claim1 ?? claim2;
    expect([claim1, claim2].filter(Boolean)).toHaveLength(1);
    expect(turn!.message._id).toBe(firstId);
    expect(await t.mutation(internal.chats.claim, { chatId: other!.chatId })).not.toBeNull();
    await t.mutation(internal.chats.prepareDelivery, {
      responseId: turn!.responseId,
      text: 'First answer',
    });
    await t.mutation(internal.chats.finish, {
      messageId: firstId,
      responseId: turn!.responseId,
      delivery: 'sent',
    });
    const next = await t.mutation(internal.chats.claim, { chatId: first!.chatId });
    expect(next!.message._id).toBe(secondId);
    const history = await t.query(internal.chats.history, { messageId: secondId });
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(history.every((m) => m.chatId === first!.chatId)).toBe(true);
  });

  it('reuses history across explicitly linked identities and retains the source route', async () => {
    const t = convexTest(schema, modules);
    const originalId = await t.mutation(internal.chats.receive, { message: inbound() });
    const original = await t.run(async (ctx) => {
      const message = (await ctx.db.get(originalId))!;
      const chat = (await ctx.db.get(message.chatId))!;
      await ctx.db.insert('identities', {
        userId: chat.userId!,
        provider: 'future-channel',
        externalAccountId: 'other-account',
      });
      return message;
    });
    const turn = (await t.mutation(internal.chats.claim, { chatId: original.chatId }))!;
    await t.mutation(internal.chats.prepareDelivery, {
      responseId: turn.responseId,
      text: 'Remember this',
    });
    await t.mutation(internal.chats.finish, {
      messageId: originalId,
      responseId: turn.responseId,
      delivery: 'sent',
    });
    const linkedId = await t.mutation(internal.chats.receive, {
      message: { ...inbound('2'), provider: 'future-channel', externalAccountId: 'other-account' },
    });
    const linked = (await t.run((ctx) => ctx.db.get(linkedId)))!;
    expect(linked.chatId).toBe(original.chatId);
    expect(linked.channelId).not.toBe(original.channelId);
    const history = await t.query(internal.chats.history, { messageId: linkedId });
    expect(history).toHaveLength(3);
    await expect(
      t.mutation(internal.chats.receive, {
        message: { ...inbound('3'), externalAccountId: 'attacker' },
      }),
    ).rejects.toThrow('Channel identity mismatch');
  });

  it('recovers an interrupted turn without regenerating or blocking the next message', async () => {
    const t = convexTest(schema, modules);
    const firstId = await t.mutation(internal.chats.receive, { message: inbound() });
    const secondId = await t.mutation(internal.chats.receive, { message: inbound('2') });
    const first = (await t.run((ctx) => ctx.db.get(firstId)))!;
    const turn = (await t.mutation(internal.chats.claim, { chatId: first.chatId }))!;
    await t.mutation(internal.chats.prepareDelivery, {
      responseId: turn.responseId,
      text: 'Answer',
    });
    await t.mutation(internal.chats.expire, { messageId: firstId });
    expect((await t.run((ctx) => ctx.db.get(turn.responseId)))!.deliveryStatus).toBe('unknown');
    expect((await t.mutation(internal.chats.claim, { chatId: first.chatId }))!.message._id).toBe(
      secondId,
    );
    await expect(
      t.mutation(internal.chats.prepareDelivery, { responseId: turn.responseId, text: 'Too late' }),
    ).rejects.toThrow('Turn expired');
    expect(await t.mutation(internal.chats.receive, { message: inbound() })).toBe(firstId);
  });

  it('limits context to the latest 20 completed turns', async () => {
    const t = convexTest(schema, modules);
    let messageId = await t.mutation(internal.chats.receive, { message: inbound() });
    const message = (await t.run((ctx) => ctx.db.get(messageId)))!;
    for (let i = 0; i < 22; i++) {
      const turn = (await t.mutation(internal.chats.claim, { chatId: message.chatId }))!;
      await t.mutation(internal.chats.prepareDelivery, {
        responseId: turn.responseId,
        text: `Answer ${i}`,
      });
      await t.mutation(internal.chats.finish, {
        messageId,
        responseId: turn.responseId,
        delivery: 'sent',
      });
      messageId = await t.mutation(internal.chats.receive, { message: inbound(String(i + 2)) });
    }
    const history = await t.query(internal.chats.history, { messageId });
    expect(history).toHaveLength(41);
    expect(history[0]!.externalEventId).toBe('3');
    expect(history.at(-1)!._id).toBe(messageId);
  });
});

it('keeps direct conversations separate from personal history for the same user', async () => {
  const t = convexTest(schema, modules);
  const receive = (
    externalConversationId: string,
    conversationScope: InboundMessage['conversationScope'],
  ) =>
    t.mutation(internal.chats.receive, {
      message: { ...inbound(), externalConversationId, conversationScope },
    });
  const directId = await receive('thread-a', 'direct');
  const personalId = await receive('personal-a', 'personal');
  const otherDirectId = await receive('thread-b', 'direct');
  const otherPersonalId = await receive('personal-b', 'personal');
  const messages = await t.run(async (ctx) =>
    Promise.all([directId, personalId, otherDirectId, otherPersonalId].map((id) => ctx.db.get(id))),
  );
  expect(new Set(messages.map((message) => message!.chatId)).size).toBe(3);
  expect(messages[1]!.chatId).toBe(messages[3]!.chatId);
  expect(new Set(messages.map((message) => message!.identityId)).size).toBe(1);
  await expect(receive('thread-a', 'personal')).rejects.toThrow('Channel identity mismatch');
});

it('accepts different group senders without exposing their personal history', async () => {
  const t = convexTest(schema, modules);
  const personalId = await t.mutation(internal.chats.receive, { message: inbound() });
  const groupMessage = {
    ...inbound(),
    externalConversationId: 'group-a',
    conversationScope: 'group' as const,
  };
  const firstId = await t.mutation(internal.chats.receive, { message: groupMessage });
  const secondId = await t.mutation(internal.chats.receive, {
    message: {
      ...groupMessage,
      externalAccountId: '789',
      externalEventId: '2',
      externalMessageId: '2',
    },
  });
  const [personal, first, second] = await t.run(async (ctx) =>
    Promise.all([personalId, firstId, secondId].map((id) => ctx.db.get(id))),
  );
  expect(first!.chatId).toBe(second!.chatId);
  expect(first!.chatId).not.toBe(personal!.chatId);
  expect(first!.channelId).toBe(second!.channelId);
  expect(first!.identityId).not.toBe(second!.identityId);
  expect(await t.query(internal.chats.history, { messageId: secondId })).toEqual([second]);
  await expect(
    t.mutation(internal.chats.receive, {
      message: { ...inbound('3'), conversationScope: 'group', externalAccountId: '789' },
    }),
  ).rejects.toThrow('Channel identity mismatch');
});

it('retains 20 useful turns even after 20 unsupported messages', async () => {
  const t = convexTest(schema, modules);
  let lastId;
  for (let index = 0; index < 40; index++) {
    const id = await t.mutation(internal.chats.receive, {
      message: { ...inbound(String(index)), unsupported: index >= 20 },
    });
    const message = (await t.run((ctx) => ctx.db.get(id)))!;
    const turn = (await t.mutation(internal.chats.claim, { chatId: message.chatId }))!;
    await t.mutation(internal.chats.prepareDelivery, {
      responseId: turn.responseId,
      text: `Reply ${index}`,
    });
    await t.mutation(internal.chats.finish, {
      messageId: id,
      responseId: turn.responseId,
      delivery: 'sent',
    });
    lastId = id;
  }
  const currentId = await t.mutation(internal.chats.receive, { message: inbound('current') });
  const history = await t.query(internal.chats.history, { messageId: currentId });
  expect(history).toHaveLength(41);
  expect(history[0]!.externalEventId).toBe('0');
  expect(history.at(-1)!._id).toBe(currentId);
  expect(history.some((message) => message.unsupported || message._id === lastId)).toBe(false);
});

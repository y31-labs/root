import { v } from 'convex/values';

import { internal } from '#convex/_generated/api';
import type { Doc, Id } from '#convex/_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from '#convex/_generated/server';
import { MEDIA_GROUP_WAIT_MS, PROCESSING_LEASE_MS } from '#convex/chat/policy';
import { resolveChatRoute } from '#convex/chat/routing';
import type { ChatTurn } from '#convex/chat/types';
import { deliveryStatus, inboundMessage } from '#convex/chat/validators';

const scheduleNext = async (ctx: MutationCtx, chatId: Id<'chats'>) => {
  const next = await ctx.db
    .query('messages')
    .withIndex('by_chat_status', (q) => q.eq('chatId', chatId).eq('status', 'queued'))
    .first();
  if (next)
    await ctx.scheduler.runAfter(
      Math.max(0, (next.mediaGroupReadyAt ?? 0) - Date.now()),
      internal.chatActions.respond,
      { chatId },
    );
};

export const receive = internalMutation({
  args: { message: inboundMessage },
  handler: async (ctx, { message }): Promise<Id<'messages'>> => {
    const { channel, identity } = await resolveChatRoute(ctx, message);
    const existing = await ctx.db
      .query('messages')
      .withIndex('by_channel_event', (q) =>
        q.eq('channelId', channel._id).eq('externalEventId', message.externalEventId),
      )
      .unique();
    if (existing) return existing._id;

    const groupItem = {
      externalEventId: message.externalEventId,
      externalMessageId: message.externalMessageId,
      parts: message.parts,
      image: message.image,
    };
    if (message.externalMediaGroupId) {
      const groups = await ctx.db
        .query('messages')
        .withIndex('by_channel_media_group', (q) =>
          q.eq('channelId', channel._id).eq('externalMediaGroupId', message.externalMediaGroupId),
        )
        .collect();
      const duplicate = groups.find((group) =>
        group.mediaGroupItems?.some(
          (item) =>
            item.externalEventId === message.externalEventId ||
            item.externalMessageId === message.externalMessageId,
        ),
      );
      if (duplicate) return duplicate._id;
      const group = groups.find((group) => group.status === 'queued');
      if (group) {
        if (group.identityId !== identity._id) throw new Error('Media group identity mismatch');
        const items = [...group.mediaGroupItems!, groupItem].sort(
          (a, b) => Number(a.externalMessageId) - Number(b.externalMessageId),
        );
        await ctx.db.patch(group._id, {
          mediaGroupItems: items,
          mediaGroupReadyAt: Date.now() + MEDIA_GROUP_WAIT_MS,
          externalMessageId: items[0]!.externalMessageId,
          parts: items.flatMap((item) => item.parts),
          unsupported: group.unsupported || message.unsupported || undefined,
        });
        // The existing scheduled action rechecks the deadline before claiming.
        return group._id;
      }
      // A genuinely late item starts another turn instead of changing an active
      // or completed response. Retries of any earlier item remain deduplicated.
    }

    const messageId = await ctx.db.insert('messages', {
      chatId: channel.chatId,
      channelId: channel._id,
      identityId: identity._id,
      role: 'user',
      parts: message.parts,
      externalEventId: message.externalEventId,
      externalMessageId: message.externalMessageId,
      sourceImage: message.externalMediaGroupId ? undefined : message.image,
      ...(message.externalMediaGroupId
        ? {
            externalMediaGroupId: message.externalMediaGroupId,
            mediaGroupItems: [groupItem],
            mediaGroupReadyAt: Date.now() + MEDIA_GROUP_WAIT_MS,
          }
        : {}),
      unsupported: message.unsupported || undefined,
      status: 'queued',
    });
    const chat = (await ctx.db.get(channel.chatId))!;
    if (!chat.activeMessageId) await scheduleNext(ctx, chat._id);
    return messageId;
  },
});

export const claim = internalMutation({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }): Promise<ChatTurn | null> => {
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.activeMessageId) return null;
    const message = await ctx.db
      .query('messages')
      .withIndex('by_chat_status', (q) => q.eq('chatId', chatId).eq('status', 'queued'))
      .first();
    if (!message) return null;
    if ((message.mediaGroupReadyAt ?? 0) > Date.now()) {
      await scheduleNext(ctx, chatId);
      return null;
    }
    const channel = (await ctx.db.get(message.channelId))!;
    const responseId = await ctx.db.insert('messages', {
      chatId,
      channelId: channel._id,
      role: 'assistant',
      parts: [],
      unsupported: message.unsupported,
      replyTo: message._id,
      status: 'processing',
      deliveryStatus: 'pending',
    });
    const recoveryJobId = await ctx.scheduler.runAfter(PROCESSING_LEASE_MS, internal.chats.expire, {
      messageId: message._id,
    });
    await ctx.db.patch(message._id, { status: 'processing', recoveryJobId });
    await ctx.db.patch(chatId, { activeMessageId: message._id });
    return { message, channel, responseId };
  },
});

export const history = internalQuery({
  args: { messageId: v.id('messages') },
  handler: async (ctx, { messageId }): Promise<Doc<'messages'>[]> => {
    const current = (await ctx.db.get(messageId))!;
    const responses = await ctx.db
      .query('messages')
      .withIndex('by_chat_role_status', (q) =>
        q
          .eq('chatId', current.chatId)
          .eq('role', 'assistant')
          .eq('status', 'completed')
          .eq('unsupported', undefined),
      )
      .order('desc')
      .take(20);
    const history: Doc<'messages'>[] = [];
    for (const response of responses.reverse()) {
      const user = response.replyTo ? await ctx.db.get(response.replyTo) : null;
      if (user) history.push(user, response);
    }
    return [...history, current];
  },
});

export const attachImages = internalMutation({
  args: {
    messageId: v.id('messages'),
    images: v.array(v.object({ storageId: v.id('_storage'), mediaType: v.string() })),
  },
  handler: async (ctx, { messageId, images }) => {
    const message = (await ctx.db.get(messageId))!;
    const chat = (await ctx.db.get(message.chatId))!;
    if (chat.activeMessageId !== messageId) throw new Error('Turn expired');
    await ctx.db.patch(messageId, {
      parts: [...message.parts, ...images.map((image) => ({ type: 'image' as const, ...image }))],
      sourceImage: undefined,
      mediaGroupItems: message.mediaGroupItems?.map((item) => ({ ...item, image: undefined })),
    });
  },
});

export const prepareDelivery = internalMutation({
  args: { responseId: v.id('messages'), text: v.string() },
  handler: async (ctx, { responseId, text }) => {
    const response = (await ctx.db.get(responseId))!;
    const chat = (await ctx.db.get(response.chatId))!;
    if (chat.activeMessageId !== response.replyTo) throw new Error('Turn expired');
    await ctx.db.patch(responseId, { parts: [{ type: 'text', text }], deliveryStatus: 'sending' });
  },
});

export const recordDelivery = internalMutation({
  args: { responseId: v.id('messages'), externalMessageId: v.string() },
  handler: async (ctx, { responseId, externalMessageId }) => {
    const response = (await ctx.db.get(responseId))!;
    await ctx.db.patch(responseId, {
      externalReplyIds: [...(response.externalReplyIds ?? []), externalMessageId],
    });
  },
});

export const finish = internalMutation({
  args: {
    messageId: v.id('messages'),
    responseId: v.id('messages'),
    delivery: deliveryStatus,
    error: v.optional(v.string()),
  },
  handler: async (ctx, { messageId, responseId, delivery, error }) => {
    const message = (await ctx.db.get(messageId))!;
    const chat = (await ctx.db.get(message.chatId))!;
    if (chat.activeMessageId !== messageId) return;
    if (message.recoveryJobId) await ctx.scheduler.cancel(message.recoveryJobId);
    const status = error ? ('failed' as const) : ('completed' as const);
    await ctx.db.patch(messageId, { status, error, recoveryJobId: undefined });
    await ctx.db.patch(responseId, { status, error, deliveryStatus: delivery });
    await ctx.db.patch(chat._id, { activeMessageId: undefined });
    await scheduleNext(ctx, chat._id);
  },
});

export const expire = internalMutation({
  args: { messageId: v.id('messages') },
  handler: async (ctx, { messageId }) => {
    const message = (await ctx.db.get(messageId))!;
    const chat = (await ctx.db.get(message.chatId))!;
    if (chat.activeMessageId !== messageId) return;
    const response = await ctx.db
      .query('messages')
      .withIndex('by_reply', (q) => q.eq('replyTo', messageId))
      .unique();
    const error = 'Processing timed out';
    await ctx.db.patch(messageId, { status: 'failed', error, recoveryJobId: undefined });
    if (response)
      await ctx.db.patch(response._id, {
        status: 'failed',
        error,
        deliveryStatus: response.deliveryStatus === 'sending' ? 'unknown' : 'failed',
      });
    await ctx.db.patch(chat._id, { activeMessageId: undefined });
    await scheduleNext(ctx, chat._id);
  },
});

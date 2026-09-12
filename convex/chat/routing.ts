import type { MutationCtx } from '#convex/_generated/server';
import type { ChatRoute, InboundMessage } from '#convex/chat/types';

export const resolveChatRoute = async (
  ctx: MutationCtx,
  message: InboundMessage,
): Promise<ChatRoute> => {
  let channel = await ctx.db
    .query('chatChannels')
    .withIndex('by_route', (q) =>
      q
        .eq('provider', message.provider)
        .eq('integrationAccountId', message.integrationAccountId)
        .eq('externalConversationId', message.externalConversationId),
    )
    .unique();

  let identity = await ctx.db
    .query('identities')
    .withIndex('by_provider_account', (q) =>
      q.eq('provider', message.provider).eq('externalAccountId', message.externalAccountId),
    )
    .unique();
  if (!identity) {
    const userId = await ctx.db.insert('users', {});
    const identityId = await ctx.db.insert('identities', {
      userId,
      provider: message.provider,
      externalAccountId: message.externalAccountId,
    });
    identity = (await ctx.db.get(identityId))!;
  }

  if (channel) {
    const chat = await ctx.db.get(channel.chatId);
    if (
      !chat ||
      chat.scope !== message.conversationScope ||
      (chat.scope !== 'group' &&
        (channel.identityId !== identity._id || chat.userId !== identity.userId))
    ) {
      throw new Error('Channel identity mismatch');
    }
  } else {
    // Only personal routes opt into the user's shared history. Direct and
    // group conversations get their own chat, even for an existing identity.
    const existingChat =
      message.conversationScope === 'personal'
        ? await ctx.db
            .query('chats')
            .withIndex('by_user_scope', (q) =>
              q.eq('userId', identity.userId).eq('scope', 'personal'),
            )
            .unique()
        : null;
    const chatId =
      existingChat?._id ??
      (await ctx.db.insert('chats', {
        userId: message.conversationScope === 'group' ? undefined : identity.userId,
        scope: message.conversationScope,
      }));
    const channelId = await ctx.db.insert('chatChannels', {
      chatId,
      identityId: message.conversationScope === 'group' ? undefined : identity._id,
      provider: message.provider,
      integrationAccountId: message.integrationAccountId,
      externalConversationId: message.externalConversationId,
    });
    channel = (await ctx.db.get(channelId))!;
  }

  return { channel, identity };
};

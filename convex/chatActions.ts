'use node';

import { v } from 'convex/values';

import { internal } from '#convex/_generated/api';
import { internalAction, type ActionCtx } from '#convex/_generated/server';
import { deliverChatResponse } from '#convex/chat/delivery';
import { classifyChatFailure, logChatFailure } from '#convex/chat/errors';
import { getChatIntegration } from '#convex/chat/integration';
import { CHAT_MODEL } from '#convex/chat/policy';
import { prepareChatResponse } from '#convex/chat/response';
import type { ChatDeliveryResult, ChatTurn } from '#convex/chat/types';

const respondToTurn = async (ctx: ActionCtx, turn: ChatTurn): Promise<ChatDeliveryResult> => {
  const context = { messageId: turn.message._id, model: CHAT_MODEL };
  try {
    const integration = getChatIntegration(turn.channel, turn.message);
    const response = await prepareChatResponse(ctx, turn.message, integration);
    if (response.failure) logChatFailure(response.failure, { ...context, stage: 'generation' });

    const delivery = await deliverChatResponse(ctx, turn.responseId, integration, response.text);
    if (delivery.failure) logChatFailure(delivery.failure, { ...context, stage: 'delivery' });
    return { ...delivery, failure: response.failure ?? delivery.failure };
  } catch (error) {
    const failure = classifyChatFailure(error, 'generation');
    logChatFailure(failure, { ...context, stage: 'generation' });
    return { delivery: 'failed', failure };
  }
};

export const respond = internalAction({
  args: { chatId: v.id('chats') },
  handler: async (ctx, { chatId }): Promise<void> => {
    const turn = await ctx.runMutation(internal.chats.claim, { chatId });
    if (!turn) return;
    const result = await respondToTurn(ctx, turn);
    await ctx.runMutation(internal.chats.finish, {
      messageId: turn.message._id,
      responseId: turn.responseId,
      delivery: result.delivery,
      ...(result.failure ? { error: result.failure.message } : {}),
    });
  },
});

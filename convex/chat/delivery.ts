import { internal } from '#convex/_generated/api';
import type { Id } from '#convex/_generated/dataModel';
import type { ActionCtx } from '#convex/_generated/server';
import { classifyChatFailure, IntegrationDeliveryError } from '#convex/chat/errors';
import { DELIVERY_TIMEOUT_MS } from '#convex/chat/policy';
import type { ChatDeliveryResult, ChatIntegration } from '#convex/chat/types';

const sendChunks = async (
  ctx: Pick<ActionCtx, 'runMutation'>,
  responseId: Id<'messages'>,
  integration: ChatIntegration,
  chunks: string[],
  signal: AbortSignal,
): Promise<ChatDeliveryResult> => {
  try {
    for (const chunk of chunks) {
      const externalMessageId = await integration.sendText(chunk, signal);
      await ctx.runMutation(internal.chats.recordDelivery, { responseId, externalMessageId });
    }
    return { delivery: 'sent' };
  } catch (error) {
    return {
      delivery:
        error instanceof IntegrationDeliveryError && !error.uncertain ? 'failed' : 'unknown',
      failure: classifyChatFailure(error, 'delivery'),
    };
  }
};

export const deliverChatResponse = async (
  ctx: Pick<ActionCtx, 'runMutation'>,
  responseId: Id<'messages'>,
  integration: ChatIntegration,
  text: string,
): Promise<ChatDeliveryResult> => {
  try {
    const chunks = integration.splitText?.(text) ?? [text];
    const signal = AbortSignal.timeout(DELIVERY_TIMEOUT_MS);
    await ctx.runMutation(internal.chats.prepareDelivery, { responseId, text });
    return await sendChunks(ctx, responseId, integration, chunks, signal);
  } catch (error) {
    return { delivery: 'failed', failure: classifyChatFailure(error, 'delivery') };
  }
};

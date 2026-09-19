'use node';

import { internal } from '#convex/_generated/api';
import type { Doc } from '#convex/_generated/dataModel';
import type { ActionCtx } from '#convex/_generated/server';
import { classifyChatFailure } from '#convex/chat/errors';
import { buildModelMessages, generateReply } from '#convex/chat/generation';
import { prepareChatImages } from '#convex/chat/images';
import { GENERATION_TIMEOUT_MS } from '#convex/chat/policy';
import { startReplyProgress } from '#convex/chat/progress';
import type { ChatFailure, ChatIntegration, PreparedChatResponse } from '#convex/chat/types';

const unsupportedReply =
  'I can help with text and JPEG, PNG, or WebP images up to 10 MB. Please send one of those instead.';
const failureReply = 'Sorry, I couldn’t complete that request. Please try again.';

const getFailureReply = (failure: ChatFailure): string => {
  switch (failure.code) {
    case 'too_large':
    case 'unsupported_format':
      return unsupportedReply;
    case 'unsupported_channel':
      return 'This channel supports text only. Please describe the image in a text message.';
    default:
      return failureReply;
  }
};

export const prepareChatResponse = async (
  ctx: Pick<ActionCtx, 'storage' | 'runMutation' | 'runQuery'>,
  message: Doc<'messages'>,
  integration: ChatIntegration,
): Promise<PreparedChatResponse> => {
  if (message.unsupported) return { text: unsupportedReply };

  const signal = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const progress = startReplyProgress(integration, signal);
  try {
    await prepareChatImages(ctx, message, integration, signal);
    const history = await ctx.runQuery(internal.chats.history, { messageId: message._id });
    const modelMessages = await buildModelMessages(history, async (storageId) => {
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new Error('Image is unavailable');
      return new Uint8Array(await blob.arrayBuffer());
    });
    return {
      text: await generateReply({
        messages: modelMessages,
        signal,
        onText: progress.update,
      }),
    };
  } catch (error) {
    const failure = classifyChatFailure(error, 'generation');
    return { text: getFailureReply(failure), failure };
  } finally {
    await progress.stop();
  }
};

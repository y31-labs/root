import type { Doc } from '#convex/_generated/dataModel';
import type { ChatIntegration } from '#convex/chat/types';
import { createTelegramIntegration } from '#convex/integrations/telegram/adapter';

export const getChatIntegration = (
  channel: Doc<'chatChannels'>,
  message: Doc<'messages'>,
): ChatIntegration => {
  switch (channel.provider) {
    case 'telegram':
      return createTelegramIntegration(channel, message);
    default:
      throw new Error('Unsupported integration');
  }
};

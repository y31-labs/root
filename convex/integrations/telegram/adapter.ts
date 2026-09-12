import type { Doc } from '#convex/_generated/dataModel';
import type { ChatIntegration } from '#convex/chat/types';
import { createTelegramClient } from '#convex/integrations/telegram/client';
import { downloadTelegramImage } from '#convex/integrations/telegram/images';
import {
  TELEGRAM_DRAFT_INTERVAL_MS,
  TELEGRAM_TYPING_INTERVAL_MS,
} from '#convex/integrations/telegram/policy';
import { splitTelegramText } from '#convex/integrations/telegram/text';

export const createTelegramIntegration = (
  channel: Doc<'chatChannels'>,
  message: Doc<'messages'>,
): ChatIntegration => {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const telegram = createTelegramClient(token);
  if (token.split(':')[0] !== channel.integrationAccountId)
    throw new Error('Integration account mismatch');
  const chatId = Number(channel.externalConversationId);
  const draftId = Number(message.externalMessageId);
  if (!Number.isSafeInteger(chatId) || !Number.isSafeInteger(draftId) || draftId <= 0)
    throw new Error('Invalid Telegram route');

  return {
    splitText: splitTelegramText,
    downloadImage: (source, signal) => downloadTelegramImage(telegram, source, signal),
    typing: {
      intervalMs: TELEGRAM_TYPING_INTERVAL_MS,
      send: async (signal) => {
        await telegram.call('sendChatAction', { chat_id: chatId, action: 'typing' }, signal);
      },
    },
    draft: {
      intervalMs: TELEGRAM_DRAFT_INTERVAL_MS,
      send: async (text, signal) => {
        const preview = splitTelegramText(text).at(-1)!;
        await telegram.call(
          'sendRichMessageDraft',
          { chat_id: chatId, draft_id: draftId, rich_message: { markdown: preview } },
          signal,
        );
      },
    },
    sendText: async (text, signal) => {
      const result = await telegram.call(
        'sendRichMessage',
        {
          chat_id: chatId,
          rich_message: { markdown: text },
        },
        signal,
      );
      return String(result.message_id);
    },
  };
};

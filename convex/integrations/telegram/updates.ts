import type { InboundMessage, SourceImage } from '#convex/chat/types';
import {
  TELEGRAM_IMAGE_TYPES,
  TELEGRAM_UNSUPPORTED_ATTACHMENTS,
} from '#convex/integrations/telegram/policy';
import type { TelegramUpdate } from '#convex/integrations/telegram/types';

export const parseTelegramUpdate = (
  update: TelegramUpdate,
  botId: string,
): InboundMessage | null => {
  const message = update.message;
  if (!message) return null;
  const { chat, from: sender, document } = message;
  if (chat.type !== 'private' || !sender || sender.is_bot) return null;
  // Personal chat routing requires the conversation to belong to its sender.
  if (chat.id !== sender.id) throw new Error('Invalid private chat');

  const text = message.text ?? message.caption;
  const photo = message.photo?.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const file =
    document?.mime_type && TELEGRAM_IMAGE_TYPES.has(document.mime_type) ? document : photo;
  const image: SourceImage | undefined = file
    ? {
        externalFileId: file.file_id,
        ...(file.file_size !== undefined ? { size: file.file_size } : {}),
      }
    : undefined;
  const unsupported =
    !image && TELEGRAM_UNSUPPORTED_ATTACHMENTS.some((key) => message[key] !== undefined);
  if (!image && !text && !unsupported) return null;

  return {
    provider: 'telegram',
    conversationScope: 'personal',
    integrationAccountId: botId,
    externalConversationId: String(chat.id),
    externalAccountId: String(sender.id),
    externalEventId: String(update.update_id),
    externalMessageId: String(message.message_id),
    ...(message.media_group_id ? { externalMediaGroupId: message.media_group_id } : {}),
    parts: text ? [{ type: 'text', text }] : [],
    ...(image ? { image } : {}),
    ...(unsupported ? { unsupported: true } : {}),
  };
};

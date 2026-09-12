import { internal } from '#convex/_generated/api';
import type { Doc } from '#convex/_generated/dataModel';
import type { ActionCtx } from '#convex/_generated/server';
import { ImageInputError } from '#convex/chat/errors';
import type { ChatIntegration, StoredImage } from '#convex/chat/types';

export const prepareChatImages = async (
  ctx: Pick<ActionCtx, 'storage' | 'runMutation'>,
  message: Doc<'messages'>,
  integration: ChatIntegration,
  signal: AbortSignal,
): Promise<void> => {
  const sources = message.mediaGroupItems
    ? message.mediaGroupItems.flatMap((item) => (item.image ? [item.image] : []))
    : message.sourceImage
      ? [message.sourceImage]
      : [];
  if (!sources.length) return;
  if (!integration.downloadImage) throw new ImageInputError('unsupported_channel');

  const images: StoredImage[] = [];
  try {
    for (const source of sources) {
      const image = await integration.downloadImage(source, signal);
      images.push({ storageId: await ctx.storage.store(image), mediaType: image.type });
    }
    await ctx.runMutation(internal.chats.attachImages, { messageId: message._id, images });
  } catch (error) {
    const cleanup = await Promise.allSettled(
      images.map(async (image) => ctx.storage.delete(image.storageId)),
    );
    cleanup.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('Chat image cleanup failed', {
          messageId: message._id,
          storageId: images[index]!.storageId,
          code: 'failed',
        });
      }
    });
    throw error;
  }
};

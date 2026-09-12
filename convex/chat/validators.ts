import { v } from 'convex/values';

export const messagePart = v.union(
  v.object({ type: v.literal('text'), text: v.string() }),
  v.object({
    type: v.literal('image'),
    storageId: v.id('_storage'),
    mediaType: v.string(),
  }),
);

export const sourceImage = v.object({
  externalFileId: v.string(),
  size: v.optional(v.number()),
});

export const mediaGroupItem = v.object({
  externalEventId: v.string(),
  externalMessageId: v.string(),
  parts: v.array(messagePart),
  image: v.optional(sourceImage),
});

export const conversationScope = v.union(
  v.literal('personal'),
  v.literal('direct'),
  v.literal('group'),
);

export const inboundMessage = v.object({
  provider: v.string(),
  integrationAccountId: v.string(),
  externalConversationId: v.string(),
  externalAccountId: v.string(),
  conversationScope,
  externalEventId: v.string(),
  externalMessageId: v.string(),
  externalMediaGroupId: v.optional(v.string()),
  parts: v.array(messagePart),
  image: v.optional(sourceImage),
  unsupported: v.optional(v.boolean()),
});

export const messageStatus = v.union(
  v.literal('queued'),
  v.literal('processing'),
  v.literal('completed'),
  v.literal('failed'),
);

export const deliveryStatus = v.union(
  v.literal('pending'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('failed'),
  v.literal('unknown'),
);

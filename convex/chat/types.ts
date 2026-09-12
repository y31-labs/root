import type { ImagePart, ModelMessage, TextPart } from '@tanstack/ai';
import type { Infer } from 'convex/values';

import type { Doc, Id } from '#convex/_generated/dataModel';
import type { deliveryStatus, inboundMessage, sourceImage } from '#convex/chat/validators';

export type InboundMessage = Infer<typeof inboundMessage>;
export type SourceImage = Infer<typeof sourceImage>;
export type DeliveryStatus = Infer<typeof deliveryStatus>;
export type DeliveryOutcome = Extract<DeliveryStatus, 'sent' | 'failed' | 'unknown'>;
export type ResponseStage = 'generation' | 'delivery';
export type ChatGenerationErrorCode = 'access_denied' | 'failed' | 'aborted';
export type ImageInputErrorCode = 'too_large' | 'unsupported_format' | 'unsupported_channel';

export type ChatFailure = {
  code: ChatGenerationErrorCode | ImageInputErrorCode;
  message: string;
  statusCode?: number;
};

export type ChatFailureContext = {
  messageId: Id<'messages'>;
  model: string;
  stage: ResponseStage;
};

export type PreparedChatResponse = {
  text: string;
  failure?: ChatFailure;
};

export type ChatDeliveryResult = {
  delivery: DeliveryOutcome;
  failure?: ChatFailure;
};

export type ChatModelContentPart = TextPart | ImagePart;
export type ChatModelMessage = ModelMessage<string | ChatModelContentPart[]>;
export type ChatHistoryMessage = Pick<Doc<'messages'>, 'role' | 'parts'>;

export type StoredImage = {
  storageId: Id<'_storage'>;
  mediaType: string;
};

export type ChatRoute = {
  channel: Doc<'chatChannels'>;
  identity: Doc<'identities'>;
};

export type ChatTurn = {
  message: Doc<'messages'>;
  channel: Doc<'chatChannels'>;
  responseId: Id<'messages'>;
};

export type ChatIntegration = {
  splitText?: (text: string) => string[];
  downloadImage?: (image: SourceImage, signal: AbortSignal) => Promise<Blob>;
  typing?: { intervalMs: number; send: (signal: AbortSignal) => Promise<void> };
  draft?: { intervalMs: number; send: (text: string, signal: AbortSignal) => Promise<void> };
  sendText: (text: string, signal: AbortSignal) => Promise<string>;
};

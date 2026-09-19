'use node';

import { Buffer } from 'node:buffer';

import type { Id } from '#convex/_generated/dataModel';
import type {
  ChatHistoryMessage,
  ChatModelContentPart,
  ChatModelMessage,
} from '#convex/chat/types';

export { generateReply } from '#convex/chat/textGeneration';

export const buildModelMessages = async (
  history: ChatHistoryMessage[],
  readImage: (storageId: Id<'_storage'>) => Promise<Uint8Array>,
): Promise<ChatModelMessage[]> => {
  const currentImages = history.at(-1)?.parts.filter((part) => part.type === 'image') ?? [];
  const selected = new Set(
    history
      .filter((message) => message.role === 'user')
      .flatMap((message) => message.parts.filter((part) => part.type === 'image'))
      .slice(-Math.max(4, currentImages.length)),
  );
  const result: ChatModelMessage[] = [];
  for (const message of history) {
    if (message.role === 'assistant') {
      result.push({
        role: 'assistant',
        content: message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join(''),
      });
      continue;
    }
    const content: ChatModelContentPart[] = [];
    for (const part of message.parts) {
      if (part.type === 'text') content.push({ type: 'text', content: part.text });
      else if (selected.has(part))
        content.push({
          type: 'image',
          source: {
            type: 'data',
            value: Buffer.from(await readImage(part.storageId)).toString('base64'),
            mimeType: part.mediaType,
          },
        });
      else content.push({ type: 'text', content: '[Earlier image omitted]' });
    }
    result.push({ role: 'user', content });
  }
  return result;
};

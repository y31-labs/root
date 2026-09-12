'use node';

import { Buffer } from 'node:buffer';

import { chat } from '@tanstack/ai';
import { createVercelGatewayText } from '@tanstack/ai-vercel-gateway';

import type { Id } from '#convex/_generated/dataModel';
import { ChatGenerationError, classifyGenerationError } from '#convex/chat/errors';
import type {
  ChatHistoryMessage,
  ChatModelContentPart,
  ChatModelMessage,
} from '#convex/chat/types';

export const CHAT_MODEL = 'zai/glm-5.3-flash';
const SYSTEM_PROMPT =
  'You are Austi, a helpful general assistant. Respond clearly and concisely in the user’s language. Use the conversation and attached images to answer. Ask a brief clarification when necessary. Be honest about uncertainty and your capabilities.';

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

export const generateReply = async (
  messages: ChatModelMessage[],
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<string> => {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new ChatGenerationError('access_denied');
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let text = '';
  let statusCode: number | undefined;
  try {
    const stream = chat({
      adapter: createVercelGatewayText(CHAT_MODEL, apiKey, {
        api: 'chat',
        maxRetries: 0,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          // AG-UI may expose a symbolic provider code instead of the HTTP status.
          statusCode = response.ok ? undefined : response.status;
          return response;
        },
      }),
      systemPrompts: [SYSTEM_PROMPT],
      messages,
      abortController,
      modelOptions: { max_tokens: 4096 },
      debug: false,
    });
    for await (const part of stream) {
      if (part.type === 'RUN_ERROR') throw classifyGenerationError(statusCode, part.code);
      if (part.type === 'TEXT_MESSAGE_CONTENT') {
        text += part.delta;
        onText(text);
      }
    }
  } catch (error) {
    if (signal.aborted) throw new ChatGenerationError('aborted');
    if (error instanceof ChatGenerationError) throw error;
    throw classifyGenerationError(statusCode);
  } finally {
    signal.removeEventListener('abort', abort);
  }
  if (signal.aborted) throw new ChatGenerationError('aborted');
  if (!text.trim()) throw new ChatGenerationError('failed');
  return text;
};

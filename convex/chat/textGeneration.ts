import { chat, type StreamChunk } from '@tanstack/ai';
import { createVercelGatewayText } from '@tanstack/ai-vercel-gateway';

import { ChatGenerationError, classifyGenerationError } from '#convex/chat/errors';
import { CHAT_MODEL, GENERATION_POLICY } from '#convex/chat/policy';
import type { ChatModelMessage } from '#convex/chat/types';

interface GenerateReplyProps {
  messages: ChatModelMessage[];
  policy?: GENERATION_POLICY;
  signal: AbortSignal;
  onText?: (text: string) => void;
}

export const streamReply = async function* ({
  messages,
  policy: { systemPrompt, maxTokens } = GENERATION_POLICY.default,
  signal,
}: GenerateReplyProps): AsyncGenerator<StreamChunk> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new ChatGenerationError('missing_api_key');

  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let text = '';
  let finished: StreamChunk | undefined;
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
      systemPrompts: [systemPrompt],
      messages,
      abortController,
      modelOptions: { max_tokens: maxTokens },
      debug: false,
    });
    for await (const part of stream) {
      if (part.type === 'RUN_ERROR') throw classifyGenerationError(statusCode, part.code);
      if (part.type === 'TEXT_MESSAGE_CONTENT') {
        text += part.delta;
      }
      if (part.type === 'RUN_FINISHED') finished = part;
      else yield part;
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
  if (finished) yield finished;
};

export const generateReply = async (props: GenerateReplyProps): Promise<string> => {
  let text = '';
  try {
    for await (const part of streamReply(props)) {
      if (part.type === 'TEXT_MESSAGE_CONTENT') {
        text += part.delta;
        props.onText?.(text);
      }
    }
  } catch (error) {
    if (props.signal.aborted) throw new ChatGenerationError('aborted');
    if (error instanceof ChatGenerationError) throw error;
    throw classifyGenerationError(undefined);
  }
  return text;
};

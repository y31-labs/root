import { fetchServerSentEvents } from '@tanstack/ai-react';
import { ConvexError } from 'convex/values';

import type { demoRequest } from '../../../../convex/integrations/demo/validators';

export type DemoRequest = (typeof demoRequest)['type'];

export const demoStreamUrl = (siteUrl?: string, convexUrl?: string): string | null => {
  try {
    const url = new URL(siteUrl || convexUrl || '');
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!siteUrl) {
      if (!url.hostname.endsWith('.convex.cloud')) return null;
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site');
    }
    return new URL('/demo/stream', url).href;
  } catch {
    return null;
  }
};

export const streamDemoText = async (
  url: string,
  request: DemoRequest,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<string> => {
  const connection = fetchServerSentEvents(url, {
    fetchClient: async (input, init) => {
      const response = await fetch(input, { ...init, body: JSON.stringify(request) });
      if (!response.ok) {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
          throw new ConvexError(body.error);
        throw new Error('Demo request failed');
      }
      return response;
    },
  });
  let text = '';
  let finished = false;
  for await (const part of connection.connect([], undefined, signal)) {
    if (signal.aborted) throw new Error('Response interrupted');
    if (part.type === 'RUN_ERROR') throw new Error('Response interrupted');
    if (part.type === 'TEXT_MESSAGE_CONTENT') {
      text += part.delta;
      onText(text);
    }
    if (part.type === 'RUN_FINISHED') finished = true;
  }
  if (signal.aborted || !finished || !text.trim()) throw new Error('Response interrupted');
  return text;
};

import { ConvexError } from 'convex/values';
import { useEffect, useRef, useState } from 'react';

import {
  MAX_MESSAGE_LENGTH,
  SEND_INTERVAL_MS,
  type DemoTurn,
  type LocalDemoSession,
} from './demo-session';
import { demoStreamUrl, streamDemoText, type DemoRequest } from './demo-stream';

const unavailable =
  'Live chat is temporarily unavailable. You can still explore the workflow examples.';

export const useDemoChat = (
  session: LocalDemoSession,
  onChange: (change: Partial<LocalDemoSession>) => void,
) => {
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const mounted = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  const current = useRef({ session, onChange });
  current.current = { session, onChange };
  const siteUrl = import.meta.env.PUBLIC_CONVEX_SITE_URL;
  const url = import.meta.env.PUBLIC_CONVEX_URL;
  const endpoint = demoStreamUrl(siteUrl, url);

  useEffect(() => {
    mounted.current = true;
    const { session: saved, onChange: update } = current.current;
    if (saved.turns.some((turn) => turn.status === 'thinking')) {
      update({
        turns: saved.turns.map((turn) =>
          turn.status === 'thinking' ? { ...turn, status: 'error' } : turn,
        ),
      });
    }
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  const send = async (text: string, retry: boolean, verificationToken: string) => {
    if (!endpoint || sending.current) return false;
    const active = current.current.session;
    const request = text.trim();
    const last = active.turns.at(-1);
    const reject = (message: string) => {
      setError(message);
      return false;
    };
    if (active.expiresAt <= Date.now()) return reject('This demo has expired. Start a new chat.');
    if (!request || request.length > MAX_MESSAGE_LENGTH)
      return reject(
        `Write a message between 1 and ${MAX_MESSAGE_LENGTH.toLocaleString('en-US')} characters.`,
      );
    if (last?.status === 'thinking') return false;
    if (retry && (last?.status !== 'error' || last.request !== request))
      return reject('This message cannot be retried.');
    if (active.lastSentAt !== null && Date.now() - active.lastSentAt < SEND_INTERVAL_MS)
      return reject('Please wait a few seconds before sending again.');

    sending.current = true;
    setError(null);
    const previous = retry ? active.turns.slice(0, -1) : active.turns;
    const turn: DemoTurn = { id: crypto.randomUUID(), request, reply: '', status: 'thinking' };
    const controller = new AbortController();
    inFlight.current = controller;
    let partialReply = '';
    current.current.onChange({ turns: [...previous, turn], lastSentAt: Date.now() });
    const isCurrent = () => mounted.current && current.current.session.token === active.token;
    try {
      const reply = await streamDemoText(
        endpoint,
        {
          token: active.token,
          history: [
            ...previous
              .filter((item) => item.status === 'ready')
              .flatMap<DemoRequest['history'][number]>(({ request, reply }) => [
                { role: 'user', content: request },
                { role: 'assistant', content: reply },
              ]),
            { role: 'user', content: request },
          ],
          verificationToken,
        },
        controller.signal,
        (reply) => {
          if (!isCurrent()) {
            controller.abort();
            return;
          }
          partialReply = reply;
          current.current.onChange({ turns: [...previous, { ...turn, reply }] });
        },
      );
      if (!isCurrent()) return false;
      current.current.onChange({ turns: [...previous, { ...turn, reply, status: 'ready' }] });
      return true;
    } catch (failure) {
      if (isCurrent()) {
        current.current.onChange({
          turns: [...previous, { ...turn, reply: partialReply, status: 'error' }],
        });
        setError(
          failure instanceof ConvexError && typeof failure.data === 'string'
            ? failure.data
            : unavailable,
        );
      }
      return false;
    } finally {
      controller.abort();
      sending.current = false;
      inFlight.current = null;
    }
  };

  return {
    turns: session.turns,
    connected: !!endpoint,
    error: error ?? (endpoint ? null : unavailable),
    busy: session.turns.some((turn) => turn.status === 'thinking'),
    send,
    configured: !!(siteUrl || url),
  };
};

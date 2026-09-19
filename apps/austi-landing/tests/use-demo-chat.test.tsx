import { act, cleanup, renderHook } from '@testing-library/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDemoSession, type LocalDemoSession } from '../src/lib/demo-session';
import { useDemoChat } from '../src/lib/use-demo-chat';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../src/lib/demo-stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/demo-stream')>()),
  streamDemoText: action,
}));

beforeEach(() => {
  vi.stubEnv('PUBLIC_CONVEX_URL', 'https://demo.convex.cloud');
  action.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const mountChat = (initial = createDemoSession()) =>
  renderHook(() => {
    const [session, setSession] = useState(initial);
    const onChange = (change: Partial<LocalDemoSession>) =>
      setSession((current) => ({ ...current, ...change }));
    return { session, chat: useDemoChat(session, onChange), onChange };
  });

it('sends local context and updates the local transcript without losing a concurrent draft', async () => {
  let complete!: (text: string) => void;
  action.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
  );
  const initial: LocalDemoSession = {
    ...createDemoSession(),
    turns: [{ id: 'first', request: 'A leak', reply: 'Which room?', status: 'ready' }],
  };
  const { result } = mountChat(initial);
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.chat.send('Kitchen', false, 'proof');
  });
  expect(result.current.chat.busy).toBe(true);
  expect(action.mock.calls[0]![1]).toEqual({
    token: initial.token,
    history: [
      { role: 'user', content: 'A leak' },
      { role: 'assistant', content: 'Which room?' },
      { role: 'user', content: 'Kitchen' },
    ],
    verificationToken: 'proof',
  });
  act(() => result.current.onChange({ draft: 'More details' }));
  await act(async () => {
    complete('Where is the leak?');
    expect(await pending).toBe(true);
  });
  expect(result.current.session.draft).toBe('More details');
  expect(result.current.session.turns.at(-1)).toMatchObject({
    request: 'Kitchen',
    reply: 'Where is the leak?',
    status: 'ready',
  });
  expect(result.current.chat.busy).toBe(false);
});

it('keeps failures locally and replaces the failed turn on retry', async () => {
  action.mockRejectedValueOnce(new Error('network failed')).mockResolvedValueOnce('A reply');
  const { result } = mountChat({
    ...createDemoSession(),
    turns: [{ id: 'first', request: 'Hello', reply: 'How can I help?', status: 'ready' }],
  });
  await act(async () => {
    expect(await result.current.chat.send('A leak', false, 'proof')).toBe(false);
  });
  expect(result.current.session.turns[1]?.status).toBe('error');
  act(() => result.current.onChange({ lastSentAt: Date.now() - 5001, draft: 'Unsent draft' }));
  await act(async () => {
    expect(await result.current.chat.send('A leak', true, 'new-proof')).toBe(true);
  });
  expect(result.current.session.turns).toHaveLength(2);
  expect(result.current.session.turns[1]?.status).toBe('ready');
  expect(result.current.session.draft).toBe('Unsent draft');
  expect(action.mock.calls[1]![1].history).toEqual([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'How can I help?' },
    { role: 'user', content: 'A leak' },
  ]);
});

it('sends the first message at the 1,024-character limit in history', async () => {
  action.mockResolvedValue('A reply');
  const { result } = mountChat();
  const text = 'a'.repeat(1024);
  await act(async () => {
    expect(await result.current.chat.send(text, false, 'proof')).toBe(true);
  });
  expect(action.mock.calls[0]![1]).toEqual({
    token: result.current.session.token,
    verificationToken: 'proof',
    history: [{ role: 'user', content: text }],
  });
});

it('rejects messages over 1,024 characters before sending', async () => {
  const { result } = mountChat();
  await act(async () => {
    expect(await result.current.chat.send('a'.repeat(1025), false, 'proof')).toBe(false);
  });
  expect(action).not.toHaveBeenCalled();
  expect(result.current.session.turns).toEqual([]);
  expect(result.current.chat.error).toBe('Write a message between 1 and 1,024 characters.');
});

it('displays backend validation errors for oversized history without changing the transcript', async () => {
  action.mockRejectedValue(new ConvexError('Message too long'));
  const previous = {
    id: 'first',
    request: 'Hello',
    reply: 'a'.repeat(1025),
    status: 'ready' as const,
  };
  const { result } = mountChat({ ...createDemoSession(), turns: [previous] });
  await act(async () => {
    expect(await result.current.chat.send('More details', false, 'proof')).toBe(false);
  });
  expect(result.current.chat.error).toBe('Message too long');
  expect(result.current.session.turns[0]).toEqual(previous);
  expect(result.current.session.turns[1]?.status).toBe('error');
});

it('makes a request interrupted by closing the demo retryable when reopened', () => {
  const initial: LocalDemoSession = {
    ...createDemoSession(),
    turns: [{ id: 'pending', request: 'A leak', reply: '', status: 'thinking' }],
  };
  const { result } = mountChat(initial);
  expect(result.current.session.turns[0]?.status).toBe('error');
  expect(result.current.chat.busy).toBe(false);
});

it('ignores a late reply after switching to a new conversation', async () => {
  let complete!: (text: string) => void;
  action.mockImplementation(
    () =>
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
  );
  const { result } = mountChat();
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.chat.send('A leak', false, 'proof');
  });
  act(() => result.current.onChange(createDemoSession()));
  await act(async () => {
    complete('Old reply');
    expect(await pending).toBe(false);
  });
  expect(result.current.session.turns).toEqual([]);
});

it('blocks duplicate submissions and enforces the local send interval', async () => {
  action.mockResolvedValue('A reply');
  const { result } = mountChat();
  await act(async () => {
    const first = result.current.chat.send('A leak', false, 'proof');
    expect(await result.current.chat.send('Duplicate', false, 'proof')).toBe(false);
    await first;
  });
  await act(async () => {
    expect(await result.current.chat.send('Too soon', false, 'proof')).toBe(false);
  });
  expect(action).toHaveBeenCalledTimes(1);
});

it('renders partial replies while busy and retains them after a stream failure', async () => {
  let update!: (text: string) => void;
  let fail!: (error: Error) => void;
  action.mockImplementation((_url, _request, _signal, onText) => {
    update = onText;
    return new Promise((_resolve, reject) => {
      fail = reject;
    });
  });
  const { result } = mountChat();
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.chat.send('A leak', false, 'proof');
  });
  act(() => update('Please turn off'));
  expect(result.current.session.turns[0]).toMatchObject({
    reply: 'Please turn off',
    status: 'thinking',
  });
  expect(result.current.chat.busy).toBe(true);
  await act(async () => {
    fail(new Error('Disconnected'));
    expect(await pending).toBe(false);
  });
  expect(result.current.session.turns[0]).toMatchObject({
    reply: 'Please turn off',
    status: 'error',
  });
});

it('cancels the streaming request when the demo closes', async () => {
  let signal!: AbortSignal;
  action.mockImplementation((_url, _request, abortSignal) => {
    signal = abortSignal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Cancelled')));
    });
  });
  const { result, unmount } = mountChat();
  let pending!: Promise<boolean>;
  act(() => {
    pending = result.current.chat.send('A leak', false, 'proof');
  });
  unmount();
  expect(signal.aborted).toBe(true);
  expect(await pending).toBe(false);
});

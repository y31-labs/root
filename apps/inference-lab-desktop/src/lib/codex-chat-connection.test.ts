import type { StreamChunk } from '@tanstack/ai/client';
import { describe, expect, it, vi } from 'vitest';

import {
  CODEX_ACTIVITY_DELTA_EVENT,
  CODEX_ACTIVITY_EVENT,
  CODEX_APPROVAL_EVENT,
  CODEX_REASONING_DELTA_EVENT,
  CodexChatConnection,
  createCodexStreamTranslator,
  createCodexTextPartId,
} from '#/lib/codex-chat-connection';
import type { ChatStreamEvent } from '#/lib/types';

const runContext = {
  runId: 'agui-run-1',
  threadId: 'agui-thread-1',
};

const createTranslator = () =>
  createCodexStreamTranslator({
    assistantMessageId: 'message-2',
    model: 'gpt-5.6-terra',
    ...runContext,
  });

describe('createCodexStreamTranslator', () => {
  it('emits one complete run and text lifecycle', () => {
    const translator = createTranslator();
    const chunks = [
      ...translator.translate({
        type: 'started',
        threadId: 'codex-thread-1',
        turnId: 'codex-turn-1',
      }),
      ...translator.translate({ type: 'messageDelta', id: 'message-1', text: 'Hello' }),
      ...translator.translate({ type: 'messageDelta', id: 'message-1', text: ' world' }),
      ...translator.translate({ type: 'completed' }),
      ...translator.translate({ type: 'completed' }),
    ];

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(chunks[0]).toMatchObject(runContext);
    expect(chunks[1]).toMatchObject({
      messageId: createCodexTextPartId('message-2', 'message-1'),
    });
    expect(chunks.at(-1)).toMatchObject(runContext);
  });

  it('keeps reasoning summary indexes in keyed custom events', () => {
    const translator = createTranslator();
    const chunks = [
      ...translator.translate({
        type: 'reasoningDelta',
        id: 'reasoning:1',
        summaryIndex: 0,
        text: 'First',
      }),
      ...translator.translate({
        type: 'reasoningDelta',
        id: 'reasoning:1',
        summaryIndex: 1,
        text: 'Second',
      }),
      ...translator.translate({
        type: 'reasoningDelta',
        id: 'reasoning:1',
        summaryIndex: 0,
        text: ' summary',
      }),
      ...translator.finish(),
    ];
    expect(chunks.filter((chunk) => chunk.type === 'CUSTOM')).toMatchObject([
      {
        name: CODEX_REASONING_DELTA_EVENT,
        value: {
          assistantMessageId: 'message-2',
          id: 'reasoning:1',
          summaryIndex: 0,
          delta: 'First',
        },
      },
      {
        name: CODEX_REASONING_DELTA_EVENT,
        value: {
          assistantMessageId: 'message-2',
          id: 'reasoning:1',
          summaryIndex: 1,
          delta: 'Second',
        },
      },
      {
        name: CODEX_REASONING_DELTA_EVENT,
        value: {
          assistantMessageId: 'message-2',
          id: 'reasoning:1',
          summaryIndex: 0,
          delta: ' summary',
        },
      },
    ]);
  });

  it('preserves activities, deltas, and approval semantics as custom events', () => {
    const translator = createTranslator();
    const events: ChatStreamEvent[] = [
      {
        type: 'activity',
        id: 'command-1',
        kind: 'command',
        label: 'bun test',
        status: 'running',
      },
      { type: 'activityDelta', id: 'command-1', delta: '12 passed' },
      {
        type: 'approval',
        requestId: 42,
        method: 'item/commandExecution/requestApproval',
        title: 'Allow command?',
      },
    ];
    const chunks = events.flatMap((event) => translator.translate(event));

    expect(chunks.filter((chunk) => chunk.type === 'CUSTOM')).toMatchObject([
      {
        name: CODEX_ACTIVITY_EVENT,
        value: {
          assistantMessageId: 'message-2',
          activity: { id: 'command-1', label: 'bun test', status: 'running' },
        },
      },
      {
        name: CODEX_ACTIVITY_DELTA_EVENT,
        value: { assistantMessageId: 'message-2', id: 'command-1', delta: '12 passed' },
      },
      {
        name: CODEX_APPROVAL_EVENT,
        value: {
          assistantMessageId: 'message-2',
          approval: {
            requestId: 42,
            method: 'item/commandExecution/requestApproval',
          },
        },
      },
    ]);
  });
});

describe('CodexChatConnection', () => {
  it('snapshots request settings and retains the Codex thread identity', async () => {
    const streamChatText = vi.fn(
      async (
        _text: string,
        _attachments: unknown[],
        _workingDirectory: string | undefined,
        _threadId: string | undefined,
        _settings: unknown,
        _permissionMode: unknown,
        onEvent: (event: ChatStreamEvent) => void,
      ) => {
        onEvent({
          type: 'started',
          threadId: 'codex-thread-started',
          turnId: 'codex-turn-1',
        });
        onEvent({ type: 'messageDelta', id: 'message-1', text: 'Done' });
        onEvent({ type: 'completed' });
        return { threadId: 'codex-thread-finished' };
      },
    );
    const connection = new CodexChatConnection({
      api: { interruptCodexTurn: vi.fn(async () => undefined), streamChatText },
      getConfig: () => ({
        permissionMode: 'workspace-write',
        settings: { model: 'gpt-5.6-terra', effort: 'high', speed: 'fast' },
        workingDirectory: '/Users/example/project',
      }),
    });
    connection.prepareSubmission({
      assistantMessageId: 'message-2',
      attachments: [
        {
          dataUrl: 'data:text/plain;base64,dGVzdA==',
          filename: 'test.txt',
          mediaType: 'text/plain',
        },
      ],
      id: 'message-1',
      text: 'Build it',
    });

    const chunks = await collect(connection.connect([], undefined, undefined, runContext));

    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED');
    expect(connection.threadId).toBe('codex-thread-finished');
    expect(streamChatText).toHaveBeenCalledWith(
      'Build it',
      [
        {
          dataUrl: 'data:text/plain;base64,dGVzdA==',
          filename: 'test.txt',
          mediaType: 'text/plain',
        },
      ],
      '/Users/example/project',
      undefined,
      { model: 'gpt-5.6-terra', effort: 'high', speed: 'fast' },
      'workspace-write',
      expect.any(Function),
    );
  });

  it('finishes defensively when the command omits completed', async () => {
    const onMissingCompletion = vi.fn();
    const connection = new CodexChatConnection({
      api: {
        interruptCodexTurn: vi.fn(async () => undefined),
        streamChatText: async (...args) => {
          args[6]({ type: 'messageDelta', id: 'message-1', text: 'Partial' });
          return { threadId: 'codex-thread-1' };
        },
      },
      getConfig: () => ({ permissionMode: 'read-only' }),
      onMissingCompletion,
    });
    connection.prepareSubmission({
      assistantMessageId: 'message-2',
      attachments: [],
      id: 'message-1',
      text: 'Hello',
    });

    const chunks = await collect(connection.connect([], undefined, undefined, runContext));

    expect(onMissingCompletion).toHaveBeenCalledOnce();
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
  });

  it('throws one transport failure after yielding partial output', async () => {
    const connection = new CodexChatConnection({
      api: {
        interruptCodexTurn: vi.fn(async () => undefined),
        streamChatText: async (...args) => {
          args[6]({ type: 'messageDelta', id: 'message-1', text: 'Partial' });
          throw new Error('transport failed');
        },
      },
      getConfig: () => ({ permissionMode: 'read-only' }),
    });
    connection.prepareSubmission({
      assistantMessageId: 'message-2',
      attachments: [],
      id: 'message-1',
      text: 'Hello',
    });
    const chunks: StreamChunk[] = [];

    await expect(
      (async () => {
        for await (const chunk of connection.connect([], undefined, undefined, runContext)) {
          chunks.push(chunk);
        }
      })(),
    ).rejects.toThrow('transport failed');
    expect(chunks.some((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')).toBe(true);
  });

  it('ignores late channel events after abort', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let finish: (() => void) | undefined;
    const request = new Promise<{ threadId: string }>((resolve) => {
      finish = () => resolve({ threadId: 'late-thread' });
    });
    const interruptCodexTurn = vi.fn(async () => undefined);
    const connection = new CodexChatConnection({
      api: {
        interruptCodexTurn,
        streamChatText: async (...args) => {
          emit = args[6];
          return request;
        },
      },
      getConfig: () => ({ permissionMode: 'read-only' }),
    });
    connection.prepareSubmission({
      assistantMessageId: 'message-2',
      attachments: [],
      id: 'message-1',
      text: 'Hello',
    });
    const abortController = new AbortController();
    const collecting = collect(
      connection.connect([], undefined, abortController.signal, runContext),
    );

    emit?.({ type: 'started', threadId: 'codex-thread-1', turnId: 'codex-turn-1' });
    emit?.({ type: 'messageDelta', id: 'message-1', text: 'Before abort' });
    await Promise.resolve();
    await Promise.resolve();
    abortController.abort();
    emit?.({ type: 'messageDelta', id: 'message-1', text: 'After abort' });
    finish?.();

    const chunks = await collecting;
    expect(chunks.filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')).toHaveLength(1);
    expect(interruptCodexTurn).toHaveBeenCalledWith('codex-thread-1', 'codex-turn-1');
  });

  it('interrupts a late-starting turn and does not restore its thread after reset', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let finish: (() => void) | undefined;
    const request = new Promise<{ threadId: string }>((resolve) => {
      finish = () => resolve({ threadId: 'stale-thread' });
    });
    const interruptCodexTurn = vi.fn(async () => undefined);
    const connection = new CodexChatConnection({
      api: {
        interruptCodexTurn,
        streamChatText: async (...args) => {
          emit = args[6];
          return request;
        },
      },
      getConfig: () => ({ permissionMode: 'read-only' }),
    });
    connection.prepareSubmission({
      assistantMessageId: 'message-2',
      attachments: [],
      id: 'message-1',
      text: 'Hello',
    });
    const collecting = collect(connection.connect([], undefined, undefined, runContext));

    connection.resetThread();
    emit?.({ type: 'started', threadId: 'stale-thread', turnId: 'stale-turn' });
    finish?.();
    await collecting;

    expect(interruptCodexTurn).toHaveBeenCalledWith('stale-thread', 'stale-turn');
    expect(connection.threadId).toBeUndefined();
  });
});

const collect = async (stream: AsyncIterable<StreamChunk>) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

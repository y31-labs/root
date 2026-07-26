import type { StreamChunk } from '@tanstack/ai/client';
import { describe, expect, it, vi } from 'vitest';

import { createCodexChatConnection } from '#/lib/codex-chat-connection';
import {
  CODEX_ACTIVITY_DELTA_EVENT,
  CODEX_ACTIVITY_EVENT,
  CODEX_APPROVAL_EVENT,
  CODEX_REASONING_DELTA_EVENT,
  createCodexStreamTranslator,
  createCodexTextPartId,
} from '#/lib/codex-stream-translator';
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
  it('starts a native background run and streams it through the subscription', async () => {
    const startCodexText = vi.fn(async () => runInfo);
    const connection = createCodexChatConnection({
      api: {
        getCodexRun: vi.fn(async () => null),
        interruptCodexTurn: vi.fn(async () => undefined),
        startCodexText,
        streamCodexRun: async (_runId, onEvent) => {
          onEvent({
            type: 'started',
            threadId: 'codex-thread-1',
            turnId: 'codex-turn-1',
          });
          onEvent({ type: 'messageDelta', id: 'message-1', text: 'Done' });
          onEvent({ type: 'completed' });
          return { threadId: 'codex-thread-1' };
        },
      },
      getConfig: () => ({
        chatId: 'chat-1',
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

    const chunksPromise = collectUntilTerminal(connection.subscribe());
    await connection.send([], undefined, undefined, runContext);
    const chunks = await chunksPromise;

    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED');
    expect(connection.threadId).toBe('codex-thread-1');
    expect(startCodexText).toHaveBeenCalledWith(
      'chat-1',
      'message-2',
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
    );
  });

  it('replays a run when its chat is restored after navigation', async () => {
    const connection = createCodexChatConnection({
      api: {
        getCodexRun: vi.fn(async () => ({ ...runInfo, active: true })),
        interruptCodexTurn: vi.fn(async () => undefined),
        startCodexText: vi.fn(async () => runInfo),
        streamCodexRun: async (_runId, onEvent) => {
          onEvent({
            type: 'started',
            threadId: 'codex-thread-1',
            turnId: 'codex-turn-1',
          });
          onEvent({ type: 'messageDelta', id: 'message-1', text: 'Replayed' });
          onEvent({ type: 'completed' });
          return { threadId: 'codex-thread-1' };
        },
      },
      getConfig: () => ({ chatId: 'chat-1', permissionMode: 'read-only' }),
    });
    connection.restoreChat('chat-1', 'codex-thread-1', runInfo);

    const chunks = await collectUntilTerminal(connection.subscribe());
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
  });

  it('turns a native background failure into a terminal run error', async () => {
    const connection = createCodexChatConnection({
      api: {
        getCodexRun: vi.fn(async () => null),
        interruptCodexTurn: vi.fn(async () => undefined),
        startCodexText: vi.fn(async () => runInfo),
        streamCodexRun: async (_runId, onEvent) => {
          onEvent({ type: 'messageDelta', id: 'message-1', text: 'Partial' });
          throw new Error('transport failed');
        },
      },
      getConfig: () => ({ chatId: 'chat-1', permissionMode: 'read-only' }),
    });
    connection.prepareSubmission({
      assistantMessageId: 'message-2',
      attachments: [],
      id: 'message-1',
      text: 'Hello',
    });
    const chunksPromise = collectUntilTerminal(connection.subscribe());
    await connection.send([], undefined, undefined, runContext);
    const chunks = await chunksPromise;
    expect(chunks.some((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR', message: 'transport failed' });
  });

  it('detaches on navigation without interrupting the background turn', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let finish: (() => void) | undefined;
    const request = new Promise<{ threadId: string }>((resolve) => {
      finish = () => resolve({ threadId: 'late-thread' });
    });
    const interruptCodexTurn = vi.fn(async () => undefined);
    const connection = createCodexChatConnection({
      api: {
        getCodexRun: vi.fn(async () => null),
        interruptCodexTurn,
        startCodexText: vi.fn(async () => runInfo),
        streamCodexRun: async (_runId, onEvent) => {
          emit = onEvent;
          return request;
        },
      },
      getConfig: () => ({ chatId: 'chat-1', permissionMode: 'read-only' }),
    });
    connection.prepareSubmission({
      assistantMessageId: 'message-2',
      attachments: [],
      id: 'message-1',
      text: 'Hello',
    });
    const abortController = new AbortController();
    const collecting = collect(connection.subscribe(abortController.signal));
    await connection.send([], undefined, undefined, runContext);

    emit?.({ type: 'messageDelta', id: 'message-1', text: 'Before abort' });
    await Promise.resolve();
    await Promise.resolve();
    abortController.abort();
    emit?.({ type: 'messageDelta', id: 'message-1', text: 'After abort' });
    finish?.();

    const chunks = await collecting;
    expect(chunks.filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')).toHaveLength(1);
    expect(interruptCodexTurn).not.toHaveBeenCalled();

    connection.interruptActive();
    expect(interruptCodexTurn).toHaveBeenCalledWith('codex-thread-1', 'codex-turn-1');
  });
});

const runInfo = {
  runId: 'run-1',
  chatId: 'chat-1',
  threadId: 'codex-thread-1',
  turnId: 'codex-turn-1',
  assistantMessageId: 'message-2',
  model: 'gpt-5.6-terra',
};

const collect = async (stream: AsyncIterable<StreamChunk>) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

const collectUntilTerminal = async (stream: AsyncIterable<StreamChunk>) => {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') break;
  }
  return chunks;
};

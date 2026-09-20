import type { StreamChunk } from '@tanstack/ai/client';
import { describe, expect, it, vi } from 'vitest';

import { createCodexChatConnection } from '#/lib/codex-chat-connection';
import type { ChatStreamEvent } from '#/lib/types';

const runContext = {
  runId: 'agui-run-1',
  threadId: 'agui-thread-1',
};

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

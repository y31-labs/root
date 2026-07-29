import { describe, expect, it } from 'vitest';

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

import { describe, expect, it } from 'vitest';

import {
  applyChatEvent,
  chatErrorMessage,
  emptyTranscript,
  transcriptFromThread,
} from '#/lib/chat';

describe('chat transcript', () => {
  it('converts persisted Codex turns into messages and compact activity', () => {
    const transcript = transcriptFromThread({
      thread: {
        turns: [
          {
            items: [
              {
                id: 'user-1',
                type: 'userMessage',
                content: [{ type: 'text', text: 'Inspect this project' }],
              },
              { id: 'agent-1', type: 'agentMessage', text: 'I will inspect it.' },
              {
                id: 'command-1',
                type: 'commandExecution',
                command: 'rg --files',
                aggregatedOutput: 'src/main.ts',
              },
            ],
          },
        ],
      },
    });

    expect(transcript.items).toEqual([
      { id: 'user-1', type: 'message', role: 'user', text: 'Inspect this project' },
      { id: 'agent-1', type: 'message', role: 'assistant', text: 'I will inspect it.' },
      {
        id: 'command-1',
        type: 'activity',
        kind: 'command',
        label: 'rg --files',
        detail: 'src/main.ts',
        complete: true,
      },
    ]);
  });

  it('merges streamed deltas and ignores events from another thread', () => {
    const started = applyChatEvent(
      emptyTranscript(),
      {
        method: 'item/agentMessage/delta',
        params: { threadId: 'codex-1', itemId: 'agent-1', delta: 'Hello' },
      },
      'codex-1',
    );
    const continued = applyChatEvent(
      started,
      {
        method: 'item/agentMessage/delta',
        params: { threadId: 'codex-1', itemId: 'agent-1', delta: ' world' },
      },
      'codex-1',
    );
    const ignored = applyChatEvent(
      continued,
      {
        method: 'item/agentMessage/delta',
        params: { threadId: 'codex-2', itemId: 'agent-2', delta: 'Wrong thread' },
      },
      'codex-1',
    );

    expect(ignored.items).toEqual([
      { id: 'agent-1', type: 'message', role: 'assistant', text: 'Hello world' },
    ]);
  });

  it('surfaces approval requests as transcript items', () => {
    const transcript = applyChatEvent(
      emptyTranscript(),
      {
        id: 42,
        method: 'item/commandExecution/requestApproval',
        params: { threadId: 'codex-1', command: 'bun install' },
      },
      'codex-1',
    );

    expect(transcript.items[0]).toMatchObject({
      type: 'approval',
      requestId: 42,
      detail: 'bun install',
      resolved: false,
    });
  });

  it('preserves backend errors for the chat UI', () => {
    expect(chatErrorMessage(new Error('Codex is not authenticated'))).toBe(
      'Codex is not authenticated',
    );
    expect(chatErrorMessage('Protocol request failed')).toBe('Protocol request failed');
  });
});

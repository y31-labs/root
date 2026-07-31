// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCodexChat } from '#/hooks/use-codex-chat';
import { createLocalApi } from '#/lib/local-api';
import type { ChatStreamEvent } from '#/lib/types';
import { createCodexChatTestWrapper } from '#/test/codex-chat-test-wrapper';

afterEach(cleanup);

describe('useCodexChat', () => {
  it('adapts TanStack message state and delegates the request to the local API', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let resolveRequest: (result: unknown) => void = () => undefined;
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'start_codex_text') return Promise.resolve(runFromStartArgs(args));
      if (command === 'stream_codex_run') return request;
      return Promise.resolve();
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    const Wrapper = createCodexChatTestWrapper(api);

    const { result } = renderHook(
      () =>
        useCodexChat({
          permissionMode: 'workspace-write',
          settings: {
            model: 'gpt-5.6-terra',
            effort: 'medium',
            speed: 'standard',
          },
          workingDirectory: '/Users/example/project',
        }),
      { wrapper: Wrapper },
    );

    act(() =>
      result.current.submitPrompt({
        files: [
          {
            filename: 'brief.pdf',
            mediaType: 'application/pdf',
            type: 'file',
            url: 'data:application/pdf;base64,ZmlsZQ==',
          },
        ],
        text: '  Build an intake flow  ',
      }),
    );

    expect(result.current.pending).toBe(true);
    expect(result.current.messages).toEqual([
      {
        attachments: [
          {
            filename: 'brief.pdf',
            id: 'message-1-file-0',
            mediaType: 'application/pdf',
            type: 'file',
            url: 'data:application/pdf;base64,ZmlsZQ==',
          },
        ],
        id: 'message-1',
        role: 'user',
        text: 'Build an intake flow',
      },
      {
        id: 'message-2',
        role: 'assistant',
        startedAtMs: expect.any(Number),
        streaming: true,
        text: '',
      },
    ]);

    await waitFor(() => expect(emit).toBeDefined());

    act(() => emit?.({ type: 'started', threadId: 'thread-1', turnId: 'turn-1' }));
    act(() => emit?.({ type: 'messageDelta', id: 'message-1', text: 'I’ll inspect this.' }));

    act(() =>
      emit?.({
        type: 'activity',
        id: 'command-1',
        kind: 'command',
        label: 'bun test',
        status: 'running',
      }),
    );
    act(() => emit?.({ type: 'activityDelta', id: 'command-1', delta: '12 tests passed' }));
    act(() =>
      emit?.({
        type: 'activity',
        id: 'command-1',
        kind: 'command',
        label: 'bun test',
        status: 'succeeded',
      }),
    );
    act(() =>
      emit?.({
        type: 'reasoningDelta',
        id: 'reasoning-1',
        summaryIndex: 0,
        text: 'The first command passed.',
      }),
    );
    act(() =>
      emit?.({
        type: 'reasoningDelta',
        id: 'reasoning-1',
        summaryIndex: 1,
        text: 'A second',
      }),
    );
    act(() =>
      emit?.({
        type: 'reasoningDelta',
        id: 'reasoning-1',
        summaryIndex: 0,
        text: ' More detail.',
      }),
    );
    act(() =>
      emit?.({
        type: 'reasoningDelta',
        id: 'reasoning-1',
        summaryIndex: 1,
        text: ' summary.',
      }),
    );
    act(() => emit?.({ type: 'messageDelta', id: 'message-2', text: 'The first check passed.' }));
    act(() =>
      emit?.({
        type: 'activity',
        id: 'command-2',
        kind: 'command',
        label: 'bun run typecheck',
        status: 'running',
      }),
    );
    act(() => emit?.({ type: 'messageDelta', id: 'message-3', text: 'Done' }));
    await waitFor(() =>
      expect(result.current.messages[1]).toMatchObject({
        parts: [
          {
            type: 'message',
            id: 'message-1',
            text: 'I’ll inspect this.',
          },
          {
            type: 'activity',
            activities: [
              {
                id: 'command-1',
                kind: 'command',
                label: 'bun test',
                detail: '12 tests passed',
                status: 'succeeded',
              },
            ],
          },
          {
            type: 'reasoning',
            id: 'reasoning-1',
            summaries: ['The first command passed. More detail.', 'A second summary.'],
          },
          {
            type: 'message',
            id: 'message-2',
            text: 'The first check passed.',
          },
          {
            type: 'activity',
            activities: [
              {
                id: 'command-2',
                kind: 'command',
                label: 'bun run typecheck',
                status: 'running',
              },
            ],
          },
          {
            type: 'message',
            id: 'message-3',
            text: 'Done',
          },
        ],
      }),
    );

    act(() =>
      emit?.({
        type: 'approval',
        requestId: 42,
        method: 'item/commandExecution/requestApproval',
        title: 'Allow command?',
        detail: 'bun test',
      }),
    );
    await waitFor(() =>
      expect(result.current.messages[1]).toMatchObject({
        approvals: [
          {
            requestId: 42,
            method: 'item/commandExecution/requestApproval',
            title: 'Allow command?',
            detail: 'bun test',
            status: 'pending',
          },
        ],
      }),
    );

    act(() =>
      result.current.resolveApproval(
        42,
        'item/commandExecution/requestApproval',
        'acceptForSession',
      ),
    );
    await waitFor(() =>
      expect(result.current.messages[1]?.approvals?.[0]).toMatchObject({
        decision: 'acceptForSession',
        status: 'resolved',
      }),
    );
    expect(invoke).toHaveBeenCalledWith('resolve_codex_approval', {
      requestId: 42,
      method: 'item/commandExecution/requestApproval',
      decision: 'acceptForSession',
    });

    act(() => emit?.({ type: 'completed' }));
    act(() => resolveRequest({ threadId: 'thread-1' }));
    await waitFor(() => expect(result.current.pending).toBe(false));

    expect(result.current.messages[1]).toMatchObject({
      completedAtMs: expect.any(Number),
      streaming: false,
      text: '',
    });
    expect(invoke).toHaveBeenCalledWith('start_codex_text', {
      input: {
        chatId: expect.any(String),
        assistantMessageId: 'message-2',
        attachments: [
          {
            dataUrl: 'data:application/pdf;base64,ZmlsZQ==',
            filename: 'brief.pdf',
            mediaType: 'application/pdf',
          },
        ],
        prompt: 'Build an intake flow',
        settings: {
          model: 'gpt-5.6-terra',
          effort: 'medium',
          speed: 'standard',
        },
        permissionMode: 'workspace-write',
        workingDirectory: '/Users/example/project',
      },
    });
    expect(invoke).toHaveBeenCalledWith('stream_codex_run', {
      runId: 'run-1',
      onEvent: { id: 'channel-1' },
    });
  });
});

const runFromStartArgs = (
  args: Record<string, unknown> | undefined,
  runNumber = 1,
  threadId = 'thread-1',
) => {
  const input = args?.input as Record<string, unknown>;
  return {
    runId: `run-${runNumber}`,
    chatId: String(input.chatId),
    threadId,
    turnId: `turn-${runNumber}`,
    assistantMessageId: String(input.assistantMessageId),
    model: (input.settings as { model?: string } | undefined)?.model,
  };
};

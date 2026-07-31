// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCodexChat } from '#/hooks/use-codex-chat';
import { createLocalApi } from '#/lib/local-api';
import type { ChatStreamEvent } from '#/lib/types';
import { createCodexChatTestWrapper } from '#/test/codex-chat-test-wrapper';

afterEach(cleanup);

describe('useCodexChat submission lifecycle', () => {
  it('sends attachment-only prompts and blocks empty or concurrent submissions', async () => {
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

    const { result } = renderHook(() => useCodexChat({ permissionMode: 'read-only' }), {
      wrapper: Wrapper,
    });

    act(() => result.current.submitPrompt({ files: [], text: '   ' }));
    expect(result.current.messages).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();

    act(() =>
      result.current.submitPrompt({
        files: [
          {
            filename: 'layout.png',
            mediaType: 'image/png',
            type: 'file',
            url: 'data:image/png;base64,aW1hZ2U=',
          },
        ],
        text: '',
      }),
    );
    act(() => result.current.submitPrompt({ files: [], text: 'Do not send this' }));

    await waitFor(() => expect(emit).toBeDefined());
    expect(result.current.messages).toHaveLength(2);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith('start_codex_text', {
      input: {
        chatId: expect.any(String),
        assistantMessageId: 'message-2',
        attachments: [
          {
            dataUrl: 'data:image/png;base64,aW1hZ2U=',
            filename: 'layout.png',
            mediaType: 'image/png',
          },
        ],
        prompt: '',
        permissionMode: 'read-only',
      },
    });

    act(() => emit?.({ type: 'completed' }));
    act(() => resolveRequest({ threadId: 'thread-1' }));
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it('uses current settings, continues the Codex thread, and resets it with the workspace', async () => {
    const emissions: Array<(event: ChatStreamEvent) => void> = [];
    const requestResolvers: Array<(result: unknown) => void> = [];
    let runNumber = 0;
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'start_codex_text') {
        runNumber += 1;
        const input = args?.input as Record<string, unknown>;
        return Promise.resolve(
          runFromStartArgs(
            args,
            runNumber,
            typeof input.threadId === 'string' ? input.threadId : `codex-thread-${runNumber}`,
          ),
        );
      }
      if (command === 'stream_codex_run') {
        return new Promise<unknown>((resolve) => requestResolvers.push(resolve));
      }
      return Promise.resolve();
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emissions.push(onMessage as (event: ChatStreamEvent) => void);
      return { id: `channel-${emissions.length}` };
    });

    const Wrapper = createCodexChatTestWrapper(api);

    const { rerender, result } = renderHook(
      (options: {
        permissionMode: 'read-only' | 'workspace-write';
        settings: { model: string; effort: string; speed: 'standard' | 'fast' };
        workingDirectory: string;
      }) => useCodexChat(options),
      {
        initialProps: {
          permissionMode: 'read-only',
          settings: { model: 'model-1', effort: 'low', speed: 'standard' },
          workingDirectory: '/workspace/one',
        },
        wrapper: Wrapper,
      },
    );

    act(() => result.current.submitPrompt({ files: [], text: 'First' }));
    await waitFor(() => expect(emissions).toHaveLength(1));
    act(() =>
      emissions[0]?.({ type: 'started', threadId: 'codex-thread-1', turnId: 'codex-turn-1' }),
    );
    act(() => emissions[0]?.({ type: 'completed' }));
    act(() => requestResolvers[0]?.({ threadId: 'codex-thread-1' }));
    await waitFor(() => expect(result.current.pending).toBe(false));

    rerender({
      permissionMode: 'workspace-write',
      settings: { model: 'model-2', effort: 'high', speed: 'fast' },
      workingDirectory: '/workspace/one',
    });
    act(() => result.current.submitPrompt({ files: [], text: 'Second' }));
    await waitFor(() => expect(emissions).toHaveLength(2));
    const startCalls = invoke.mock.calls.filter(([command]) => command === 'start_codex_text');
    expect(startCalls[1]?.[1]).toMatchObject({
      input: {
        prompt: 'Second',
        threadId: 'codex-thread-1',
        settings: { model: 'model-2', effort: 'high', speed: 'fast' },
        permissionMode: 'workspace-write',
        workingDirectory: '/workspace/one',
      },
    });
    act(() =>
      emissions[1]?.({ type: 'started', threadId: 'codex-thread-1', turnId: 'codex-turn-2' }),
    );

    rerender({
      permissionMode: 'workspace-write',
      settings: { model: 'model-2', effort: 'high', speed: 'fast' },
      workingDirectory: '/workspace/two',
    });
    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
      expect(result.current.pending).toBe(false);
    });
    expect(invoke.mock.calls.some(([command]) => command === 'interrupt_codex_turn')).toBe(false);
    act(() => requestResolvers[1]?.({ threadId: 'codex-thread-1' }));

    act(() => result.current.submitPrompt({ files: [], text: 'Third' }));
    await waitFor(() => expect(emissions).toHaveLength(3));
    const updatedStartCalls = invoke.mock.calls.filter(
      ([command]) => command === 'start_codex_text',
    );
    expect(updatedStartCalls[2]?.[1]).toMatchObject({
      input: {
        prompt: 'Third',
        workingDirectory: '/workspace/two',
      },
    });
    expect(updatedStartCalls[2]?.[1]?.input).not.toHaveProperty('threadId');
    act(() => emissions[2]?.({ type: 'completed' }));
    act(() => requestResolvers[2]?.({ threadId: 'codex-thread-2' }));
    await waitFor(() => expect(result.current.pending).toBe(false));
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

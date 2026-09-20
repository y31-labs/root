// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCodexChat } from '#/hooks/use-codex-chat';
import { createLocalApi } from '#/lib/local-api';
import type { ChatStreamEvent } from '#/lib/types';
import { createCodexChatTestWrapper } from '#/test/codex-chat-test-wrapper';

afterEach(cleanup);

describe('useCodexChat interruption and recovery', () => {
  it('stops an active response and completes the current turn', async () => {
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

    act(() => result.current.submitPrompt({ files: [], text: 'Keep working' }));
    await waitFor(() => expect(emit).toBeDefined());
    act(() => emit?.({ type: 'started', threadId: 'thread-1', turnId: 'turn-1' }));
    act(() => result.current.stopResponse());

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.messages[1]).toMatchObject({
      completedAtMs: expect.any(Number),
      streaming: false,
    });
    expect(invoke).toHaveBeenCalledWith('interrupt_codex_turn', {
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    act(() => resolveRequest({ threadId: 'thread-1' }));
  });

  it('shows a transport failure once and allows a later submission', async () => {
    const emissions: Array<(event: ChatStreamEvent) => void> = [];
    let callCount = 0;
    let resolveSecondRequest: (result: unknown) => void = () => undefined;
    const secondRequest = new Promise<unknown>((resolve) => {
      resolveSecondRequest = resolve;
    });
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'start_codex_text')
        return Promise.resolve(runFromStartArgs(args, callCount + 1));
      if (command !== 'stream_codex_run') return Promise.resolve();
      callCount += 1;
      return callCount === 1 ? Promise.reject(new Error('Connection failed')) : secondRequest;
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emissions.push(onMessage as (event: ChatStreamEvent) => void);
      return { id: `channel-${emissions.length}` };
    });

    const Wrapper = createCodexChatTestWrapper(api);

    const { result } = renderHook(() => useCodexChat({ permissionMode: 'read-only' }), {
      wrapper: Wrapper,
    });

    act(() => result.current.submitPrompt({ files: [], text: 'First' }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(
      result.current.messages[1]?.parts?.flatMap((part) =>
        part.type === 'activity' ? part.activities : [],
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'error', label: 'Connection failed', status: 'failed' }),
    ]);

    act(() => result.current.submitPrompt({ files: [], text: 'Second' }));
    await waitFor(() => expect(emissions).toHaveLength(2));
    act(() => emissions[1]?.({ type: 'messageDelta', id: 'reply', text: 'Recovered' }));
    act(() => emissions[1]?.({ type: 'completed' }));
    act(() => resolveSecondRequest({ threadId: 'thread-2' }));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.messages[3]?.parts).toEqual([
      { type: 'message', id: 'reply', text: 'Recovered' },
    ]);
  });

  it('restores a failed approval so a different decision can be retried', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let resolveRequest: (result: unknown) => void = () => undefined;
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    let approvalAttempts = 0;
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'start_codex_text') return Promise.resolve(runFromStartArgs(args));
      if (command === 'stream_codex_run') return request;
      approvalAttempts += 1;
      return approvalAttempts === 1
        ? Promise.reject(new Error('Approval could not be sent'))
        : Promise.resolve();
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    const Wrapper = createCodexChatTestWrapper(api);

    const { result } = renderHook(() => useCodexChat({ permissionMode: 'read-only' }), {
      wrapper: Wrapper,
    });
    act(() => result.current.submitPrompt({ files: [], text: 'Run it' }));
    await waitFor(() => expect(emit).toBeDefined());
    act(() =>
      emit?.({
        type: 'approval',
        requestId: 'approval-1',
        method: 'item/fileChange/requestApproval',
        title: 'Allow file changes?',
      }),
    );
    await waitFor(() => expect(result.current.messages[1]?.approvals).toHaveLength(1));

    act(() =>
      result.current.resolveApproval('approval-1', 'item/fileChange/requestApproval', 'decline'),
    );
    await waitFor(() =>
      expect(result.current.messages[1]?.approvals?.[0]).toMatchObject({
        error: 'Approval could not be sent',
        status: 'pending',
      }),
    );

    act(() =>
      result.current.resolveApproval('approval-1', 'item/fileChange/requestApproval', 'accept'),
    );
    await waitFor(() =>
      expect(result.current.messages[1]?.approvals?.[0]).toMatchObject({
        decision: 'accept',
        error: undefined,
        status: 'resolved',
      }),
    );
    expect(invoke).toHaveBeenCalledWith('resolve_codex_approval', {
      requestId: 'approval-1',
      method: 'item/fileChange/requestApproval',
      decision: 'decline',
    });
    expect(invoke).toHaveBeenCalledWith('resolve_codex_approval', {
      requestId: 'approval-1',
      method: 'item/fileChange/requestApproval',
      decision: 'accept',
    });

    act(() => emit?.({ type: 'completed' }));
    act(() => resolveRequest({ threadId: 'thread-1' }));
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

// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { c } from '#/hooks/use-codex-chat';
import { createLocalApi } from '#/lib/local-api';
import type { ChatStreamEvent } from '#/lib/types';
import { LocalApiProvider } from '#/providers/local-api-provider';

afterEach(cleanup);

describe('useCodexChat', () => {
  it('adapts TanStack message state and delegates the request to the local API', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let resolveRequest: (result: unknown) => void = () => undefined;
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    const invoke = vi.fn((command: string) =>
      command === 'resolve_codex_approval' ? Promise.resolve() : request,
    );
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return <LocalApiProvider api={api}>{children}</LocalApiProvider>;
    }

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
    expect(invoke).toHaveBeenCalledWith('stream_codex_text', {
      input: {
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
      onEvent: { id: 'channel-1' },
    });
  });

  it('sends attachment-only prompts and blocks empty or concurrent submissions', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let resolveRequest: (result: unknown) => void = () => undefined;
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    const invoke = vi.fn(() => request);
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return <LocalApiProvider api={api}>{children}</LocalApiProvider>;
    }

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
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('stream_codex_text', {
      input: {
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
      onEvent: { id: 'channel-1' },
    });

    act(() => emit?.({ type: 'completed' }));
    act(() => resolveRequest({ threadId: 'thread-1' }));
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it('uses current settings, continues the Codex thread, and resets it with the workspace', async () => {
    const emissions: Array<(event: ChatStreamEvent) => void> = [];
    const requestResolvers: Array<(result: unknown) => void> = [];
    const invoke = vi.fn(
      (command: string, _args?: Record<string, unknown>) =>
        new Promise<unknown>((resolve) => {
          if (command === 'stream_codex_text') requestResolvers.push(resolve);
          else resolve(undefined);
        }),
    );
    const api = createLocalApi(invoke, (onMessage) => {
      emissions.push(onMessage as (event: ChatStreamEvent) => void);
      return { id: `channel-${emissions.length}` };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return <LocalApiProvider api={api}>{children}</LocalApiProvider>;
    }

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
    expect(invoke.mock.calls[1]?.[1]).toMatchObject({
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
    expect(invoke).toHaveBeenCalledWith('interrupt_codex_turn', {
      threadId: 'codex-thread-1',
      turnId: 'codex-turn-2',
    });
    act(() => requestResolvers[1]?.({ threadId: 'codex-thread-1' }));

    act(() => result.current.submitPrompt({ files: [], text: 'Third' }));
    await waitFor(() => expect(emissions).toHaveLength(3));
    const streamCalls = invoke.mock.calls.filter(([command]) => command === 'stream_codex_text');
    expect(streamCalls[2]?.[1]).toMatchObject({
      input: {
        prompt: 'Third',
        workingDirectory: '/workspace/two',
      },
    });
    expect(streamCalls[2]?.[1]?.input).not.toHaveProperty('threadId');
    act(() => emissions[2]?.({ type: 'completed' }));
    act(() => requestResolvers[2]?.({ threadId: 'codex-thread-2' }));
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it('shows a transport failure once and allows a later submission', async () => {
    const emissions: Array<(event: ChatStreamEvent) => void> = [];
    let callCount = 0;
    let resolveSecondRequest: (result: unknown) => void = () => undefined;
    const secondRequest = new Promise<unknown>((resolve) => {
      resolveSecondRequest = resolve;
    });
    const invoke = vi.fn((command: string) => {
      if (command !== 'stream_codex_text') return Promise.resolve();
      callCount += 1;
      return callCount === 1 ? Promise.reject(new Error('Connection failed')) : secondRequest;
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emissions.push(onMessage as (event: ChatStreamEvent) => void);
      return { id: `channel-${emissions.length}` };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return <LocalApiProvider api={api}>{children}</LocalApiProvider>;
    }

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
    const invoke = vi.fn((command: string) => {
      if (command === 'stream_codex_text') return request;
      approvalAttempts += 1;
      return approvalAttempts === 1
        ? Promise.reject(new Error('Approval could not be sent'))
        : Promise.resolve();
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return <LocalApiProvider api={api}>{children}</LocalApiProvider>;
    }

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

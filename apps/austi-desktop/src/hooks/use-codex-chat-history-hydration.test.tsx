// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCodexChat } from '#/hooks/use-codex-chat';
import type { ChatRecord, ChatSaveResult, ChatSummary } from '#/lib/chat-history';
import { createLocalApi } from '#/lib/local-api';
import type { ChatStreamEvent } from '#/lib/types';
import { useChatHistory } from '#/providers/chat-history-provider';
import { createCodexChatTestWrapper } from '#/test/codex-chat-test-wrapper';

afterEach(cleanup);

const summaryFor = (chat: ChatRecord): ChatSummary => ({
  id: chat.id,
  title: chat.title,
  createdAtMs: chat.createdAtMs,
  updatedAtMs: chat.updatedAtMs,
});

const saveResultFor = (
  chat: ChatRecord,
  attachmentStorageKeys: Record<string, string> = {},
): ChatSaveResult => ({
  ...summaryFor(chat),
  attachmentStorageKeys,
});

describe('chat history hydration', () => {
  it('hydrates a selected chat and continues its Codex thread', async () => {
    const storedChat: ChatRecord = {
      id: 'chat-1',
      title: 'Existing chat',
      createdAtMs: 10,
      updatedAtMs: 20,
      codexThreadId: 'thread-1',
      messages: [
        { id: 'message-1', role: 'user', text: 'First prompt' },
        {
          id: 'message-2',
          role: 'assistant',
          text: '',
          startedAtMs: 11,
          completedAtMs: 19,
          parts: [{ type: 'message', id: 'reply-1', text: 'First reply' }],
        },
      ],
    };
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_chats') return Promise.resolve([summaryFor(storedChat)]);
      if (command === 'get_chat') return Promise.resolve(storedChat);
      if (command === 'get_codex_run') return Promise.resolve(null);
      if (command === 'save_chat') return Promise.resolve(saveResultFor(storedChat));
      if (command === 'start_codex_text') {
        return Promise.resolve(runFromStartArgs(args, 'thread-1'));
      }
      return new Promise<unknown>(() => undefined);
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    function OpenStoredChat({ children }: { children: ReactNode }) {
      const { openChat } = useChatHistory();
      useEffect(() => openChat('chat-1'), [openChat]);
      return children;
    }

    const Wrapper = createCodexChatTestWrapper(api, true, OpenStoredChat);

    const { result } = renderHook(() => useCodexChat({ permissionMode: 'read-only' }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1]?.parts).toEqual([
      { type: 'message', id: 'reply-1', text: 'First reply' },
    ]);

    act(() => result.current.submitPrompt({ files: [], text: 'Continue' }));
    await waitFor(() => expect(emit).toBeDefined());
    expect(invoke).toHaveBeenCalledWith(
      'start_codex_text',
      expect.objectContaining({
        input: expect.objectContaining({ threadId: 'thread-1' }),
      }),
    );
  });

  it('restores the saved working directory before continuing a thread', async () => {
    const storedChat: ChatRecord = {
      id: 'chat-1',
      title: 'Workspace chat',
      createdAtMs: 10,
      updatedAtMs: 20,
      codexThreadId: 'thread-1',
      workingDirectory: '/workspace/original',
      messages: [
        { id: 'message-1', role: 'user', text: 'First prompt' },
        {
          id: 'message-2',
          role: 'assistant',
          text: '',
          startedAtMs: 11,
          completedAtMs: 19,
          parts: [{ type: 'message', id: 'reply-1', text: 'First reply' }],
        },
      ],
    };
    const onWorkingDirectoryChange = vi.fn();
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_chats') return Promise.resolve([summaryFor(storedChat)]);
      if (command === 'get_chat') return Promise.resolve(storedChat);
      if (command === 'get_codex_run') return Promise.resolve(null);
      if (command === 'save_chat') return Promise.resolve(saveResultFor(storedChat));
      if (command === 'start_codex_text') {
        return Promise.resolve(runFromStartArgs(args, 'thread-1'));
      }
      return new Promise<unknown>(() => undefined);
    });
    const api = createLocalApi(invoke, () => ({ id: 'channel-1' }));

    function OpenStoredChat({ children }: { children: ReactNode }) {
      const { openChat } = useChatHistory();
      useEffect(() => openChat('chat-1'), [openChat]);
      return children;
    }

    const Wrapper = createCodexChatTestWrapper(api, true, OpenStoredChat);

    const { rerender, result } = renderHook(
      ({ workingDirectory }: { workingDirectory: string }) =>
        useCodexChat({
          onWorkingDirectoryChange,
          permissionMode: 'read-only',
          workingDirectory,
        }),
      { initialProps: { workingDirectory: '/workspace/other' }, wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(onWorkingDirectoryChange).toHaveBeenCalledWith('/workspace/original');

    rerender({ workingDirectory: '/workspace/original' });
    act(() => result.current.submitPrompt({ files: [], text: 'Continue' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'start_codex_text',
        expect.objectContaining({
          input: expect.objectContaining({
            threadId: 'thread-1',
            workingDirectory: '/workspace/original',
          }),
        }),
      ),
    );
  });
});

const runFromStartArgs = (
  args: Record<string, unknown> | undefined,
  threadId = 'thread-1',
  runNumber = 1,
) => {
  const input = args?.input as Record<string, unknown>;
  return {
    runId: `run-${runNumber}`,
    chatId: String(input.chatId),
    threadId,
    turnId: `turn-${runNumber}`,
    assistantMessageId: String(input.assistantMessageId),
  };
};

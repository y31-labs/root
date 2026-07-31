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

describe('chat history run resumption', () => {
  it('keeps a turn running across chats and replays it when its chat is reopened', async () => {
    const emissions: Array<(event: ChatStreamEvent) => void> = [];
    const streamResolvers: Array<(result: unknown) => void> = [];
    const savedChats = new Map<string, ChatRecord>();
    let run: ReturnType<typeof runFromStartArgs> | undefined;
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_chats') return Promise.resolve([]);
      if (command === 'chat_history_status') return Promise.resolve({});
      if (command === 'save_chat') {
        const chat = args?.chat as ChatRecord;
        savedChats.set(chat.id, chat);
        return Promise.resolve(saveResultFor(chat));
      }
      if (command === 'get_chat') {
        return Promise.resolve(savedChats.get(String(args?.chatId)) ?? null);
      }
      if (command === 'get_codex_run') {
        return Promise.resolve(run ? { ...run, active: true } : null);
      }
      if (command === 'start_codex_text') {
        run = runFromStartArgs(args);
        return Promise.resolve(run);
      }
      if (command === 'stream_codex_run') {
        return new Promise<unknown>((resolve) => streamResolvers.push(resolve));
      }
      return Promise.resolve();
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emissions.push(onMessage as (event: ChatStreamEvent) => void);
      return { id: `channel-${emissions.length}` };
    });

    const Wrapper = createCodexChatTestWrapper(api, true);

    const { result } = renderHook(
      () => ({
        chat: useCodexChat({ permissionMode: 'read-only' }),
        history: useChatHistory(),
      }),
      { wrapper: Wrapper },
    );

    act(() => result.current.chat.submitPrompt({ files: [], text: 'Work in the background' }));
    await waitFor(() => expect(emissions).toHaveLength(1));
    act(() => emissions[0]?.({ type: 'messageDelta', id: 'reply-1', text: 'Halfway' }));
    await waitFor(() => expect(result.current.chat.messages[1]?.streaming).toBe(true));
    const runningChatId = result.current.history.activeChatId;

    act(() => result.current.history.newChat());
    await waitFor(() => expect(result.current.chat.messages).toEqual([]));
    expect(result.current.chat.conversationStarted).toBe(false);
    expect(invoke.mock.calls.some(([command]) => command === 'interrupt_codex_turn')).toBe(false);

    act(() => result.current.history.openChat(runningChatId!));
    expect(result.current.chat.conversationStarted).toBe(true);
    expect(result.current.chat.messages).toEqual([]);
    await waitFor(() => expect(emissions).toHaveLength(2));
    act(() => {
      emissions[1]?.({ type: 'started', threadId: 'thread-1', turnId: 'turn-1' });
      emissions[1]?.({ type: 'messageDelta', id: 'reply-1', text: 'Halfway and done' });
      emissions[1]?.({ type: 'completed' });
      streamResolvers[1]?.({ threadId: 'thread-1' });
    });

    await waitFor(() => expect(result.current.chat.pending).toBe(false));
    expect(result.current.chat.messages[1]?.parts).toEqual([
      { type: 'message', id: 'reply-1', text: 'Halfway and done' },
    ]);
  });

  it('expires process-local state when hydrating an interrupted turn', async () => {
    const storedChat: ChatRecord = {
      id: 'chat-1',
      title: 'Interrupted chat',
      createdAtMs: 10,
      updatedAtMs: 20,
      messages: [
        { id: 'message-1', role: 'user', text: 'Run a command' },
        {
          id: 'message-2',
          role: 'assistant',
          text: '',
          startedAtMs: 11,
          streaming: true,
          approvals: [
            {
              requestId: 'approval-1',
              method: 'item/commandExecution/requestApproval',
              title: 'Run command',
              status: 'pending',
            },
          ],
          parts: [
            {
              type: 'activity',
              id: 'activity-1',
              activities: [
                {
                  id: 'command-1',
                  kind: 'command',
                  label: 'bun test',
                  status: 'running',
                },
              ],
            },
          ],
        },
      ],
    };
    const savedChats: ChatRecord[] = [];
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_chats') return Promise.resolve([summaryFor(storedChat)]);
      if (command === 'get_chat') return Promise.resolve(storedChat);
      if (command === 'get_codex_run') return Promise.resolve(null);
      if (command === 'save_chat') {
        const chat = args?.chat as ChatRecord;
        savedChats.push(chat);
        return Promise.resolve(saveResultFor(chat));
      }
      return Promise.resolve();
    });
    const api = createLocalApi(invoke);

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
    expect(result.current.messages[1]).toMatchObject({
      completedAtMs: 20,
      streaming: false,
      approvals: [{ requestId: 'approval-1', status: 'expired' }],
      parts: [
        {
          type: 'activity',
          activities: [{ id: 'command-1', status: 'failed' }],
        },
      ],
    });
    await waitFor(() =>
      expect(savedChats.at(-1)).toMatchObject({
        messages: [
          { role: 'user' },
          {
            role: 'assistant',
            completedAtMs: 20,
            approvals: [{ status: 'expired' }],
            parts: [{ activities: [{ status: 'failed' }] }],
          },
        ],
      }),
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

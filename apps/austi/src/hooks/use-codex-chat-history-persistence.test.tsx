// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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

describe('persistent chat history', () => {
  it('generates a short title from the first prompt and tracks active execution', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let resolveTitle: (title: string) => void = () => undefined;
    let resolveRequest: (result: unknown) => void = () => undefined;
    const titleRequest = new Promise<string>((resolve) => {
      resolveTitle = resolve;
    });
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_chats') return Promise.resolve([]);
      if (command === 'chat_history_status') return Promise.resolve({});
      if (command === 'save_chat') {
        return Promise.resolve(saveResultFor(args?.chat as ChatRecord));
      }
      if (command === 'generate_chat_title') return titleRequest;
      if (command === 'rename_chat') return Promise.resolve();
      if (command === 'start_codex_text') return Promise.resolve(runFromStartArgs(args));
      if (command === 'stream_codex_run') return request;
      return request;
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    const Wrapper = createCodexChatTestWrapper(api, true);

    const settings = {
      model: 'gpt-5.6-terra',
      effort: 'medium',
      speed: 'standard' as const,
    };
    const { result } = renderHook(
      () => ({
        chat: useCodexChat({ permissionMode: 'read-only', settings }),
        history: useChatHistory(),
      }),
      { wrapper: Wrapper },
    );

    act(() =>
      result.current.chat.submitPrompt({
        files: [],
        text: 'Build a detailed intake workflow for international vendors',
      }),
    );

    await waitFor(() => expect(result.current.history.chats).toHaveLength(1));
    const chatId = result.current.history.activeChatId!;
    expect(result.current.history.generatingTitleChatIds.has(chatId)).toBe(true);
    expect(result.current.history.runningChatIds.has(chatId)).toBe(true);
    expect(invoke).toHaveBeenCalledWith('generate_chat_title', {
      input: {
        firstPrompt: 'Build a detailed intake workflow for international vendors',
        filenames: [],
        settings,
      },
    });

    act(() => resolveTitle('Vendor intake'));

    await waitFor(() => expect(result.current.history.chats[0]?.title).toBe('Vendor intake'));
    expect(result.current.history.generatingTitleChatIds.has(chatId)).toBe(false);
    expect(invoke).toHaveBeenCalledWith('rename_chat', { chatId, title: 'Vendor intake' });

    await waitFor(() => expect(emit).toBeDefined());
    act(() => emit?.({ type: 'completed' }));
    act(() => resolveRequest({ threadId: 'thread-1' }));
    await waitFor(() => expect(result.current.history.runningChatIds.has(chatId)).toBe(false));
  });

  it('persists a transcript and its Codex thread id', async () => {
    let emit: ((event: ChatStreamEvent) => void) | undefined;
    let resolveRequest: (result: unknown) => void = () => undefined;
    const request = new Promise<unknown>((resolve) => {
      resolveRequest = resolve;
    });
    const savedChats: ChatRecord[] = [];
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_chats') return Promise.resolve([]);
      if (command === 'save_chat') {
        const chat = args?.chat as ChatRecord;
        savedChats.push(chat);
        return Promise.resolve(saveResultFor(chat));
      }
      if (command === 'start_codex_text') return Promise.resolve(runFromStartArgs(args));
      if (command === 'stream_codex_run') return request;
      return request;
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    const Wrapper = createCodexChatTestWrapper(api, true);

    const { result } = renderHook(
      () =>
        useCodexChat({
          permissionMode: 'read-only',
          workingDirectory: '/workspace/intake',
        }),
      { wrapper: Wrapper },
    );
    act(() => result.current.submitPrompt({ files: [], text: 'Build an intake workflow' }));
    await waitFor(() => expect(emit).toBeDefined());
    act(() => emit?.({ type: 'started', threadId: 'thread-1', turnId: 'turn-1' }));
    act(() => emit?.({ type: 'messageDelta', id: 'reply-1', text: 'Here is the workflow.' }));
    act(() => emit?.({ type: 'completed' }));
    act(() => resolveRequest({ threadId: 'thread-1' }));

    await waitFor(() =>
      expect(savedChats.at(-1)).toMatchObject({
        codexThreadId: 'thread-1',
        title: 'Build an intake workflow',
        workingDirectory: '/workspace/intake',
        messages: [
          { role: 'user', text: 'Build an intake workflow' },
          {
            role: 'assistant',
            parts: [{ type: 'message', id: 'reply-1', text: 'Here is the workflow.' }],
          },
        ],
      }),
    );
  });

  it('sends attachment payloads only until native storage returns their keys', async () => {
    const savedChats: ChatRecord[] = [];
    let runNumber = 0;
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_chats') return Promise.resolve([]);
      if (command === 'chat_history_status') return Promise.resolve({});
      if (command === 'save_chat') {
        const chat = args?.chat as ChatRecord;
        savedChats.push(chat);
        return Promise.resolve(
          saveResultFor(chat, {
            'message-1-file-0': 'stored-chat/stored-attachment',
          }),
        );
      }
      if (command === 'start_codex_text') {
        runNumber += 1;
        return Promise.resolve(runFromStartArgs(args, 'thread-1', runNumber));
      }
      if (command === 'stream_codex_run') return Promise.resolve({ threadId: 'thread-1' });
      return Promise.resolve();
    });
    const api = createLocalApi(invoke, () => ({ id: 'channel-1' }));

    const Wrapper = createCodexChatTestWrapper(api, true);

    const { result } = renderHook(() => useCodexChat({ permissionMode: 'read-only' }), {
      wrapper: Wrapper,
    });
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
        text: 'Review this layout',
      }),
    );

    await waitFor(() => expect(savedChats).toHaveLength(1));
    expect(savedChats[0]?.messages[0]?.attachments?.[0]).toMatchObject({
      url: 'data:image/png;base64,aW1hZ2U=',
    });
    await waitFor(() => expect(result.current.pending).toBe(false));

    act(() => result.current.submitPrompt({ files: [], text: 'Continue' }));
    await waitFor(() => expect(savedChats.some((chat) => chat.messages.length === 4)).toBe(true));

    const continuedChat = savedChats.find((chat) => chat.messages.length === 4);
    expect(continuedChat?.messages[0]?.attachments?.[0]).toMatchObject({
      storageKey: 'stored-chat/stored-attachment',
    });
    expect(continuedChat?.messages[0]?.attachments?.[0]).not.toHaveProperty('url');
  });

  it('archives an active chat without recreating it from a pending snapshot', async () => {
    const invoke = vi.fn((command: string) => {
      if (command === 'list_chats' || command === 'archive_chat') return Promise.resolve([]);
      return new Promise<unknown>(() => undefined);
    });
    const api = createLocalApi(invoke, () => ({ id: 'channel-1' }));

    const Wrapper = createCodexChatTestWrapper(api, true);

    const { result } = renderHook(
      () => ({
        chat: useCodexChat({ permissionMode: 'read-only' }),
        history: useChatHistory(),
      }),
      { wrapper: Wrapper },
    );
    act(() => result.current.chat.submitPrompt({ files: [], text: 'Temporary chat' }));
    await waitFor(() => expect(result.current.history.activeChatId).toBeDefined());
    const chatId = result.current.history.activeChatId;

    await act(() => result.current.history.archiveChat(chatId!));
    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(invoke).toHaveBeenCalledWith('archive_chat', { chatId });
    expect(invoke.mock.calls.some(([command]) => command === 'save_chat')).toBe(false);
    expect(result.current.history.activeChatId).toBeUndefined();
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

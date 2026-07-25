// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCodexChat } from '#/hooks/use-codex-chat';
import type { ChatRecord, ChatSaveResult, ChatSummary } from '#/lib/chat-history';
import { createLocalApi } from '#/lib/local-api';
import type { ChatStreamEvent } from '#/lib/types';
import { ChatHistoryProvider, useChatHistory } from '#/providers/chat-history-provider';
import { LocalApiProvider } from '#/providers/local-api-provider';

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
      return request;
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <LocalApiProvider api={api}>
          <ChatHistoryProvider>{children}</ChatHistoryProvider>
        </LocalApiProvider>
      );
    }

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
      return request;
    });
    const api = createLocalApi(invoke, (onMessage) => {
      emit = onMessage as (event: ChatStreamEvent) => void;
      return { id: 'channel-1' };
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <LocalApiProvider api={api}>
          <ChatHistoryProvider>{children}</ChatHistoryProvider>
        </LocalApiProvider>
      );
    }

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
    const invoke = vi.fn((command: string) => {
      if (command === 'list_chats') return Promise.resolve([summaryFor(storedChat)]);
      if (command === 'get_chat') return Promise.resolve(storedChat);
      if (command === 'save_chat') return Promise.resolve(saveResultFor(storedChat));
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

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <LocalApiProvider api={api}>
          <ChatHistoryProvider>
            <OpenStoredChat>{children}</OpenStoredChat>
          </ChatHistoryProvider>
        </LocalApiProvider>
      );
    }

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
      'stream_codex_text',
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
    const invoke = vi.fn((command: string) => {
      if (command === 'list_chats') return Promise.resolve([summaryFor(storedChat)]);
      if (command === 'get_chat') return Promise.resolve(storedChat);
      if (command === 'save_chat') return Promise.resolve(saveResultFor(storedChat));
      return new Promise<unknown>(() => undefined);
    });
    const api = createLocalApi(invoke, () => ({ id: 'channel-1' }));

    function OpenStoredChat({ children }: { children: ReactNode }) {
      const { openChat } = useChatHistory();
      useEffect(() => openChat('chat-1'), [openChat]);
      return children;
    }

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <LocalApiProvider api={api}>
          <ChatHistoryProvider>
            <OpenStoredChat>{children}</OpenStoredChat>
          </ChatHistoryProvider>
        </LocalApiProvider>
      );
    }

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
        'stream_codex_text',
        expect.objectContaining({
          input: expect.objectContaining({
            threadId: 'thread-1',
            workingDirectory: '/workspace/original',
          }),
        }),
      ),
    );
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

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <LocalApiProvider api={api}>
          <ChatHistoryProvider>
            <OpenStoredChat>{children}</OpenStoredChat>
          </ChatHistoryProvider>
        </LocalApiProvider>
      );
    }

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

  it('sends attachment payloads only until native storage returns their keys', async () => {
    const savedChats: ChatRecord[] = [];
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
      if (command === 'stream_codex_text') return Promise.resolve({ threadId: 'thread-1' });
      return Promise.resolve();
    });
    const api = createLocalApi(invoke, () => ({ id: 'channel-1' }));

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <LocalApiProvider api={api}>
          <ChatHistoryProvider>{children}</ChatHistoryProvider>
        </LocalApiProvider>
      );
    }

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

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <LocalApiProvider api={api}>
          <ChatHistoryProvider>{children}</ChatHistoryProvider>
        </LocalApiProvider>
      );
    }

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

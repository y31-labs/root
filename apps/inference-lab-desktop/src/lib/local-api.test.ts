import { describe, expect, it, vi } from 'vitest';

import type { ChatRecord } from '#/lib/chat-history';
import { createLocalApi } from '#/lib/local-api';

describe('local API', () => {
  it('maps provider model fields to effort and speed', async () => {
    const invoke = vi.fn(async () => [
      {
        model: 'gpt-5.6-terra',
        displayName: 'GPT-5.6 Terra',
        supportedEfforts: [{ effort: 'low' }, { effort: 'medium' }],
        defaultEffort: 'medium',
        serviceTiers: [{ id: 'priority', name: 'Fast' }],
        defaultServiceTier: null,
        isDefault: true,
      },
    ]);

    const models = await createLocalApi(invoke).listModels();

    expect(models).toEqual([
      {
        model: 'gpt-5.6-terra',
        displayName: 'GPT-5.6 Terra',
        effort: { options: ['low', 'medium'], default: 'medium' },
        speed: { options: ['standard', 'fast'], default: 'standard' },
        isDefault: true,
      },
    ]);
  });

  it('passes chat text updates through a Tauri channel', async () => {
    const invoke = vi.fn(async (command: string) =>
      command === 'list_codex_models' ? [] : { threadId: 'thread-1' },
    );
    const channel = { id: 'channel-1' };
    const makeChannel = vi.fn(() => channel);
    const onEvent = vi.fn();
    const api = createLocalApi(invoke, makeChannel);

    await api.codexIntegrationStatus();
    await api.connectCodex();
    await api.listModels();
    await api.streamChatText(
      'Draft an intake flow',
      [
        {
          dataUrl: 'data:application/pdf;base64,ZmlsZQ==',
          filename: 'brief.pdf',
          mediaType: 'application/pdf',
        },
      ],
      '/Users/example/project',
      'thread-1',
      { model: 'gpt-5.6-terra', effort: 'medium', speed: 'fast' },
      'workspace-write',
      onEvent,
    );

    expect(invoke).toHaveBeenNthCalledWith(1, 'codex_integration_status', undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, 'connect_codex', undefined);
    expect(invoke).toHaveBeenNthCalledWith(3, 'list_codex_models', undefined);
    expect(makeChannel).toHaveBeenCalledWith(onEvent);
    expect(invoke).toHaveBeenNthCalledWith(4, 'stream_codex_text', {
      input: {
        prompt: 'Draft an intake flow',
        attachments: [
          {
            dataUrl: 'data:application/pdf;base64,ZmlsZQ==',
            filename: 'brief.pdf',
            mediaType: 'application/pdf',
          },
        ],
        workingDirectory: '/Users/example/project',
        threadId: 'thread-1',
        settings: {
          model: 'gpt-5.6-terra',
          effort: 'medium',
          speed: 'fast',
        },
        permissionMode: 'workspace-write',
      },
      onEvent: channel,
    });

    await api.interruptCodexTurn('thread-1', 'turn-1');
    expect(invoke).toHaveBeenNthCalledWith(5, 'interrupt_codex_turn', {
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    await api.resolveCodexApproval(42, 'item/commandExecution/requestApproval', 'acceptForSession');
    expect(invoke).toHaveBeenNthCalledWith(6, 'resolve_codex_approval', {
      requestId: 42,
      method: 'item/commandExecution/requestApproval',
      decision: 'acceptForSession',
    });
  });

  it('loads, saves, and archives chat history through native commands', async () => {
    const chat: ChatRecord = {
      id: 'chat-1',
      title: 'Build an intake flow',
      createdAtMs: 10,
      updatedAtMs: 20,
      codexThreadId: 'thread-1',
      messages: [{ id: 'message-1', role: 'user', text: 'Build an intake flow' }],
    };
    const summary = {
      id: chat.id,
      title: chat.title,
      createdAtMs: chat.createdAtMs,
      updatedAtMs: chat.updatedAtMs,
    };
    const saveResult = { ...summary, attachmentStorageKeys: {} };
    const invoke = vi.fn((command: string) => {
      if (command === 'list_chats') return Promise.resolve([summary]);
      if (command === 'get_chat') return Promise.resolve(chat);
      if (command === 'archive_chat') return Promise.resolve();
      if (command === 'chat_history_status') return Promise.resolve({ warning: 'Recovered' });
      return Promise.resolve(saveResult);
    });
    const api = createLocalApi(invoke);

    await expect(api.listChats()).resolves.toEqual([summary]);
    await expect(api.getChat('chat-1')).resolves.toEqual(chat);
    await expect(api.saveChat(chat)).resolves.toEqual(saveResult);
    await expect(api.archiveChat('chat-1')).resolves.toBeUndefined();
    await expect(api.chatHistoryStatus()).resolves.toEqual({ warning: 'Recovered' });
    expect(invoke).toHaveBeenNthCalledWith(1, 'list_chats', undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, 'get_chat', { chatId: 'chat-1' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'save_chat', { chat });
    expect(invoke).toHaveBeenNthCalledWith(4, 'archive_chat', { chatId: 'chat-1' });
    expect(invoke).toHaveBeenNthCalledWith(5, 'chat_history_status', undefined);
  });
});

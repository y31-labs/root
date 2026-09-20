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

  it('starts and subscribes to native background chat runs', async () => {
    const run = {
      runId: 'run-1',
      chatId: 'chat-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      assistantMessageId: 'message-2',
    };
    const invoke = vi.fn(async (command: string) => {
      if (command === 'list_codex_models') return [];
      if (command === 'start_codex_text' || command === 'get_codex_run') return run;
      return { threadId: 'thread-1' };
    });
    const channel = { id: 'channel-1' };
    const makeChannel = vi.fn(() => channel);
    const onEvent = vi.fn();
    const api = createLocalApi(invoke, makeChannel);

    await api.activeCodexTaskCount();
    await api.codexIntegrationStatus();
    await api.connectCodex();
    await api.listModels();
    await api.generateChatTitle('Draft an intake flow', ['brief.pdf'], {
      model: 'gpt-5.6-terra',
      effort: 'medium',
      speed: 'fast',
    });
    await api.startCodexText(
      'chat-1',
      'message-2',
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
    );
    await api.streamCodexRun('run-1', onEvent);
    await api.getCodexRun('chat-1');

    expect(invoke).toHaveBeenNthCalledWith(1, 'active_codex_task_count', undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, 'codex_integration_status', undefined);
    expect(invoke).toHaveBeenNthCalledWith(3, 'connect_codex', undefined);
    expect(invoke).toHaveBeenNthCalledWith(4, 'list_codex_models', undefined);
    expect(invoke).toHaveBeenNthCalledWith(5, 'generate_chat_title', {
      input: {
        firstPrompt: 'Draft an intake flow',
        filenames: ['brief.pdf'],
        settings: {
          model: 'gpt-5.6-terra',
          effort: 'medium',
          speed: 'fast',
        },
      },
    });
    expect(makeChannel).toHaveBeenCalledWith(onEvent);
    expect(invoke).toHaveBeenNthCalledWith(6, 'start_codex_text', {
      input: {
        chatId: 'chat-1',
        assistantMessageId: 'message-2',
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
    });
    expect(invoke).toHaveBeenNthCalledWith(7, 'stream_codex_run', {
      runId: 'run-1',
      onEvent: channel,
    });
    expect(invoke).toHaveBeenNthCalledWith(8, 'get_codex_run', { chatId: 'chat-1' });

    await api.interruptCodexTurn('thread-1', 'turn-1');
    expect(invoke).toHaveBeenNthCalledWith(9, 'interrupt_codex_turn', {
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    await api.stopActiveCodexTasks();
    expect(invoke).toHaveBeenNthCalledWith(10, 'stop_active_codex_tasks', undefined);

    await api.resolveCodexApproval(42, 'item/commandExecution/requestApproval', 'acceptForSession');
    expect(invoke).toHaveBeenNthCalledWith(11, 'resolve_codex_approval', {
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
      if (command === 'rename_chat') return Promise.resolve();
      if (command === 'chat_history_status') return Promise.resolve({ warning: 'Recovered' });
      return Promise.resolve(saveResult);
    });
    const api = createLocalApi(invoke);

    await expect(api.listChats()).resolves.toEqual([summary]);
    await expect(api.getChat('chat-1')).resolves.toEqual(chat);
    await expect(api.saveChat(chat)).resolves.toEqual(saveResult);
    await expect(api.renameChat('chat-1', 'Intake workflow')).resolves.toBeUndefined();
    await expect(api.archiveChat('chat-1')).resolves.toBeUndefined();
    await expect(api.chatHistoryStatus()).resolves.toEqual({ warning: 'Recovered' });
    expect(invoke).toHaveBeenNthCalledWith(1, 'list_chats', undefined);
    expect(invoke).toHaveBeenNthCalledWith(2, 'get_chat', { chatId: 'chat-1' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'save_chat', { chat });
    expect(invoke).toHaveBeenNthCalledWith(4, 'rename_chat', {
      chatId: 'chat-1',
      title: 'Intake workflow',
    });
    expect(invoke).toHaveBeenNthCalledWith(5, 'archive_chat', { chatId: 'chat-1' });
    expect(invoke).toHaveBeenNthCalledWith(6, 'chat_history_status', undefined);
  });

  it('routes local apps and MCP authentication through native commands', async () => {
    const invoke = vi.fn(async () => undefined);
    const api = createLocalApi(invoke);

    await api.listGeneratedApps();
    await api.getGeneratedApp('status-board');
    await api.getGeneratedAppState('status-board');
    await api.saveGeneratedAppState('status-board', 2, { filter: 'open' });
    await api.invokeGeneratedAppCapability('status-board', 2, 'local.now', {}, false);
    await api.listMcpServers();
    await api.connectMcpServer('atlassian');

    expect(invoke.mock.calls).toEqual([
      ['list_generated_apps', undefined],
      ['get_generated_app', { appId: 'status-board' }],
      ['get_generated_app_state', { appId: 'status-board' }],
      [
        'save_generated_app_state',
        { input: { appId: 'status-board', revision: 2, state: { filter: 'open' } } },
      ],
      [
        'invoke_generated_app_capability',
        {
          input: {
            appId: 'status-board',
            revision: 2,
            capabilityId: 'local.now',
            input: {},
            approved: false,
          },
        },
      ],
      ['list_mcp_servers', undefined],
      ['connect_mcp_server', { name: 'atlassian' }],
    ]);
  });
});

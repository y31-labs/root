import { describe, expect, it, vi } from 'vitest';

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
      },
      onEvent: channel,
    });
  });
});

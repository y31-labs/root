import { Channel, invoke } from '@tauri-apps/api/core';

import type {
  ChatStreamEvent,
  ChatTextResult,
  CodexIntegrationStatus,
  Model,
  ModelSettings,
} from '#/lib/types';

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type ChannelFactory = <T>(onMessage: (message: T) => void) => unknown;
type ProviderServiceTier = { id: 'priority'; name: 'Fast' };

interface ProviderModel {
  model: string;
  displayName: string;
  supportedReasoningEfforts: { reasoningEffort: string }[];
  defaultReasoningEffort: string;
  serviceTiers: ProviderServiceTier[];
  defaultServiceTier: ProviderServiceTier['id'] | null;
  isDefault: boolean;
}

interface ProviderModelSettings {
  model: string;
  effort: string;
  serviceTier: 'priority' | null;
}

const toModelSpeed = (serviceTier: ProviderServiceTier['id'] | null): string =>
  serviceTier === 'priority' ? 'fast' : 'standard';

const toModel = (model: ProviderModel): Model => ({
  model: model.model,
  displayName: model.displayName,
  reason: {
    options: model.supportedReasoningEfforts.map((option) => option.reasoningEffort),
    default: model.defaultReasoningEffort,
  },
  speed: {
    options: model.serviceTiers.some((tier) => tier.id === 'priority')
      ? ['standard', 'fast']
      : ['standard'],
    default: toModelSpeed(model.defaultServiceTier),
  },
  isDefault: model.isDefault,
});

const toProviderModelSettings = (settings: ModelSettings): ProviderModelSettings => ({
  model: settings.model,
  effort: settings.reason,
  serviceTier: settings.speed === 'fast' ? 'priority' : null,
});

export interface ChatAttachmentInput {
  dataUrl: string;
  filename: string;
  mediaType: string;
}

const createChannel: ChannelFactory = <T>(onMessage: (message: T) => void) =>
  new Channel<T>(onMessage);

export const createLocalApi = (
  call: Invoke = invoke,
  makeChannel: ChannelFactory = createChannel,
) => {
  const request = <T>(command: string, args?: Record<string, unknown>) =>
    call(command, args) as Promise<T>;

  return {
    codexIntegrationStatus: () => request<CodexIntegrationStatus>('codex_integration_status'),
    connectCodex: () => request<void>('connect_codex'),
    listModels: () =>
      request<ProviderModel[]>('list_codex_models').then((models) => models.map(toModel)),
    streamChatText: (
      prompt: string,
      attachments: ChatAttachmentInput[],
      workingDirectory: string | undefined,
      threadId: string | undefined,
      settings: ModelSettings | undefined,
      onEvent: (event: ChatStreamEvent) => void,
    ) =>
      request<ChatTextResult>('stream_codex_text', {
        input: {
          prompt,
          attachments,
          ...(workingDirectory ? { workingDirectory } : {}),
          ...(threadId ? { threadId } : {}),
          ...(settings ? { settings: toProviderModelSettings(settings) } : {}),
        },
        onEvent: makeChannel(onEvent),
      }),
  };
};

export type LocalApi = ReturnType<typeof createLocalApi>;
export const localApi = createLocalApi();

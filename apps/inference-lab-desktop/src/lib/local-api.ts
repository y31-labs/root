import { Channel, invoke } from '@tauri-apps/api/core';

import type {
  ChatHistoryStatus,
  ChatRecord,
  ChatSaveResult,
  ChatSummary,
} from '#/lib/chat-history';
import type {
  CodexApprovalDecision,
  CodexApprovalMethod,
  ChatStreamEvent,
  ChatTextResult,
  CodexIntegrationStatus,
  Model,
  ModelSettings,
  ModelSpeed,
  PermissionMode,
  CodexRunInfo,
  CodexRunStatus,
} from '#/lib/types';

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type ChannelFactory = <T>(onMessage: (message: T) => void) => unknown;
type ProviderServiceTier = { id: 'priority'; name: 'Fast' };

interface ProviderModel {
  model: string;
  displayName: string;
  supportedEfforts: { effort: string }[];
  defaultEffort: string;
  serviceTiers: ProviderServiceTier[];
  defaultServiceTier: ProviderServiceTier['id'] | null;
  isDefault: boolean;
}

const toModelSpeed = (serviceTier: ProviderServiceTier['id'] | null): ModelSpeed =>
  serviceTier === 'priority' ? 'fast' : 'standard';

const toModel = (model: ProviderModel): Model => ({
  model: model.model,
  displayName: model.displayName,
  effort: {
    options: model.supportedEfforts.map((option) => option.effort),
    default: model.defaultEffort,
  },
  speed: {
    options: model.serviceTiers.some((tier) => tier.id === 'priority')
      ? ['standard', 'fast']
      : ['standard'],
    default: toModelSpeed(model.defaultServiceTier),
  },
  isDefault: model.isDefault,
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
    archiveChat: (chatId: string) => request<void>('archive_chat', { chatId }),
    chatHistoryStatus: () => request<ChatHistoryStatus>('chat_history_status'),
    getChat: (chatId: string) => request<ChatRecord | null>('get_chat', { chatId }),
    listChats: () => request<ChatSummary[]>('list_chats'),
    generateChatTitle: (
      firstPrompt: string,
      filenames: string[],
      settings: ModelSettings | undefined,
    ) =>
      request<string>('generate_chat_title', {
        input: {
          firstPrompt,
          filenames,
          ...(settings ? { settings } : {}),
        },
      }),
    renameChat: (chatId: string, title: string) => request<void>('rename_chat', { chatId, title }),
    saveChat: (chat: ChatRecord) => request<ChatSaveResult>('save_chat', { chat }),
    codexIntegrationStatus: () => request<CodexIntegrationStatus>('codex_integration_status'),
    connectCodex: () => request<void>('connect_codex'),
    listModels: () =>
      request<ProviderModel[]>('list_codex_models').then((models) => models.map(toModel)),
    getCodexRun: (chatId: string) => request<CodexRunStatus | null>('get_codex_run', { chatId }),
    interruptCodexTurn: (threadId: string, turnId: string) =>
      request<void>('interrupt_codex_turn', { threadId, turnId }),
    startCodexText: (
      chatId: string,
      assistantMessageId: string,
      prompt: string,
      attachments: ChatAttachmentInput[],
      workingDirectory: string | undefined,
      threadId: string | undefined,
      settings: ModelSettings | undefined,
      permissionMode: PermissionMode,
    ) =>
      request<CodexRunInfo>('start_codex_text', {
        input: {
          chatId,
          assistantMessageId,
          prompt,
          attachments,
          ...(workingDirectory ? { workingDirectory } : {}),
          ...(threadId ? { threadId } : {}),
          ...(settings ? { settings } : {}),
          permissionMode,
        },
      }),
    streamCodexRun: (runId: string, onEvent: (event: ChatStreamEvent) => void) =>
      request<ChatTextResult>('stream_codex_run', {
        runId,
        onEvent: makeChannel(onEvent),
      }),
    resolveCodexApproval: (
      requestId: string | number,
      method: CodexApprovalMethod,
      decision: CodexApprovalDecision,
    ) => request<void>('resolve_codex_approval', { requestId, method, decision }),
  };
};

export type LocalApi = ReturnType<typeof createLocalApi>;
export const localApi = createLocalApi();

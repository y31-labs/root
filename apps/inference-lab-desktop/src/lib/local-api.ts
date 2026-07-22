import { Channel, invoke } from '@tauri-apps/api/core';

import type {
  AppSettings,
  CodexIntegrationStatus,
  CodexStreamEvent,
  CodexTextResult,
  Project,
  ProjectSummary,
} from '#/lib/types';

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type ChannelFactory = <T>(onMessage: (message: T) => void) => unknown;
export interface CodexAttachmentInput {
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
    listProjects: () => request<ProjectSummary[]>('list_projects'),
    getProject: (projectId: string) => request<Project | null>('get_project', { projectId }),
    createProject: (brief: string) => request<Project>('create_project', { brief }),
    generateProjectRevision: (projectId: string, instruction: string, baseVersionId?: string) =>
      request<Project>('generate_project_revision', {
        input: { projectId, instruction, ...(baseVersionId ? { baseVersionId } : {}) },
      }),
    deleteProject: (projectId: string) => request<void>('delete_project', { projectId }),
    getSettings: () => request<AppSettings>('get_settings'),
    saveSettings: (settings: AppSettings) =>
      request<AppSettings>('save_settings', { input: settings }),
    runPlugin: (pluginCall: unknown) => request<unknown>('run_plugin', { call: pluginCall }),
    codexIntegrationStatus: () => request<CodexIntegrationStatus>('codex_integration_status'),
    connectCodex: () => request<void>('connect_codex'),
    streamCodexText: (
      prompt: string,
      attachments: CodexAttachmentInput[],
      workingDirectory: string | undefined,
      threadId: string | undefined,
      onEvent: (event: CodexStreamEvent) => void,
    ) =>
      request<CodexTextResult>('stream_codex_text', {
        input: {
          prompt,
          attachments,
          ...(workingDirectory ? { workingDirectory } : {}),
          ...(threadId ? { threadId } : {}),
        },
        onEvent: makeChannel(onEvent),
      }),
  };
};

export type LocalApi = ReturnType<typeof createLocalApi>;
export const localApi = createLocalApi();

import { invoke } from '@tauri-apps/api/core';

import type { AppSettings, Project, ProjectSummary } from '#/lib/types';

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export const createLocalApi = (call: Invoke = invoke) => {
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
  };
};

export type LocalApi = ReturnType<typeof createLocalApi>;
export const localApi = createLocalApi();

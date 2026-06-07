import { invoke } from '@tauri-apps/api/core';
import type { EngineHealth, LocalArtifactIndex } from '@workspace/code-agent-contracts/engine';
import type { VerificationManifest } from '@workspace/code-agent-contracts/manifest';

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface CloneSource {
  owner: string;
  name: string;
  cloneUrl: string;
  token?: string;
}

export interface StartLocalRunInput {
  runId: string;
  task: string;
  baseCommitSha: string;
  manifest: VerificationManifest;
  repo: CloneSource;
}

export interface LocalRunRecord {
  runId: string;
  status: string;
  baseCommitSha: string;
  codexThreadId?: string;
  terminalReason?: string;
  artifacts: LocalArtifactIndex;
  events: Array<{ id: number; kind: string; message: string; createdAt: number }>;
}

export const localApi = {
  accessToken: (forceRefresh = false) =>
    invoke<string>('get_access_token', { forceRefresh }),
  engineHealth: () => invoke<EngineHealth>('engine_health'),
  startCodexLogin: () => invoke<void>('start_codex_login'),
  beginAuth: () => invoke<DeviceAuthorization>('begin_auth'),
  pollAuth: (deviceCode: string, interval: number, expiresIn: number) =>
    invoke<void>('poll_auth', { deviceCode, interval, expiresIn }),
  logout: () => invoke<void>('logout'),
  installationId: () => invoke<string>('installation_id'),
  startRun: (input: StartLocalRunInput) => invoke<void>('start_local_run', { input }),
  cancelRun: (runId: string) => invoke<void>('cancel_local_run', { runId }),
  getRun: (runId: string) => invoke<LocalRunRecord | null>('get_local_run', { runId }),
  readArtifact: (path: string) => invoke<string>('read_artifact', { path }),
  revealArtifact: (path: string) => invoke<void>('reveal_artifact', { path }),
  quit: (force = false) => invoke<void>('quit_application', { force }),
};

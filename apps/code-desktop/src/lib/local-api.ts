import { invoke } from '@tauri-apps/api/core';
import type { EngineHealth } from '@workspace/code-agent-contracts/engine';
import type { VerificationManifest } from '@workspace/code-agent-contracts/manifest';
import type {
  Artifact,
  ChangeSession,
  GateResult,
  Repository,
  RepositoryPolicy,
  SessionEvent,
  VerificationSnapshot,
} from '@workspace/code-agent-contracts/sessions';

export interface PolicyProposal {
  manifest: VerificationManifest;
  fingerprint: string;
  fingerprintPaths: string[];
  detectedScripts: string[];
}

export interface SessionDetail {
  session: ChangeSession & { repositoryName: string };
  repository: Repository;
  policy: RepositoryPolicy;
  events: SessionEvent[];
  gateResults: GateResult[];
  approvals: Array<{
    requestId: string | number;
    method: string;
    detail: string;
    status: 'pending' | 'accept' | 'acceptForSession' | 'decline';
    createdAt: number;
  }>;
  artifacts: Artifact[];
  snapshot?: VerificationSnapshot;
  diff: string;
  currentDigest: string;
  verificationStale: boolean;
}

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function createLocalApi(call: Invoke = invoke) {
  const request = <T>(command: string, args?: Record<string, unknown>) =>
    call(command, args) as Promise<T>;
  return {
    engineHealth: () => request<EngineHealth>('engine_health'),
    startCodexLogin: () => request<void>('start_codex_login'),
    installVerifierRuntime: () => request<void>('install_verifier_runtime'),
    listRepositories: () => request<Repository[]>('list_repositories'),
    registerRepository: (path: string) => request<Repository>('register_repository', { path }),
    refreshRepository: (repositoryId: string) =>
      request<Repository>('refresh_repository', { repositoryId }),
    proposeRepositoryPolicy: (repositoryId: string) =>
      request<PolicyProposal>('propose_repository_policy', { repositoryId }),
    approveRepositoryPolicy: (repositoryId: string, manifest: VerificationManifest) =>
      request<Repository>('approve_repository_policy', {
        input: { repositoryId, manifest },
      }),
    listChangeSessions: (repositoryId?: string) =>
      request<Array<ChangeSession & { repositoryName: string }>>('list_change_sessions', {
        repositoryId,
      }),
    getChangeSession: (sessionId: string) =>
      request<SessionDetail | null>('get_change_session', { sessionId }),
    startChangeSession: (repositoryId: string, changeRequest: string) =>
      request<string>('start_change_session', {
        input: { repositoryId, request: changeRequest },
      }),
    continueChangeSession: (sessionId: string, message: string) =>
      request<void>('continue_change_session', { input: { sessionId, message } }),
    verifyChangeSession: (sessionId: string) =>
      request<void>('verify_change_session', { sessionId }),
    cancelChangeSession: (sessionId: string) =>
      request<void>('cancel_change_session', { sessionId }),
    acceptChangeSession: (sessionId: string) =>
      request<string>('accept_change_session', { sessionId }),
    discardChangeSession: (sessionId: string) =>
      request<void>('discard_change_session', { sessionId }),
    resolveSessionApproval: (
      requestId: string | number,
      method: string,
      decision: 'accept' | 'acceptForSession' | 'decline',
    ) => request<void>('resolve_session_approval', { requestId, method, decision }),
    readArtifact: (path: string) => request<string>('read_artifact', { path }),
    revealArtifact: (path: string) => request<void>('reveal_artifact', { path }),
    quit: (force = false) => request<void>('quit_application', { force }),
  };
}

export type LocalApi = ReturnType<typeof createLocalApi>;
export const localApi = createLocalApi();

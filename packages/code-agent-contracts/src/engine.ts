import type { VerificationManifest } from '#/manifest';
import type { RunStatus, VerificationSummary } from '#/runs';

export interface EngineHealth {
  available: boolean;
  version?: string;
  authenticated: boolean;
  dockerAvailable: boolean;
  detail?: string;
}

export interface ImplementationInput {
  runId: string;
  workspace: string;
  task: string;
  manifest: VerificationManifest;
  signal?: AbortSignal;
}

export type EngineEvent =
  | { type: 'message'; message: string }
  | { type: 'command'; command: string; status: 'started' | 'completed' | 'failed' }
  | { type: 'file'; path: string; status: 'changed' | 'created' | 'deleted' }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'completed'; threadId?: string };

export interface ImplementationEngine {
  readonly id: 'codex-local';
  checkAvailability(): Promise<EngineHealth>;
  implement(input: ImplementationInput): AsyncIterable<EngineEvent>;
  cancel(runId: string): Promise<void>;
}

export interface LocalArtifactIndex {
  runId: string;
  patchPath?: string;
  logs: string[];
  screenshots: string[];
  tracePaths: string[];
  assertions: string[];
}

export interface SyncedRunSummary {
  engine: 'codex-local';
  codexVersion: string;
  baseCommitSha: string;
  status: RunStatus;
  verification: VerificationSummary;
  changedFileCount: number;
  startedAt: number;
  finishedAt?: number;
  terminalReason?: string;
}

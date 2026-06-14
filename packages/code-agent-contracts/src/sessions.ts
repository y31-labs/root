import type { VerificationGateKind, VerificationManifest } from '#/manifest';

export const changeSessionStatuses = [
  'preparing',
  'implementing',
  'verifying',
  'repairing',
  'verified',
  'needs_input',
  'failed',
  'cancelled',
  'accepted',
  'discarded',
] as const;

export type ChangeSessionStatus = (typeof changeSessionStatuses)[number];

export interface Repository {
  id: string;
  path: string;
  name: string;
  headSha: string;
  branch?: string;
  dirty: boolean;
  compatible: boolean;
  compatibilityDetail?: string;
  policy?: RepositoryPolicy;
  createdAt: number;
  updatedAt: number;
}

export interface RepositoryPolicy {
  repositoryId: string;
  manifest: VerificationManifest;
  fingerprint: string;
  fingerprintPaths: string[];
  approvedAt: number;
  valid: boolean;
}

export interface ChangeSession {
  id: string;
  repositoryId: string;
  request: string;
  baseSha: string;
  worktreePath: string;
  branchName?: string;
  codexThreadId?: string;
  status: ChangeSessionStatus;
  attempt: number;
  verificationDigest?: string;
  terminalReason?: string;
  createdAt: number;
  updatedAt: number;
}

export const sessionEventKinds = [
  'lifecycle',
  'agent',
  'command',
  'file',
  'approval',
  'browser',
  'gate',
  'system',
  'user',
  'repair',
] as const;

export type SessionEventKind = (typeof sessionEventKinds)[number];

export interface SessionEvent {
  id: number;
  sessionId: string;
  kind: SessionEventKind;
  message: string;
  createdAt: number;
}

export type SessionGateResultStatus = 'passed' | 'failed' | 'skipped';

export interface GateResult {
  id: number;
  sessionId: string;
  kind: VerificationGateKind | SafetyCheckKind;
  required: boolean;
  status: SessionGateResultStatus;
  attempt: number;
  durationMs: number;
  exitCode?: number;
  worktreeDigest: string;
  artifactIds: string[];
}

export const safetyCheckKinds = [
  'diff',
  'secrets',
  'symlinks',
  'fileSize',
  'fileMode',
  'policy',
  'stability',
] as const;
export type SafetyCheckKind = (typeof safetyCheckKinds)[number];

export interface VerificationSnapshot {
  sessionId: string;
  worktreeDigest: string;
  required: number;
  passed: number;
  failed: number;
  missing: number;
  hasDiff: boolean;
  verifiedAt: number;
}

export const sessionArtifactKinds = [
  'patch',
  'commandLog',
  'screenshot',
  'playwrightTrace',
  'assertions',
  'report',
] as const;

export type SessionArtifactKind = (typeof sessionArtifactKinds)[number];

export interface Artifact {
  id: string;
  sessionId: string;
  kind: SessionArtifactKind;
  path: string;
  label: string;
  createdAt: number;
}

const transitions: Record<ChangeSessionStatus, readonly ChangeSessionStatus[]> = {
  preparing: ['implementing', 'needs_input', 'failed', 'cancelled'],
  implementing: ['verifying', 'needs_input', 'failed', 'cancelled'],
  verifying: ['repairing', 'verified', 'needs_input', 'failed', 'cancelled'],
  repairing: ['implementing', 'verifying', 'needs_input', 'failed', 'cancelled'],
  verified: ['verifying', 'accepted', 'discarded'],
  needs_input: ['implementing', 'verifying', 'discarded'],
  failed: ['implementing', 'verifying', 'discarded'],
  cancelled: ['implementing', 'verifying', 'discarded'],
  accepted: [],
  discarded: [],
};

export function canTransitionSession(from: ChangeSessionStatus, to: ChangeSessionStatus) {
  return transitions[from].includes(to);
}

export function isFreshVerifiedSession(
  session: Pick<ChangeSession, 'status' | 'verificationDigest'>,
  snapshot: VerificationSnapshot | undefined,
  currentDigest: string,
) {
  return (
    session.status === 'verified' &&
    Boolean(session.verificationDigest) &&
    session.verificationDigest === currentDigest &&
    snapshot?.worktreeDigest === currentDigest &&
    snapshot.required > 0 &&
    snapshot.passed === snapshot.required &&
    snapshot.failed === 0 &&
    snapshot.missing === 0 &&
    snapshot.hasDiff
  );
}

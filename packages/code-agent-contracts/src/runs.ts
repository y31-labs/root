import type { VerificationGateKind } from '#/manifest';

export const runStatuses = [
  'queued',
  'preparing',
  'implementing',
  'verifying',
  'repairing',
  'verified',
  'failed',
  'cancelled',
  'needs_input',
] as const;

export type RunStatus = (typeof runStatuses)[number];
export type TerminalRunStatus = Extract<
  RunStatus,
  'verified' | 'failed' | 'cancelled' | 'needs_input'
>;

export const artifactKinds = [
  'patch',
  'commandLog',
  'screenshot',
  'playwrightTrace',
  'assertions',
] as const;

export type ArtifactKind = (typeof artifactKinds)[number];

export const gateResultStatuses = ['passed', 'failed', 'skipped'] as const;
export type GateResultStatus = (typeof gateResultStatuses)[number];

const transitions: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['preparing', 'cancelled'],
  preparing: ['implementing', 'failed', 'cancelled', 'needs_input'],
  implementing: ['verifying', 'failed', 'cancelled', 'needs_input'],
  verifying: ['repairing', 'verified', 'failed', 'cancelled', 'needs_input'],
  repairing: ['implementing', 'verifying', 'failed', 'cancelled', 'needs_input'],
  verified: [],
  failed: [],
  cancelled: [],
  needs_input: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus) {
  return transitions[from].includes(to);
}

export interface VerificationSummary {
  required: number;
  passed: number;
  failed: number;
  missing: number;
}

export interface GateResultInput {
  kind: VerificationGateKind;
  required: boolean;
  status: GateResultStatus;
}

export function summarizeVerification(
  requiredKinds: readonly VerificationGateKind[],
  results: readonly GateResultInput[],
): VerificationSummary {
  const latest = new Map(results.map((result) => [result.kind, result]));
  let passed = 0;
  let failed = 0;
  let missing = 0;

  for (const kind of requiredKinds) {
    const result = latest.get(kind);
    if (!result) missing += 1;
    else if (result.status === 'passed') passed += 1;
    else failed += 1;
  }

  return { required: requiredKinds.length, passed, failed, missing };
}

export function isVerifiedResult(summary: VerificationSummary, hasPatch: boolean) {
  return (
    hasPatch &&
    summary.required > 0 &&
    summary.passed === summary.required &&
    summary.failed === 0 &&
    summary.missing === 0
  );
}

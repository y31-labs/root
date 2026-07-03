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

export const repositoryTargetKinds = ['app', 'package', 'other'] as const;
export type RepositoryTargetKind = (typeof repositoryTargetKinds)[number];

export const repositoryTargetSources = ['detected', 'codex', 'manual'] as const;
export type RepositoryTargetSource = (typeof repositoryTargetSources)[number];

export const repositoryMappingModes = ['code', 'claude', 'cloudApi'] as const;
export type RepositoryMappingMode = (typeof repositoryMappingModes)[number];

export interface RepositoryProjectMap {
  version: 1;
  mode: RepositoryMappingMode;
  targets: RepositoryProjectMapTarget[];
}

export interface RepositoryProjectMapTarget {
  name: string;
  path: string;
  kind: RepositoryTargetKind;
  packageName?: string;
  scripts: Record<string, string>;
  selected: boolean;
}

export interface RepositoryTarget {
  id: string;
  repositoryId: string;
  name: string;
  path: string;
  kind: RepositoryTargetKind;
  packageName?: string;
  scripts: Record<string, string>;
  source: RepositoryTargetSource;
  selected: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TargetFlowOverview {
  snapshot: TargetFlowSnapshot;
  timeline: TargetFlowTimelineItem[];
}

export interface TargetFlowSnapshot {
  target: RepositoryTarget;
  flows: TargetFlow[];
  unscopedFlows: TargetFlow[];
  proposals: TargetFlowProposal[];
  invalidDocuments: TargetFlowInvalidDocument[];
  generatedAt: number;
}

export interface TargetFlow {
  flowId: string;
  name: string;
  goal: string;
  relativePath: string;
  digest: string;
  graph: TargetFlowGraph;
  sourcePaths: string[];
  coverageScenarios: TargetFlowCoverageScenario[];
}

export interface TargetFlowGraph {
  nodes: TargetFlowNode[];
  edges: TargetFlowEdge[];
  issues: TargetFlowIssue[];
}

export interface TargetFlowNode {
  id: string;
  stateId: string;
  label: string;
  kind: string;
  route?: string;
  status: 'unchanged' | 'added' | 'modified' | 'removed' | 'uncertain';
  coverage: TargetFlowCoverageSummary;
}

export interface TargetFlowEdge {
  id: string;
  transitionId: string;
  source: string;
  target: string;
  label: string;
  actor: string;
  status: 'unchanged' | 'added' | 'modified' | 'removed' | 'uncertain';
  coverage: TargetFlowCoverageSummary;
}

export interface TargetFlowIssue {
  severity: string;
  code: string;
  message: string;
}

export interface TargetFlowProposal {
  proposalId: string;
  flowId: string;
  summary: string;
  confidence: string;
  relativePath: string;
  digest: string;
  operationCount: number;
}

export interface TargetFlowInvalidDocument {
  kind: 'flow' | 'proposal' | 'coverage';
  relativePath: string;
  issueCount: number;
}

export type TargetFlowCoverageGate = 'e2e';
export type TargetFlowCoverageTargetKind = 'state' | 'transition';
export type TargetFlowCoverageEvidenceKind = 'screenshot' | 'playwrightTrace' | 'assertions';
export type TargetFlowCoverageStatus = 'covered' | 'partial' | 'missing';

export interface TargetFlowCoverageSummary {
  status: TargetFlowCoverageStatus;
  required: number;
  covered: number;
  missing: number;
  optional: number;
  scenarios: TargetFlowCoverageScenarioReference[];
}

export interface TargetFlowCoverageScenarioReference {
  scenarioId: string;
  title: string;
  behavior: string;
  required: boolean;
  covered: boolean;
}

export interface TargetFlowCoverageScenario {
  scenarioId: string;
  flowId: string;
  title: string;
  description: string;
  gate: TargetFlowCoverageGate;
  relativePath: string;
  digest: string;
  covers: TargetFlowCoverageCover[];
  expectedEvidence: TargetFlowCoverageExpectedEvidence[];
  evidence: TargetFlowCoverageEvidence[];
  latestSession?: TargetFlowCoverageSession;
}

export interface TargetFlowCoverageCover {
  kind: TargetFlowCoverageTargetKind;
  id: string;
  behavior: string;
  required: boolean;
  covered: boolean;
}

export interface TargetFlowCoverageExpectedEvidence {
  kind: TargetFlowCoverageEvidenceKind;
  label: string;
  required: boolean;
}

export interface TargetFlowCoverageEvidence {
  scenarioId: string;
  sessionId: string;
  artifactId: string;
  kind: TargetFlowCoverageEvidenceKind;
  label: string;
  path: string;
  createdAt: number;
  verifiedAt: number;
}

export interface TargetFlowCoverageSession {
  sessionId: string;
  request: string;
  status: ChangeSessionStatus;
  verifiedAt: number;
}

export type TargetFlowChangeType = 'added' | 'deleted' | 'modified' | 'renamed' | 'uncertain';

export interface TargetFlowTimelineItem {
  id: string;
  flowId?: string;
  flowName?: string;
  relativePath: string;
  changeType: TargetFlowChangeType;
  commitSha: string;
  commitSubject: string;
  committedAt: number;
  summary: string;
}

export interface ChangeSession {
  id: string;
  repositoryId: string;
  targetId?: string;
  targetName?: string;
  targetPath?: string;
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

export const parseRepositoryTarget = (value: unknown): RepositoryTarget => {
  const target = object(value, 'target');
  const kind = repositoryTargetKind(target.kind, 'target.kind');
  const source = stringEnum(target.source, repositoryTargetSources, 'target.source');

  return {
    id: nonEmptyString(target.id, 'target.id'),
    repositoryId: nonEmptyString(target.repositoryId, 'target.repositoryId'),
    name: nonEmptyString(target.name, 'target.name'),
    path: repositoryRelativePath(target.path, 'target.path'),
    kind,
    packageName:
      target.packageName === undefined
        ? undefined
        : nonEmptyString(target.packageName, 'target.packageName'),
    scripts: stringRecord(target.scripts, 'target.scripts'),
    source,
    selected: boolean(target.selected, 'target.selected'),
    createdAt: timestamp(target.createdAt, 'target.createdAt'),
    updatedAt: timestamp(target.updatedAt, 'target.updatedAt'),
  };
};

export const parseRepositoryMappingMode = (value: unknown): RepositoryMappingMode => {
  return stringEnum(value, repositoryMappingModes, 'mappingMode');
};

export const parseRepositoryProjectMap = (value: unknown): RepositoryProjectMap => {
  const map = object(value, 'projectMap');
  rejectUnknownKeys(map, projectMapKeys, 'projectMap');
  const version = literalOne(map.version, 'projectMap.version');
  const mode = parseRepositoryMappingMode(map.mode);
  const targets = array(map.targets, 'projectMap.targets').map((target, index) =>
    parseRepositoryProjectMapTarget(target, `projectMap.targets[${index}]`),
  );
  if (targets.length === 0) throw new Error('projectMap.targets must not be empty');
  const paths = new Set<string>();
  for (const target of targets) {
    if (paths.has(target.path)) throw new Error(`Duplicate project map target path: ${target.path}`);
    paths.add(target.path);
  }
  return { version, mode, targets };
};

const parseRepositoryProjectMapTarget = (
  value: unknown,
  path: string,
): RepositoryProjectMapTarget => {
  const target = object(value, path);
  rejectUnknownKeys(target, projectMapTargetKeys, path);
  return {
    name: nonEmptyString(target.name, `${path}.name`),
    path: repositoryRelativePath(target.path, `${path}.path`),
    kind: repositoryTargetKind(target.kind, `${path}.kind`),
    packageName:
      target.packageName === undefined
        ? undefined
        : nonEmptyString(target.packageName, `${path}.packageName`),
    scripts: stringRecord(target.scripts ?? {}, `${path}.scripts`),
    selected: target.selected === undefined ? true : boolean(target.selected, `${path}.selected`),
  };
};

const projectMapKeys = new Set(['version', 'mode', 'targets']);
const projectMapTargetKeys = new Set([
  'name',
  'path',
  'kind',
  'packageName',
  'scripts',
  'selected',
]);

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
};

const array = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
};

const rejectUnknownKeys = (value: Record<string, unknown>, keys: Set<string>, path: string) => {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`${path}.${key} is not supported`);
  }
};

const literalOne = (value: unknown, path: string): 1 => {
  if (value !== 1) throw new Error(`${path} must be 1`);
  return 1;
};

const nonEmptyString = (value: unknown, path: string) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
};

const repositoryRelativePath = (value: unknown, path: string) => {
  const text = nonEmptyString(value, path);
  if (text === '.') return text;
  if (
    text.startsWith('/') ||
    text.includes('\\') ||
    text.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`${path} must be repository-relative POSIX without dot segments`);
  }
  return text;
};

const stringRecord = (value: unknown, path: string) => {
  const record = object(value, path);
  if (Object.values(record).some((item) => typeof item !== 'string')) {
    throw new Error(`${path} must be a string map`);
  }
  return record as Record<string, string>;
};

const repositoryTargetKind = (value: unknown, path: string): RepositoryTargetKind => {
  if (value === 'manual') return 'other';
  return stringEnum(value, repositoryTargetKinds, path);
};

const stringEnum = <Value extends string>(
  value: unknown,
  values: readonly Value[],
  path: string,
) => {
  if (!values.includes(value as Value)) {
    throw new Error(`${path} is not supported`);
  }
  return value as Value;
};

const boolean = (value: unknown, path: string) => {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
};

const timestamp = (value: unknown, path: string) => {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }
  return Number(value);
};

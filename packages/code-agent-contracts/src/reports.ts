import { verificationGateKinds, type VerificationGateKind } from './manifest';
import {
  safetyCheckKinds,
  sessionArtifactKinds,
  type Artifact,
  type RepositoryTargetKind,
  type SafetyCheckKind,
  type SessionArtifactKind,
  type SessionGateResultStatus,
  type VerificationSnapshot,
} from './sessions';

export const evidenceReportVersion = 1 as const;

export interface EvidenceReportRepository {
  name: string;
  path: string;
  branch?: string;
}

export interface EvidenceReportTask {
  requestSummary: string;
}

export interface EvidenceReportTarget {
  name: string;
  path: string;
  kind: RepositoryTargetKind;
}

export interface EvidenceReportCheckBase {
  required: boolean;
  status: SessionGateResultStatus;
  attempt: number;
  durationMs: number;
  exitCode?: number;
  artifactIds: string[];
}

export interface EvidenceReportGateResult extends EvidenceReportCheckBase {
  kind: VerificationGateKind;
}

export interface EvidenceReportSafetyCheckResult extends EvidenceReportCheckBase {
  kind: SafetyCheckKind;
}

export interface EvidenceReportResultInput extends Omit<EvidenceReportCheckBase, 'artifactIds'> {
  kind: string;
  artifactIds: readonly string[];
}

export interface EvidenceReportArtifactIndexEntry {
  id: string;
  kind: SessionArtifactKind;
  path: string;
  label: string;
  createdAt: number;
}

export interface EvidenceReportPrivacy {
  sourceContentsIncluded: false;
  redactionNotes: string[];
  notes: string[];
}

export interface EvidenceReport {
  version: typeof evidenceReportVersion;
  sessionId: string;
  repository: EvidenceReportRepository;
  target?: EvidenceReportTarget;
  task: EvidenceReportTask;
  baseCommit: string;
  acceptedBranch?: string;
  verification: VerificationSnapshot;
  gates: EvidenceReportGateResult[];
  safetyChecks: EvidenceReportSafetyCheckResult[];
  artifacts: EvidenceReportArtifactIndexEntry[];
  privacy: EvidenceReportPrivacy;
  createdAt: number;
  exportedAt: number;
}

export interface BuildEvidenceReportInput {
  sessionId: string;
  repository: EvidenceReportRepository;
  target?: EvidenceReportTarget;
  requestSummary: string;
  baseCommit: string;
  acceptedBranch?: string;
  verification: VerificationSnapshot;
  results: readonly EvidenceReportResultInput[];
  artifacts: readonly Pick<Artifact, 'id' | 'kind' | 'path' | 'label' | 'createdAt'>[];
  privacy?: Partial<EvidenceReportPrivacy>;
  createdAt?: number;
  exportedAt?: number;
}

const rootKeys = new Set([
  'version',
  'sessionId',
  'repository',
  'target',
  'task',
  'baseCommit',
  'acceptedBranch',
  'verification',
  'gates',
  'safetyChecks',
  'artifacts',
  'privacy',
  'createdAt',
  'exportedAt',
]);
const repositoryKeys = new Set(['name', 'path', 'branch']);
const targetKeys = new Set(['name', 'path', 'kind']);
const taskKeys = new Set(['requestSummary']);
const snapshotKeys = new Set([
  'sessionId',
  'worktreeDigest',
  'required',
  'passed',
  'failed',
  'missing',
  'hasDiff',
  'verifiedAt',
]);
const checkKeys = new Set([
  'kind',
  'required',
  'status',
  'attempt',
  'durationMs',
  'exitCode',
  'artifactIds',
]);
const artifactKeys = new Set(['id', 'kind', 'path', 'label', 'createdAt']);
const privacyKeys = new Set(['sourceContentsIncluded', 'redactionNotes', 'notes']);
const gateKinds = new Set<string>(verificationGateKinds);
const safetyKinds = new Set<string>(safetyCheckKinds);
const artifactKinds = new Set<string>(sessionArtifactKinds);
const resultStatuses = new Set<SessionGateResultStatus>(['passed', 'failed', 'skipped']);

export const defaultEvidenceReportPrivacy = (): EvidenceReportPrivacy => ({
  sourceContentsIncluded: false,
  redactionNotes: [
    'Repository source contents are not embedded in this report.',
    'Artifacts are indexed by metadata only; command logs are expected to be redacted before export.',
  ],
  notes: [],
});

export const isVerificationGateKind = (value: string): value is VerificationGateKind =>
  gateKinds.has(value);

export const isSafetyCheckKind = (value: string): value is SafetyCheckKind =>
  safetyKinds.has(value);

export const buildEvidenceReport = (input: BuildEvidenceReportInput): EvidenceReport => {
  const gates: EvidenceReportGateResult[] = [];
  const safetyChecks: EvidenceReportSafetyCheckResult[] = [];

  for (const result of input.results) {
    const check = {
      required: result.required,
      status: result.status,
      attempt: result.attempt,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      artifactIds: [...result.artifactIds],
    };

    if (isVerificationGateKind(result.kind)) {
      gates.push({ ...check, kind: result.kind });
    } else if (isSafetyCheckKind(result.kind)) {
      safetyChecks.push({ ...check, kind: result.kind });
    } else {
      throw new Error(`Unsupported evidence report check kind: ${result.kind}`);
    }
  }

  const defaultPrivacy = defaultEvidenceReportPrivacy();
  const privacy = {
    ...defaultPrivacy,
    ...input.privacy,
    sourceContentsIncluded: false as const,
    redactionNotes:
      input.privacy?.redactionNotes === undefined
        ? [...defaultPrivacy.redactionNotes]
        : [...input.privacy.redactionNotes],
    notes: input.privacy?.notes === undefined ? [] : [...input.privacy.notes],
  };
  const exportedAt = input.exportedAt ?? input.createdAt ?? Date.now();

  return parseEvidenceReport({
    version: evidenceReportVersion,
    sessionId: input.sessionId,
    repository: input.repository,
    target: input.target,
    task: { requestSummary: input.requestSummary },
    baseCommit: input.baseCommit,
    acceptedBranch: input.acceptedBranch,
    verification: input.verification,
    gates,
    safetyChecks,
    artifacts: input.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      path: artifact.path,
      label: artifact.label,
      createdAt: artifact.createdAt,
    })),
    privacy,
    createdAt: input.createdAt ?? exportedAt,
    exportedAt,
  });
};

export const parseEvidenceReport = (value: unknown): EvidenceReport => {
  const report = object(value, 'report');
  rejectUnknown(report, rootKeys, 'report');
  if (report.version !== evidenceReportVersion) {
    throw new Error(`report.version must be ${evidenceReportVersion}`);
  }

  const sessionId = nonEmptyString(report.sessionId, 'report.sessionId');
  const createdAt = timestamp(report.createdAt, 'report.createdAt');
  const exportedAt = timestamp(report.exportedAt, 'report.exportedAt');
  if (exportedAt < createdAt) {
    throw new Error('report.exportedAt must be greater than or equal to report.createdAt');
  }

  const verification = parseVerificationSnapshot(report.verification, 'report.verification');
  if (verification.sessionId !== sessionId) {
    throw new Error('report.verification.sessionId must match report.sessionId');
  }

  const artifacts = array(report.artifacts, 'report.artifacts').map((artifact, index) =>
    parseArtifact(artifact, `report.artifacts.${index}`),
  );
  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const gates = array(report.gates, 'report.gates').map((result, index) =>
    parseGateResult(result, `report.gates.${index}`, artifactIds),
  );
  const safetyChecks = array(report.safetyChecks, 'report.safetyChecks').map((result, index) =>
    parseSafetyCheckResult(result, `report.safetyChecks.${index}`, artifactIds),
  );

  return {
    version: evidenceReportVersion,
    sessionId,
    repository: parseRepository(report.repository, 'report.repository'),
    target: report.target === undefined ? undefined : parseTarget(report.target, 'report.target'),
    task: parseTask(report.task, 'report.task'),
    baseCommit: nonEmptyString(report.baseCommit, 'report.baseCommit'),
    acceptedBranch:
      report.acceptedBranch === undefined
        ? undefined
        : nonEmptyString(report.acceptedBranch, 'report.acceptedBranch'),
    verification,
    gates,
    safetyChecks,
    artifacts,
    privacy: parsePrivacy(report.privacy, 'report.privacy'),
    createdAt,
    exportedAt,
  };
};

const parseTarget = (value: unknown, path: string): EvidenceReportTarget => {
  const target = object(value, path);
  rejectUnknown(target, targetKeys, path);
  const kind = nonEmptyString(target.kind, `${path}.kind`);
  if (!['app', 'package', 'manual'].includes(kind)) {
    throw new Error(`${path}.kind is not supported`);
  }
  return {
    name: nonEmptyString(target.name, `${path}.name`),
    path: nonEmptyString(target.path, `${path}.path`),
    kind: kind as RepositoryTargetKind,
  };
};

const parseRepository = (value: unknown, path: string): EvidenceReportRepository => {
  const repository = object(value, path);
  rejectUnknown(repository, repositoryKeys, path);
  return {
    name: nonEmptyString(repository.name, `${path}.name`),
    path: nonEmptyString(repository.path, `${path}.path`),
    branch:
      repository.branch === undefined
        ? undefined
        : nonEmptyString(repository.branch, `${path}.branch`),
  };
};

const parseTask = (value: unknown, path: string): EvidenceReportTask => {
  const task = object(value, path);
  rejectUnknown(task, taskKeys, path);
  return { requestSummary: nonEmptyString(task.requestSummary, `${path}.requestSummary`) };
};

const parseVerificationSnapshot = (value: unknown, path: string): VerificationSnapshot => {
  const snapshot = object(value, path);
  rejectUnknown(snapshot, snapshotKeys, path);
  return {
    sessionId: nonEmptyString(snapshot.sessionId, `${path}.sessionId`),
    worktreeDigest: nonEmptyString(snapshot.worktreeDigest, `${path}.worktreeDigest`),
    required: count(snapshot.required, `${path}.required`),
    passed: count(snapshot.passed, `${path}.passed`),
    failed: count(snapshot.failed, `${path}.failed`),
    missing: count(snapshot.missing, `${path}.missing`),
    hasDiff: boolean(snapshot.hasDiff, `${path}.hasDiff`),
    verifiedAt: timestamp(snapshot.verifiedAt, `${path}.verifiedAt`),
  };
};

const parseGateResult = (
  value: unknown,
  path: string,
  artifactIds: ReadonlySet<string>,
): EvidenceReportGateResult => {
  const check = parseCheck(value, path, artifactIds);
  if (!isVerificationGateKind(check.kind)) {
    throw new Error(`${path}.kind must be a verification gate kind`);
  }
  return { ...check, kind: check.kind };
};

const parseSafetyCheckResult = (
  value: unknown,
  path: string,
  artifactIds: ReadonlySet<string>,
): EvidenceReportSafetyCheckResult => {
  const check = parseCheck(value, path, artifactIds);
  if (!isSafetyCheckKind(check.kind)) {
    throw new Error(`${path}.kind must be a safety check kind`);
  }
  return { ...check, kind: check.kind };
};

const parseCheck = (
  value: unknown,
  path: string,
  artifactIds: ReadonlySet<string>,
): EvidenceReportCheckBase & { kind: string } => {
  const check = object(value, path);
  rejectUnknown(check, checkKeys, path);
  const ids = stringArray(check.artifactIds, `${path}.artifactIds`);
  for (const id of ids) {
    if (!artifactIds.has(id)) {
      throw new Error(`${path}.artifactIds references unknown artifact ${id}`);
    }
  }
  return {
    kind: nonEmptyString(check.kind, `${path}.kind`),
    required: boolean(check.required, `${path}.required`),
    status: resultStatus(check.status, `${path}.status`),
    attempt: count(check.attempt, `${path}.attempt`),
    durationMs: count(check.durationMs, `${path}.durationMs`),
    exitCode:
      check.exitCode === undefined ? undefined : integer(check.exitCode, `${path}.exitCode`),
    artifactIds: ids,
  };
};

const parseArtifact = (value: unknown, path: string): EvidenceReportArtifactIndexEntry => {
  const artifact = object(value, path);
  rejectUnknown(artifact, artifactKeys, path);
  const kind = nonEmptyString(artifact.kind, `${path}.kind`);
  if (!artifactKinds.has(kind)) throw new Error(`${path}.kind is not supported`);
  return {
    id: nonEmptyString(artifact.id, `${path}.id`),
    kind: kind as SessionArtifactKind,
    path: nonEmptyString(artifact.path, `${path}.path`),
    label: nonEmptyString(artifact.label, `${path}.label`),
    createdAt: timestamp(artifact.createdAt, `${path}.createdAt`),
  };
};

const parsePrivacy = (value: unknown, path: string): EvidenceReportPrivacy => {
  const privacy = object(value, path);
  rejectUnknown(privacy, privacyKeys, path);
  if (privacy.sourceContentsIncluded !== false) {
    throw new Error(`${path}.sourceContentsIncluded must be false`);
  }
  return {
    sourceContentsIncluded: false,
    redactionNotes: stringArray(privacy.redactionNotes, `${path}.redactionNotes`),
    notes: stringArray(privacy.notes, `${path}.notes`),
  };
};

const resultStatus = (value: unknown, path: string): SessionGateResultStatus => {
  if (!resultStatuses.has(value as SessionGateResultStatus)) {
    throw new Error(`${path} must be passed, failed, or skipped`);
  }
  return value as SessionGateResultStatus;
};

const array = (value: unknown, path: string) => {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
};

const stringArray = (value: unknown, path: string) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${path} must be an array of strings`);
  }
  return [...value];
};

const timestamp = (value: unknown, path: string) => {
  const result = integer(value, path);
  if (result < 0) throw new Error(`${path} must be a non-negative integer`);
  return result;
};

const count = (value: unknown, path: string) => {
  const result = integer(value, path);
  if (result < 0) throw new Error(`${path} must be a non-negative integer`);
  return result;
};

const integer = (value: unknown, path: string) => {
  if (!Number.isInteger(value)) throw new Error(`${path} must be an integer`);
  return Number(value);
};

const boolean = (value: unknown, path: string) => {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
};

const nonEmptyString = (value: unknown, path: string) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
};

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
};

const rejectUnknown = (value: Record<string, unknown>, keys: Set<string>, path: string) => {
  const unknown = Object.keys(value).find((key) => !keys.has(key));
  if (unknown) throw new Error(`${path}.${unknown} is not supported`);
};

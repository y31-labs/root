import {
  flowguardHostToWebviewMessageTypes,
  flowguardMessageProtocol,
  flowguardMessageVersion,
  flowguardWebviewToHostMessageTypes,
  type FlowguardHostToWebviewMessage,
  type FlowguardMessageValidationResult,
  type FlowguardOpenIntent,
  type FlowguardProposalDecisionIntent,
  type FlowguardRevealSourceIntent,
  type FlowguardRevealSourceTarget,
  type FlowguardWebviewToHostMessage,
} from '#/shared/messages/types';

type UnknownRecord = Record<string, unknown>;

const graphNodeKinds = ['page', 'dialog', 'panel', 'system', 'terminal'] as const;
const graphActors = ['user', 'system', 'external'] as const;
const graphStatuses = ['unchanged', 'added', 'modified', 'removed', 'uncertain'] as const;
const issueSeverities = ['error', 'warning'] as const;

export const parseFlowguardHostToWebviewMessage = (
  value: unknown,
): FlowguardMessageValidationResult<FlowguardHostToWebviewMessage> => {
  const errors: string[] = [];
  const message = validateEnvelope(value, flowguardHostToWebviewMessageTypes, '$', errors);

  if (message === undefined) return invalid(errors);

  switch (message.type) {
    case 'host/snapshot':
      validateWebviewSnapshot(message.payload, '$.payload', errors);
      break;
    case 'host/open':
      validateOpenIntent(message.payload, '$.payload', errors);
      break;
    case 'host/error':
      validateHostError(message.payload, '$.payload', errors);
      break;
  }

  return errors.length === 0 ? valid(message as FlowguardHostToWebviewMessage) : invalid(errors);
};

export const parseFlowguardWebviewToHostMessage = (
  value: unknown,
): FlowguardMessageValidationResult<FlowguardWebviewToHostMessage> => {
  const errors: string[] = [];
  const message = validateEnvelope(value, flowguardWebviewToHostMessageTypes, '$', errors);

  if (message === undefined) return invalid(errors);

  switch (message.type) {
    case 'webview/ready':
    case 'intent/refresh':
      validateEmptyPayload(message.payload, '$.payload', errors);
      break;
    case 'intent/open':
      validateOpenIntent(message.payload, '$.payload', errors);
      break;
    case 'intent/reveal-source':
      validateRevealSourceIntent(message.payload, '$.payload', errors);
      break;
    case 'intent/accept':
    case 'intent/reject':
      validateProposalDecisionIntent(message.payload, '$.payload', errors);
      break;
  }

  return errors.length === 0 ? valid(message as FlowguardWebviewToHostMessage) : invalid(errors);
};

export const isSafeRepositoryRelativePath = (value: string): boolean => {
  if (value.length === 0) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(value)) return false;

  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
};

export const validateOpenIntent = (
  value: unknown,
  path = '$',
  errors: string[] = [],
): value is FlowguardOpenIntent => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return false;

  requireNonEmptyString(record.rootUri, `${path}.rootUri`, errors);
  requireNonEmptyString(record.flowId, `${path}.flowId`, errors);
  validateOptionalIdentifier(record.proposalId, `${path}.proposalId`, errors);

  return errors.length === 0;
};

export const validateRevealSourceIntent = (
  value: unknown,
  path = '$',
  errors: string[] = [],
): value is FlowguardRevealSourceIntent => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return false;

  requireNonEmptyString(record.rootUri, `${path}.rootUri`, errors);
  requireNonEmptyString(record.flowId, `${path}.flowId`, errors);
  validateOptionalIdentifier(record.proposalId, `${path}.proposalId`, errors);

  if (typeof record.sourcePath !== 'string' || !isSafeRepositoryRelativePath(record.sourcePath)) {
    errors.push(`${path}.sourcePath must be a repository-relative POSIX path.`);
  }

  if (record.target !== undefined) {
    validateRevealSourceTarget(record.target, `${path}.target`, errors);
  }

  return errors.length === 0;
};

export const validateProposalDecisionIntent = (
  value: unknown,
  path = '$',
  errors: string[] = [],
): value is FlowguardProposalDecisionIntent => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return false;

  requireNonEmptyString(record.rootUri, `${path}.rootUri`, errors);
  requireNonEmptyString(record.proposalId, `${path}.proposalId`, errors);

  return errors.length === 0;
};

const validateEnvelope = <TType extends string>(
  value: unknown,
  allowedTypes: readonly TType[],
  path: string,
  errors: string[],
):
  | {
      readonly protocol: typeof flowguardMessageProtocol;
      readonly version: typeof flowguardMessageVersion;
      readonly type: TType;
      readonly payload: unknown;
    }
  | undefined => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return undefined;

  if (record.protocol !== flowguardMessageProtocol) {
    errors.push(`${path}.protocol must be "${flowguardMessageProtocol}".`);
  }

  if (record.version !== flowguardMessageVersion) {
    errors.push(`${path}.version must be ${flowguardMessageVersion}.`);
  }

  if (!isOneOf(record.type, allowedTypes)) {
    errors.push(`${path}.type is not a supported Flowguard message type.`);
    return undefined;
  }

  if (!hasOwn(record, 'payload')) {
    errors.push(`${path}.payload is required.`);
    return undefined;
  }

  return {
    protocol: flowguardMessageProtocol,
    version: flowguardMessageVersion,
    type: record.type,
    payload: record.payload,
  };
};

const validateHostError = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  if (!isOneOf(record.code, ['INVALID_MESSAGE', 'INTENT_REJECTED', 'HANDLER_ERROR'] as const)) {
    errors.push(`${path}.code must be a supported host error code.`);
  }
  requireNonEmptyString(record.message, `${path}.message`, errors);
};

const validateWebviewSnapshot = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  if (record.version !== 1) errors.push(`${path}.version must be 1.`);
  requireNonNegativeInteger(record.sequence, `${path}.sequence`, errors);
  requireNonEmptyString(record.generatedAt, `${path}.generatedAt`, errors);

  validateArray(record.repositories, `${path}.repositories`, errors, (repository, itemPath) =>
    validateRepositorySnapshot(repository, itemPath, errors),
  );
};

const validateRepositorySnapshot = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  validateWorkspaceRoot(record.root, `${path}.root`, errors);
  validateArray(record.flows, `${path}.flows`, errors, (flow, itemPath) =>
    validateFlowSnapshot(flow, itemPath, errors),
  );
  validateArray(record.proposals, `${path}.proposals`, errors, (proposal, itemPath) =>
    validateProposalSnapshot(proposal, itemPath, errors),
  );
  validateArray(record.invalidDocuments, `${path}.invalidDocuments`, errors, (document, itemPath) =>
    validateInvalidDocumentSnapshot(document, itemPath, errors),
  );
};

const validateWorkspaceRoot = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  requireNonEmptyString(record.uri, `${path}.uri`, errors);
  requireNonEmptyString(record.name, `${path}.name`, errors);
  requireNonNegativeInteger(record.index, `${path}.index`, errors);
};

const validateFlowSnapshot = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  requireNonEmptyString(record.flowId, `${path}.flowId`, errors);
  requireNonEmptyString(record.name, `${path}.name`, errors);
  requireNonEmptyString(record.goal, `${path}.goal`, errors);
  validateRelativePathField(record.relativePath, `${path}.relativePath`, errors);
  validateDigest(record.digest, `${path}.digest`, errors);
  validateGraph(record.graph, `${path}.graph`, errors);
  validateArray(record.sourceReferences, `${path}.sourceReferences`, errors, (source, itemPath) =>
    validateSourceReference(source, itemPath, errors),
  );
};

const validateProposalSnapshot = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  requireNonEmptyString(record.proposalId, `${path}.proposalId`, errors);
  requireNonEmptyString(record.flowId, `${path}.flowId`, errors);
  requireNonEmptyString(record.summary, `${path}.summary`, errors);
  if (!isOneOf(record.confidence, ['low', 'medium', 'high'] as const)) {
    errors.push(`${path}.confidence must be low, medium, or high.`);
  }
  validateRelativePathField(record.relativePath, `${path}.relativePath`, errors);
  validateDigest(record.digest, `${path}.digest`, errors);
  if (record.graph !== undefined) validateGraph(record.graph, `${path}.graph`, errors);
  validateArray(record.sourceReferences, `${path}.sourceReferences`, errors, (source, itemPath) =>
    validateSourceReference(source, itemPath, errors),
  );
};

const validateInvalidDocumentSnapshot = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  if (!isOneOf(record.kind, ['config', 'flow', 'proposal'] as const)) {
    errors.push(`${path}.kind must be config, flow, or proposal.`);
  }
  validateRelativePathField(record.relativePath, `${path}.relativePath`, errors);
  requireNonNegativeInteger(record.issueCount, `${path}.issueCount`, errors);
};

const validateSourceReference = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  validateRevealSourceTarget(record.target, `${path}.target`, errors);
  requireNonEmptyString(record.label, `${path}.label`, errors);
  validateArray(record.sources, `${path}.sources`, errors, (source, itemPath) =>
    validateRelativePathField(source, itemPath, errors),
  );
};

const validateRevealSourceTarget = (
  value: unknown,
  path: string,
  errors: string[],
): value is FlowguardRevealSourceTarget => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return false;

  if (record.kind === 'state') {
    requireNonEmptyString(record.stateId, `${path}.stateId`, errors);
    return errors.length === 0;
  }

  if (record.kind === 'transition') {
    requireNonEmptyString(record.transitionId, `${path}.transitionId`, errors);
    return errors.length === 0;
  }

  errors.push(`${path}.kind must be state or transition.`);
  return false;
};

const validateGraph = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  requireNonEmptyString(record.flowId, `${path}.flowId`, errors);
  validateArray(record.nodes, `${path}.nodes`, errors, (node, itemPath) =>
    validateGraphNode(node, itemPath, errors),
  );
  validateArray(record.edges, `${path}.edges`, errors, (edge, itemPath) =>
    validateGraphEdge(edge, itemPath, errors),
  );
  validateArray(record.issues, `${path}.issues`, errors, (issue, itemPath) =>
    validateGraphIssue(issue, itemPath, errors),
  );
};

const validateGraphNode = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  requireNonEmptyString(record.id, `${path}.id`, errors);
  requireNonEmptyString(record.stateId, `${path}.stateId`, errors);
  requireNonEmptyString(record.label, `${path}.label`, errors);
  if (!isOneOf(record.kind, graphNodeKinds)) errors.push(`${path}.kind is not supported.`);
  if (!isOneOf(record.status, graphStatuses)) errors.push(`${path}.status is not supported.`);
  if (record.route !== undefined) requireNonEmptyString(record.route, `${path}.route`, errors);
};

const validateGraphEdge = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  requireNonEmptyString(record.id, `${path}.id`, errors);
  requireNonEmptyString(record.transitionId, `${path}.transitionId`, errors);
  requireNonEmptyString(record.source, `${path}.source`, errors);
  requireNonEmptyString(record.target, `${path}.target`, errors);
  requireNonEmptyString(record.label, `${path}.label`, errors);
  if (!isOneOf(record.actor, graphActors)) errors.push(`${path}.actor is not supported.`);
  if (!isOneOf(record.status, graphStatuses)) errors.push(`${path}.status is not supported.`);
};

const validateGraphIssue = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  if (!isOneOf(record.severity, issueSeverities)) {
    errors.push(`${path}.severity must be error or warning.`);
  }
  requireNonEmptyString(record.code, `${path}.code`, errors);
  requireNonEmptyString(record.message, `${path}.message`, errors);
  if (record.path !== undefined) requireNonEmptyString(record.path, `${path}.path`, errors);
  if (record.stateId !== undefined)
    requireNonEmptyString(record.stateId, `${path}.stateId`, errors);
  if (record.transitionId !== undefined) {
    requireNonEmptyString(record.transitionId, `${path}.transitionId`, errors);
  }
};

const validateEmptyPayload = (value: unknown, path: string, errors: string[]): void => {
  const record = requireRecord(value, path, errors);
  if (record === undefined) return;

  if (Object.keys(record).length > 0) {
    errors.push(`${path} must be an empty object.`);
  }
};

const validateOptionalIdentifier = (value: unknown, path: string, errors: string[]): void => {
  if (value === undefined) return;
  requireNonEmptyString(value, path, errors);
};

const validateRelativePathField = (value: unknown, path: string, errors: string[]): void => {
  if (typeof value !== 'string' || !isSafeRepositoryRelativePath(value)) {
    errors.push(`${path} must be a repository-relative POSIX path.`);
  }
};

const validateDigest = (value: unknown, path: string, errors: string[]): void => {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    errors.push(`${path} must be a sha256 digest.`);
  }
};

const validateArray = (
  value: unknown,
  path: string,
  errors: string[],
  validateItem: (value: unknown, path: string) => void,
): void => {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }

  value.forEach((item, index) => validateItem(item, `${path}[${index}]`));
};

const requireRecord = (
  value: unknown,
  path: string,
  errors: string[],
): UnknownRecord | undefined => {
  if (isRecord(value)) return value;

  errors.push(`${path} must be an object.`);
  return undefined;
};

const requireNonEmptyString = (value: unknown, path: string, errors: string[]): void => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    errors.push(`${path} must be a non-empty string.`);
  }
};

const requireNonNegativeInteger = (value: unknown, path: string, errors: string[]): void => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    errors.push(`${path} must be a non-negative integer.`);
  }
};

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T => {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
};

const hasOwn = (value: UnknownRecord, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const valid = <T>(value: T): FlowguardMessageValidationResult<T> => {
  return { ok: true, value };
};

const invalid = <T>(errors: readonly string[]): FlowguardMessageValidationResult<T> => {
  return { ok: false, errors };
};

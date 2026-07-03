import {
  errorIssue,
  parseResult,
  warningIssue,
  type ParseResult,
  type SemanticIssue,
} from '#/issues';
import { jsonPath, jsonPathRoot } from '#/paths';
import {
  flowguardFlowContractVersion,
  defaultFlowguardConfig,
  flowCoverageEvidenceKinds,
  flowCoverageGates,
  flowCoverageTargetKinds,
  flowActors,
  flowProposalConfidences,
  flowProposalOperations,
  flowStateKinds,
  type FlowCoverageDocument,
  type FlowCoverageEvidenceExpectation,
  type FlowCoverageTarget,
  type FlowguardFlow,
  type FlowMetadataPatch,
  type FlowProposal,
  type FlowProposalConfidence,
  type FlowProposalOperation,
  type FlowProposalOperationName,
  type FlowState,
  type FlowStatePatch,
  type FlowTransition,
  type FlowTransitionPatch,
  type FlowguardConfig,
} from '#/types';

type RawObject = Record<string, unknown>;

const flowKeys = new Set([
  'version',
  'id',
  'name',
  'goal',
  'entryStateId',
  'states',
  'transitions',
]);
const stateKeys = new Set(['id', 'name', 'kind', 'route', 'description', 'sources', 'tags']);
const transitionKeys = new Set([
  'id',
  'from',
  'to',
  'actor',
  'action',
  'condition',
  'outcome',
  'sources',
  'tags',
]);
const configKeys = new Set([
  'version',
  'flowDirectory',
  'proposalDirectory',
  'coverageDirectory',
]);
const proposalKeys = new Set([
  'version',
  'id',
  'flowId',
  'baseDigest',
  'createdAt',
  'producer',
  'summary',
  'confidence',
  'operations',
]);
const coverageKeys = new Set([
  'version',
  'id',
  'flowId',
  'title',
  'description',
  'gate',
  'covers',
  'evidence',
]);
const coverageTargetKeys = new Set(['kind', 'id', 'behavior', 'required']);
const coverageEvidenceKeys = new Set(['kind', 'label', 'required']);
const producerKeys = new Set(['kind', 'label']);
const statePatchKeys = new Set(['name', 'kind', 'route', 'description', 'sources', 'tags']);
const transitionPatchKeys = new Set([
  'from',
  'to',
  'actor',
  'action',
  'condition',
  'outcome',
  'sources',
  'tags',
]);
const metadataPatchKeys = new Set(['name', 'goal', 'entryStateId']);

const operationKeys: Record<FlowProposalOperationName, Set<string>> = {
  addState: new Set(['op', 'state', 'reason']),
  updateState: new Set(['op', 'stateId', 'patch', 'reason']),
  removeState: new Set(['op', 'stateId', 'reason']),
  addTransition: new Set(['op', 'transition', 'reason']),
  updateTransition: new Set(['op', 'transitionId', 'patch', 'reason']),
  removeTransition: new Set(['op', 'transitionId', 'reason']),
  updateFlow: new Set(['op', 'patch', 'reason']),
};

const lowerKebabIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const sha256DigestPattern = /^sha256:[0-9a-f]{64}$/;
const implementationActionPattern =
  /[A-Za-z_$][\w$]*\s*\(|\b(?:call|invoke|execute)\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/i;

export const parseFlowguardConfigJson = (text: string): ParseResult<FlowguardConfig> => {
  return parseJson(text, parseFlowguardConfig);
};

export const parseFlowguardFlowJson = (text: string): ParseResult<FlowguardFlow> => {
  return parseJson(text, parseFlowguardFlow);
};

export const parseFlowProposalJson = (text: string): ParseResult<FlowProposal> => {
  return parseJson(text, parseFlowProposal);
};

export const parseFlowCoverageDocumentJson = (
  text: string,
): ParseResult<FlowCoverageDocument> => {
  return parseJson(text, parseFlowCoverageDocument);
};

export const parseFlowguardConfig = (value: unknown): ParseResult<FlowguardConfig> => {
  const issues: SemanticIssue[] = [];
  const root = readObject(value, jsonPathRoot, issues);
  if (!root) return parseResult<FlowguardConfig>(undefined, issues);

  rejectUnknownKeys(root, configKeys, jsonPathRoot, issues);
  const version = readVersion1(root, jsonPathRoot, issues);
  const flowDirectory = readRequiredString(root, 'flowDirectory', jsonPathRoot, issues);
  const proposalDirectory = readRequiredString(root, 'proposalDirectory', jsonPathRoot, issues);
  const coverageDirectory =
    readOptionalString(root, 'coverageDirectory', jsonPathRoot, issues) ??
    defaultFlowguardConfig.coverageDirectory;

  const config =
    version && flowDirectory && proposalDirectory
      ? { version, flowDirectory, proposalDirectory, coverageDirectory }
      : undefined;

  if (config) {
    issues.push(...validateFlowguardConfig(config));
  }

  return parseResult(config, issues);
};

export const parseFlowguardFlow = (value: unknown): ParseResult<FlowguardFlow> => {
  const issues: SemanticIssue[] = [];
  const root = readObject(value, jsonPathRoot, issues);
  if (!root) return parseResult<FlowguardFlow>(undefined, issues);

  rejectUnknownKeys(root, flowKeys, jsonPathRoot, issues);
  const version = readVersion1(root, jsonPathRoot, issues);
  const id = readRequiredString(root, 'id', jsonPathRoot, issues);
  const name = readRequiredString(root, 'name', jsonPathRoot, issues);
  const goal = readRequiredString(root, 'goal', jsonPathRoot, issues);
  const entryStateId = readRequiredString(root, 'entryStateId', jsonPathRoot, issues);
  const states = readRequiredArray(root, 'states', jsonPathRoot, issues)?.map((item, index) =>
    parseFlowStateValue(item, jsonPath(jsonPath(jsonPathRoot, 'states'), index), issues),
  );
  const transitions = readRequiredArray(root, 'transitions', jsonPathRoot, issues)?.map(
    (item, index) =>
      parseFlowTransitionValue(
        item,
        jsonPath(jsonPath(jsonPathRoot, 'transitions'), index),
        issues,
      ),
  );

  const parsedStates = compact(states);
  const parsedTransitions = compact(transitions);
  const flow =
    version && id && name && goal && entryStateId && states && transitions
      ? {
          version,
          id,
          name,
          goal,
          entryStateId,
          states: parsedStates,
          transitions: parsedTransitions,
        }
      : undefined;

  if (flow) {
    issues.push(...validateFlowguardFlow(flow));
  }

  return parseResult(flow, issues);
};

export const parseFlowProposal = (value: unknown): ParseResult<FlowProposal> => {
  const issues: SemanticIssue[] = [];
  const root = readObject(value, jsonPathRoot, issues);
  if (!root) return parseResult<FlowProposal>(undefined, issues);

  rejectUnknownKeys(root, proposalKeys, jsonPathRoot, issues);
  const version = readVersion1(root, jsonPathRoot, issues);
  const id = readRequiredString(root, 'id', jsonPathRoot, issues);
  const flowId = readRequiredString(root, 'flowId', jsonPathRoot, issues);
  const baseDigest = readRequiredString(root, 'baseDigest', jsonPathRoot, issues);
  const createdAt = readRequiredString(root, 'createdAt', jsonPathRoot, issues);
  const producer = parseProposalProducer(root.producer, jsonPath(jsonPathRoot, 'producer'), issues);
  const summary = readRequiredString(root, 'summary', jsonPathRoot, issues);
  const confidence = readRequiredEnum(
    root,
    'confidence',
    jsonPathRoot,
    flowProposalConfidences,
    issues,
  );
  const operations = readRequiredArray(root, 'operations', jsonPathRoot, issues)?.map(
    (item, index) =>
      parseProposalOperationValue(
        item,
        jsonPath(jsonPath(jsonPathRoot, 'operations'), index),
        issues,
      ),
  );

  const parsedOperations = compact(operations);
  const proposal =
    version &&
    id &&
    flowId &&
    baseDigest &&
    createdAt &&
    producer &&
    summary &&
    confidence &&
    operations
      ? {
          version,
          id,
          flowId,
          baseDigest: baseDigest as FlowProposal['baseDigest'],
          createdAt,
          producer,
          summary,
          confidence,
          operations: parsedOperations,
        }
      : undefined;

  if (proposal) {
    issues.push(...validateFlowProposal(proposal));
  }

  return parseResult(proposal, issues);
};

export const parseFlowCoverageDocument = (value: unknown): ParseResult<FlowCoverageDocument> => {
  const issues: SemanticIssue[] = [];
  const root = readObject(value, jsonPathRoot, issues);
  if (!root) return parseResult<FlowCoverageDocument>(undefined, issues);

  rejectUnknownKeys(root, coverageKeys, jsonPathRoot, issues);
  const version = readVersion1(root, jsonPathRoot, issues);
  const id = readRequiredString(root, 'id', jsonPathRoot, issues);
  const flowId = readRequiredString(root, 'flowId', jsonPathRoot, issues);
  const title = readRequiredString(root, 'title', jsonPathRoot, issues);
  const description = readRequiredString(root, 'description', jsonPathRoot, issues);
  const gate = readRequiredEnum(root, 'gate', jsonPathRoot, flowCoverageGates, issues);
  const covers = readRequiredArray(root, 'covers', jsonPathRoot, issues)?.map((item, index) =>
    parseCoverageTargetValue(item, jsonPath(jsonPath(jsonPathRoot, 'covers'), index), issues),
  );
  const evidence = readRequiredArray(root, 'evidence', jsonPathRoot, issues)?.map((item, index) =>
    parseCoverageEvidenceValue(item, jsonPath(jsonPath(jsonPathRoot, 'evidence'), index), issues),
  );

  const parsedCovers = compact(covers);
  const parsedEvidence = compact(evidence);
  const coverage =
    version && id && flowId && title && description && gate && covers && evidence
      ? {
          version,
          id,
          flowId,
          title,
          description,
          gate,
          covers: parsedCovers,
          evidence: parsedEvidence,
        }
      : undefined;

  if (coverage) {
    issues.push(...validateFlowCoverageDocument(coverage));
  }

  return parseResult(coverage, issues);
};

export const defaultConfigForMissingDocument = (): FlowguardConfig => {
  return { ...defaultFlowguardConfig };
};

export const migrateFlowguardConfigDocument = (value: unknown): ParseResult<FlowguardConfig> => {
  return parseFlowguardConfig(value);
};

export const migrateFlowguardFlowDocument = (value: unknown): ParseResult<FlowguardFlow> => {
  return parseFlowguardFlow(value);
};

export const migrateFlowProposalDocument = (value: unknown): ParseResult<FlowProposal> => {
  return parseFlowProposal(value);
};

export const migrateFlowCoverageDocument = (
  value: unknown,
): ParseResult<FlowCoverageDocument> => {
  return parseFlowCoverageDocument(value);
};

export const validateFlowguardConfig = (
  config: FlowguardConfig,
  path = jsonPathRoot,
): SemanticIssue[] => {
  const issues: SemanticIssue[] = [];

  if (config.version !== flowguardFlowContractVersion) {
    issues.push(
      errorIssue(
        'UNSUPPORTED_VERSION',
        jsonPath(path, 'version'),
        `Unsupported document version ${String(config.version)}.`,
      ),
    );
  }
  validateRepositoryPath(config.flowDirectory, jsonPath(path, 'flowDirectory'), issues);
  validateRepositoryPath(config.proposalDirectory, jsonPath(path, 'proposalDirectory'), issues);
  validateRepositoryPath(config.coverageDirectory, jsonPath(path, 'coverageDirectory'), issues);

  return issues;
};

export const validateFlowguardFlow = (
  flow: FlowguardFlow,
  path = jsonPathRoot,
): SemanticIssue[] => {
  const issues: SemanticIssue[] = [];

  if (flow.version !== flowguardFlowContractVersion) {
    issues.push(
      errorIssue(
        'UNSUPPORTED_VERSION',
        jsonPath(path, 'version'),
        `Unsupported document version ${String(flow.version)}.`,
      ),
    );
  }
  validateLowerKebabId(flow.id, jsonPath(path, 'id'), issues, 'Flow id');
  validateLowerKebabId(flow.entryStateId, jsonPath(path, 'entryStateId'), issues, 'Entry state id');

  if (flow.states.length === 0) {
    issues.push(
      errorIssue(
        'EMPTY_COLLECTION',
        jsonPath(path, 'states'),
        'A Flowguard contract must contain at least one state.',
      ),
    );
  }

  const stateIds = new Map<string, string>();
  flow.states.forEach((state, index) => {
    const statePath = jsonPath(jsonPath(path, 'states'), index);
    validateStateSemantics(state, statePath, issues);
    recordUniqueId(stateIds, state.id, jsonPath(statePath, 'id'), 'State', issues);
  });

  const transitionIds = new Map<string, string>();
  const transitionSignatures = new Map<string, string>();
  flow.transitions.forEach((transition, index) => {
    const transitionPath = jsonPath(jsonPath(path, 'transitions'), index);
    validateTransitionSemantics(transition, transitionPath, issues);
    recordUniqueId(
      transitionIds,
      transition.id,
      jsonPath(transitionPath, 'id'),
      'Transition',
      issues,
    );

    const firstSignaturePath = transitionSignatures.get(transitionSignature(transition));
    if (firstSignaturePath) {
      issues.push(
        errorIssue(
          'DUPLICATE_TRANSITION',
          jsonPath(transitionPath, 'id'),
          'Transition duplicates an existing actor, action, source, and target.',
          { firstPath: firstSignaturePath },
        ),
      );
    } else {
      transitionSignatures.set(transitionSignature(transition), jsonPath(transitionPath, 'id'));
    }
  });

  const stateIdSet = new Set(flow.states.map((state) => state.id));
  if (!stateIdSet.has(flow.entryStateId)) {
    issues.push(
      errorIssue(
        'BROKEN_REFERENCE',
        jsonPath(path, 'entryStateId'),
        `Entry state "${flow.entryStateId}" does not reference an existing state.`,
      ),
    );
  }

  flow.transitions.forEach((transition, index) => {
    const transitionPath = jsonPath(jsonPath(path, 'transitions'), index);
    if (!stateIdSet.has(transition.from)) {
      issues.push(
        errorIssue(
          'BROKEN_REFERENCE',
          jsonPath(transitionPath, 'from'),
          `Transition source "${transition.from}" does not reference an existing state.`,
        ),
      );
    }
    if (!stateIdSet.has(transition.to)) {
      issues.push(
        errorIssue(
          'BROKEN_REFERENCE',
          jsonPath(transitionPath, 'to'),
          `Transition target "${transition.to}" does not reference an existing state.`,
        ),
      );
    }
  });

  if (stateIdSet.has(flow.entryStateId)) {
    const reachable = reachableStateIds(flow);
    flow.states.forEach((state, index) => {
      if (!reachable.has(state.id)) {
        issues.push(
          warningIssue(
            'UNREACHABLE_STATE',
            jsonPath(jsonPath(jsonPath(path, 'states'), index), 'id'),
            `State "${state.id}" is not reachable from the entry state.`,
          ),
        );
      }
    });
  }

  return issues;
};

export const validateFlowProposal = (
  proposal: FlowProposal,
  path = jsonPathRoot,
): SemanticIssue[] => {
  const issues: SemanticIssue[] = [];

  if (proposal.version !== flowguardFlowContractVersion) {
    issues.push(
      errorIssue(
        'UNSUPPORTED_VERSION',
        jsonPath(path, 'version'),
        `Unsupported document version ${String(proposal.version)}.`,
      ),
    );
  }
  if (!proposal.id.trim()) {
    issues.push(
      errorIssue('INVALID_VALUE', jsonPath(path, 'id'), 'Proposal id must not be empty.'),
    );
  }
  validateLowerKebabId(proposal.flowId, jsonPath(path, 'flowId'), issues, 'Flow id');
  validateDigest(proposal.baseDigest, jsonPath(path, 'baseDigest'), issues);
  validateTimestamp(proposal.createdAt, jsonPath(path, 'createdAt'), issues);
  if (!proposal.producer.kind.trim()) {
    issues.push(
      errorIssue(
        'INVALID_VALUE',
        jsonPath(jsonPath(path, 'producer'), 'kind'),
        'Proposal producer kind must not be empty.',
      ),
    );
  }
  if (!proposal.producer.label.trim()) {
    issues.push(
      errorIssue(
        'INVALID_VALUE',
        jsonPath(jsonPath(path, 'producer'), 'label'),
        'Proposal producer label must not be empty.',
      ),
    );
  }
  if (!proposal.summary.trim()) {
    issues.push(
      errorIssue('INVALID_VALUE', jsonPath(path, 'summary'), 'Proposal summary must not be empty.'),
    );
  }
  if (!flowProposalConfidences.includes(proposal.confidence as FlowProposalConfidence)) {
    issues.push(
      errorIssue(
        'INVALID_VALUE',
        jsonPath(path, 'confidence'),
        `Proposal confidence must be one of: ${flowProposalConfidences.join(', ')}.`,
      ),
    );
  }
  if (proposal.operations.length === 0) {
    issues.push(
      errorIssue(
        'EMPTY_COLLECTION',
        jsonPath(path, 'operations'),
        'A proposal must contain at least one operation.',
      ),
    );
  }

  proposal.operations.forEach((operation, index) => {
    validateProposalOperation(operation, jsonPath(jsonPath(path, 'operations'), index), issues);
  });

  return issues;
};

export const validateFlowCoverageDocument = (
  coverage: FlowCoverageDocument,
  path = jsonPathRoot,
): SemanticIssue[] => {
  const issues: SemanticIssue[] = [];

  if (coverage.version !== flowguardFlowContractVersion) {
    issues.push(
      errorIssue(
        'UNSUPPORTED_VERSION',
        jsonPath(path, 'version'),
        `Unsupported document version ${String(coverage.version)}.`,
      ),
    );
  }
  validateLowerKebabId(coverage.id, jsonPath(path, 'id'), issues, 'Coverage id');
  validateLowerKebabId(coverage.flowId, jsonPath(path, 'flowId'), issues, 'Flow id');
  if (!coverage.title.trim()) {
    issues.push(errorIssue('INVALID_VALUE', jsonPath(path, 'title'), 'Title must not be empty.'));
  }
  if (!coverage.description.trim()) {
    issues.push(
      errorIssue('INVALID_VALUE', jsonPath(path, 'description'), 'Description must not be empty.'),
    );
  }
  if (!flowCoverageGates.includes(coverage.gate)) {
    issues.push(
      errorIssue(
        'INVALID_VALUE',
        jsonPath(path, 'gate'),
        `Coverage gate must be one of: ${flowCoverageGates.join(', ')}.`,
      ),
    );
  }
  if (coverage.covers.length === 0) {
    issues.push(
      errorIssue(
        'EMPTY_COLLECTION',
        jsonPath(path, 'covers'),
        'A coverage document must cover at least one flow state or transition.',
      ),
    );
  }
  if (coverage.evidence.length === 0) {
    issues.push(
      errorIssue(
        'EMPTY_COLLECTION',
        jsonPath(path, 'evidence'),
        'A coverage document must declare at least one evidence expectation.',
      ),
    );
  }

  const coverageTargets = new Map<string, string>();
  coverage.covers.forEach((target, index) => {
    const targetPath = jsonPath(jsonPath(path, 'covers'), index);
    validateCoverageTarget(target, targetPath, issues);
    recordUniqueId(
      coverageTargets,
      `${target.kind}:${target.id}`,
      jsonPath(targetPath, 'id'),
      'Coverage target',
      issues,
    );
  });
  coverage.evidence.forEach((evidence, index) => {
    validateCoverageEvidence(evidence, jsonPath(jsonPath(path, 'evidence'), index), issues);
  });

  return issues;
};

export const isSafeRepositoryPath = (value: string): boolean => {
  if (!value || value.startsWith('/') || value.startsWith('\\')) return false;
  if (value.includes('\\') || value.includes('\0')) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return false;

  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
};

export const isLowerKebabId = (value: string): boolean => {
  return lowerKebabIdPattern.test(value);
};

const parseJson = <T>(text: string, parser: (value: unknown) => ParseResult<T>): ParseResult<T> => {
  try {
    return parser(JSON.parse(text));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Invalid JSON.';
    return {
      ok: false,
      issues: [errorIssue('INVALID_JSON', jsonPathRoot, message)],
    };
  }
};

const parseProposalProducer = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowProposal['producer'] | undefined => {
  const producer = readObject(value, path, issues);
  if (!producer) return undefined;

  rejectUnknownKeys(producer, producerKeys, path, issues);
  const kind = readRequiredString(producer, 'kind', path, issues);
  const label = readRequiredString(producer, 'label', path, issues);
  return kind && label ? { kind, label } : undefined;
};

const parseProposalOperationValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowProposalOperation | undefined => {
  const operation = readObject(value, path, issues);
  if (!operation) return undefined;

  const op = readRequiredString(operation, 'op', path, issues);
  if (!op) return undefined;
  if (!flowProposalOperations.includes(op as FlowProposalOperationName)) {
    issues.push(
      errorIssue('INVALID_VALUE', jsonPath(path, 'op'), `Unsupported proposal operation "${op}".`),
    );
    return undefined;
  }

  const operationName = op as FlowProposalOperationName;
  rejectUnknownKeys(operation, operationKeys[operationName], path, issues);
  const reason = readRequiredString(operation, 'reason', path, issues);

  switch (operationName) {
    case 'addState': {
      const state = parseFlowStateValue(operation.state, jsonPath(path, 'state'), issues);
      return state && reason ? { op: operationName, state, reason } : undefined;
    }
    case 'updateState': {
      const stateId = readRequiredString(operation, 'stateId', path, issues);
      const patch = parseStatePatchValue(operation.patch, jsonPath(path, 'patch'), issues);
      return stateId && patch && reason ? { op: operationName, stateId, patch, reason } : undefined;
    }
    case 'removeState': {
      const stateId = readRequiredString(operation, 'stateId', path, issues);
      return stateId && reason ? { op: operationName, stateId, reason } : undefined;
    }
    case 'addTransition': {
      const transition = parseFlowTransitionValue(
        operation.transition,
        jsonPath(path, 'transition'),
        issues,
      );
      return transition && reason ? { op: operationName, transition, reason } : undefined;
    }
    case 'updateTransition': {
      const transitionId = readRequiredString(operation, 'transitionId', path, issues);
      const patch = parseTransitionPatchValue(operation.patch, jsonPath(path, 'patch'), issues);
      return transitionId && patch && reason
        ? { op: operationName, transitionId, patch, reason }
        : undefined;
    }
    case 'removeTransition': {
      const transitionId = readRequiredString(operation, 'transitionId', path, issues);
      return transitionId && reason ? { op: operationName, transitionId, reason } : undefined;
    }
    case 'updateFlow': {
      const patch = parseMetadataPatchValue(operation.patch, jsonPath(path, 'patch'), issues);
      return patch && reason ? { op: operationName, patch, reason } : undefined;
    }
  }
};

const parseFlowStateValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowState | undefined => {
  const state = readObject(value, path, issues);
  if (!state) return undefined;

  rejectUnknownKeys(state, stateKeys, path, issues);
  const id = readRequiredString(state, 'id', path, issues);
  const name = readRequiredString(state, 'name', path, issues);
  const kind = readRequiredEnum(state, 'kind', path, flowStateKinds, issues);
  const route = readOptionalString(state, 'route', path, issues);
  const description = readOptionalString(state, 'description', path, issues);
  const sources = readOptionalStringArray(state, 'sources', path, issues);
  const tags = readOptionalStringArray(state, 'tags', path, issues);

  if (!id || !name || !kind) return undefined;

  const parsed: FlowState = { id, name, kind };
  if (route !== undefined) parsed.route = route;
  if (description !== undefined) parsed.description = description;
  if (sources !== undefined) parsed.sources = sources;
  if (tags !== undefined) parsed.tags = tags;
  return parsed;
};

const parseCoverageTargetValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowCoverageTarget | undefined => {
  const target = readObject(value, path, issues);
  if (!target) return undefined;

  rejectUnknownKeys(target, coverageTargetKeys, path, issues);
  const kind = readRequiredEnum(target, 'kind', path, flowCoverageTargetKinds, issues);
  const id = readRequiredString(target, 'id', path, issues);
  const behavior = readRequiredString(target, 'behavior', path, issues);
  const required = readRequiredBoolean(target, 'required', path, issues);

  return kind && id && behavior && required !== undefined
    ? { kind, id, behavior, required }
    : undefined;
};

const parseCoverageEvidenceValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowCoverageEvidenceExpectation | undefined => {
  const evidence = readObject(value, path, issues);
  if (!evidence) return undefined;

  rejectUnknownKeys(evidence, coverageEvidenceKeys, path, issues);
  const kind = readRequiredEnum(evidence, 'kind', path, flowCoverageEvidenceKinds, issues);
  const label = readRequiredString(evidence, 'label', path, issues);
  const required = readRequiredBoolean(evidence, 'required', path, issues);

  return kind && label && required !== undefined ? { kind, label, required } : undefined;
};

const parseFlowTransitionValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowTransition | undefined => {
  const transition = readObject(value, path, issues);
  if (!transition) return undefined;

  rejectUnknownKeys(transition, transitionKeys, path, issues);
  const id = readRequiredString(transition, 'id', path, issues);
  const from = readRequiredString(transition, 'from', path, issues);
  const to = readRequiredString(transition, 'to', path, issues);
  const actor = readRequiredEnum(transition, 'actor', path, flowActors, issues);
  const action = readRequiredString(transition, 'action', path, issues);
  const condition = readOptionalString(transition, 'condition', path, issues);
  const outcome = readOptionalString(transition, 'outcome', path, issues);
  const sources = readOptionalStringArray(transition, 'sources', path, issues);
  const tags = readOptionalStringArray(transition, 'tags', path, issues);

  if (!id || !from || !to || !actor || !action) return undefined;

  const parsed: FlowTransition = { id, from, to, actor, action };
  if (condition !== undefined) parsed.condition = condition;
  if (outcome !== undefined) parsed.outcome = outcome;
  if (sources !== undefined) parsed.sources = sources;
  if (tags !== undefined) parsed.tags = tags;
  return parsed;
};

const parseStatePatchValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowStatePatch | undefined => {
  const patch = readObject(value, path, issues);
  if (!patch) return undefined;

  rejectUnknownKeys(patch, statePatchKeys, path, issues);
  requireAtLeastOneKnownKey(patch, statePatchKeys, path, issues, 'State patch');

  const parsed: FlowStatePatch = {};
  assignOptional(parsed, 'name', readOptionalString(patch, 'name', path, issues));
  assignOptional(parsed, 'kind', readOptionalEnum(patch, 'kind', path, flowStateKinds, issues));
  assignOptional(parsed, 'route', readOptionalString(patch, 'route', path, issues));
  assignOptional(parsed, 'description', readOptionalString(patch, 'description', path, issues));
  assignOptional(parsed, 'sources', readOptionalStringArray(patch, 'sources', path, issues));
  assignOptional(parsed, 'tags', readOptionalStringArray(patch, 'tags', path, issues));
  return parsed;
};

const parseTransitionPatchValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowTransitionPatch | undefined => {
  const patch = readObject(value, path, issues);
  if (!patch) return undefined;

  rejectUnknownKeys(patch, transitionPatchKeys, path, issues);
  requireAtLeastOneKnownKey(patch, transitionPatchKeys, path, issues, 'Transition patch');

  const parsed: FlowTransitionPatch = {};
  assignOptional(parsed, 'from', readOptionalString(patch, 'from', path, issues));
  assignOptional(parsed, 'to', readOptionalString(patch, 'to', path, issues));
  assignOptional(parsed, 'actor', readOptionalEnum(patch, 'actor', path, flowActors, issues));
  assignOptional(parsed, 'action', readOptionalString(patch, 'action', path, issues));
  assignOptional(parsed, 'condition', readOptionalString(patch, 'condition', path, issues));
  assignOptional(parsed, 'outcome', readOptionalString(patch, 'outcome', path, issues));
  assignOptional(parsed, 'sources', readOptionalStringArray(patch, 'sources', path, issues));
  assignOptional(parsed, 'tags', readOptionalStringArray(patch, 'tags', path, issues));
  return parsed;
};

const parseMetadataPatchValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): FlowMetadataPatch | undefined => {
  const patch = readObject(value, path, issues);
  if (!patch) return undefined;

  rejectUnknownKeys(patch, metadataPatchKeys, path, issues);
  requireAtLeastOneKnownKey(patch, metadataPatchKeys, path, issues, 'Flow metadata patch');

  const parsed: FlowMetadataPatch = {};
  assignOptional(parsed, 'name', readOptionalString(patch, 'name', path, issues));
  assignOptional(parsed, 'goal', readOptionalString(patch, 'goal', path, issues));
  assignOptional(parsed, 'entryStateId', readOptionalString(patch, 'entryStateId', path, issues));
  return parsed;
};

const validateProposalOperation = (
  operation: FlowProposalOperation,
  path: string,
  issues: SemanticIssue[],
) => {
  if (!operation.reason.trim()) {
    issues.push(
      errorIssue('INVALID_VALUE', jsonPath(path, 'reason'), 'Operation reason must not be empty.'),
    );
  }

  switch (operation.op) {
    case 'addState':
      validateStateSemantics(operation.state, jsonPath(path, 'state'), issues);
      break;
    case 'updateState':
      validateLowerKebabId(operation.stateId, jsonPath(path, 'stateId'), issues, 'State id');
      validateStatePatchSemantics(operation.patch, jsonPath(path, 'patch'), issues);
      break;
    case 'removeState':
      validateLowerKebabId(operation.stateId, jsonPath(path, 'stateId'), issues, 'State id');
      break;
    case 'addTransition':
      validateTransitionSemantics(operation.transition, jsonPath(path, 'transition'), issues);
      break;
    case 'updateTransition':
      validateLowerKebabId(
        operation.transitionId,
        jsonPath(path, 'transitionId'),
        issues,
        'Transition id',
      );
      validateTransitionPatchSemantics(operation.patch, jsonPath(path, 'patch'), issues);
      break;
    case 'removeTransition':
      validateLowerKebabId(
        operation.transitionId,
        jsonPath(path, 'transitionId'),
        issues,
        'Transition id',
      );
      break;
    case 'updateFlow':
      validateMetadataPatchSemantics(operation.patch, jsonPath(path, 'patch'), issues);
      break;
  }
};

const validateStatePatchSemantics = (
  patch: FlowStatePatch,
  path: string,
  issues: SemanticIssue[],
) => {
  validateNonEmptyPatch(patch, path, 'State patch', issues);
  if (patch.sources) validateRepositoryPaths(patch.sources, jsonPath(path, 'sources'), issues);
};

const validateTransitionPatchSemantics = (
  patch: FlowTransitionPatch,
  path: string,
  issues: SemanticIssue[],
) => {
  validateNonEmptyPatch(patch, path, 'Transition patch', issues);
  if (patch.from) validateLowerKebabId(patch.from, jsonPath(path, 'from'), issues, 'State id');
  if (patch.to) validateLowerKebabId(patch.to, jsonPath(path, 'to'), issues, 'State id');
  if (patch.action) validateBehaviorAction(patch.action, jsonPath(path, 'action'), issues);
  if (patch.sources) validateRepositoryPaths(patch.sources, jsonPath(path, 'sources'), issues);
};

const validateMetadataPatchSemantics = (
  patch: FlowMetadataPatch,
  path: string,
  issues: SemanticIssue[],
) => {
  validateNonEmptyPatch(patch, path, 'Flow metadata patch', issues);
  if (patch.entryStateId) {
    validateLowerKebabId(
      patch.entryStateId,
      jsonPath(path, 'entryStateId'),
      issues,
      'Entry state id',
    );
  }
};

const validateNonEmptyPatch = (
  patch: object,
  path: string,
  label: string,
  issues: SemanticIssue[],
) => {
  if (Object.values(patch).some((value) => value !== undefined)) return;

  issues.push(
    errorIssue('INVALID_VALUE', path, `${label} must contain at least one mutable field.`),
  );
};

const validateStateSemantics = (state: FlowState, path: string, issues: SemanticIssue[]) => {
  validateLowerKebabId(state.id, jsonPath(path, 'id'), issues, 'State id');
  if (state.sources) validateRepositoryPaths(state.sources, jsonPath(path, 'sources'), issues);
};

const validateTransitionSemantics = (
  transition: FlowTransition,
  path: string,
  issues: SemanticIssue[],
) => {
  validateLowerKebabId(transition.id, jsonPath(path, 'id'), issues, 'Transition id');
  validateLowerKebabId(transition.from, jsonPath(path, 'from'), issues, 'State id');
  validateLowerKebabId(transition.to, jsonPath(path, 'to'), issues, 'State id');
  validateBehaviorAction(transition.action, jsonPath(path, 'action'), issues);
  if (transition.sources) {
    validateRepositoryPaths(transition.sources, jsonPath(path, 'sources'), issues);
  }
};

const validateCoverageTarget = (
  target: FlowCoverageTarget,
  path: string,
  issues: SemanticIssue[],
) => {
  if (!flowCoverageTargetKinds.includes(target.kind)) {
    issues.push(
      errorIssue(
        'INVALID_VALUE',
        jsonPath(path, 'kind'),
        `Coverage target kind must be one of: ${flowCoverageTargetKinds.join(', ')}.`,
      ),
    );
  }
  validateLowerKebabId(target.id, jsonPath(path, 'id'), issues, 'Coverage target id');
  if (!target.behavior.trim()) {
    issues.push(
      errorIssue('INVALID_VALUE', jsonPath(path, 'behavior'), 'Behavior must not be empty.'),
    );
  }
};

const validateCoverageEvidence = (
  evidence: FlowCoverageEvidenceExpectation,
  path: string,
  issues: SemanticIssue[],
) => {
  if (!flowCoverageEvidenceKinds.includes(evidence.kind)) {
    issues.push(
      errorIssue(
        'INVALID_VALUE',
        jsonPath(path, 'kind'),
        `Coverage evidence kind must be one of: ${flowCoverageEvidenceKinds.join(', ')}.`,
      ),
    );
  }
  if (!evidence.label.trim()) {
    issues.push(errorIssue('INVALID_VALUE', jsonPath(path, 'label'), 'Label must not be empty.'));
  }
};

const validateLowerKebabId = (
  value: string,
  path: string,
  issues: SemanticIssue[],
  label: string,
) => {
  if (!isLowerKebabId(value)) {
    issues.push(
      errorIssue('INVALID_ID', path, `${label} must use lower-case kebab case.`, { value }),
    );
  }
};

const validateBehaviorAction = (value: string, path: string, issues: SemanticIssue[]) => {
  if (implementationActionPattern.test(value)) {
    issues.push(
      errorIssue(
        'IMPLEMENTATION_ACTION',
        path,
        'Transition action must describe observable behavior, not an implementation call.',
      ),
    );
  }
};

const validateRepositoryPaths = (
  values: readonly string[],
  path: string,
  issues: SemanticIssue[],
) => {
  values.forEach((value, index) => validateRepositoryPath(value, jsonPath(path, index), issues));
};

const validateRepositoryPath = (value: string, path: string, issues: SemanticIssue[]) => {
  if (!isSafeRepositoryPath(value)) {
    issues.push(
      errorIssue(
        'UNSAFE_PATH',
        path,
        'Path must be repository-relative POSIX without empty, dot, or parent segments.',
        { value },
      ),
    );
  }
};

const validateDigest = (value: string, path: string, issues: SemanticIssue[]) => {
  if (!sha256DigestPattern.test(value)) {
    issues.push(
      errorIssue('INVALID_DIGEST', path, 'Digest must use the sha256:<64 lowercase hex> format.'),
    );
  }
};

const validateTimestamp = (value: string, path: string, issues: SemanticIssue[]) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    issues.push(
      errorIssue(
        'INVALID_VALUE',
        path,
        'Timestamp must be a canonical ISO-8601 UTC string with milliseconds.',
      ),
    );
  }
};

const recordUniqueId = (
  seen: Map<string, string>,
  id: string,
  path: string,
  label: string,
  issues: SemanticIssue[],
) => {
  const firstPath = seen.get(id);
  if (firstPath) {
    issues.push(
      errorIssue('DUPLICATE_ID', path, `${label} id "${id}" is already used.`, { firstPath }),
    );
    return;
  }

  seen.set(id, path);
};

const transitionSignature = (transition: FlowTransition): string => {
  return [transition.actor, transition.action, transition.from, transition.to].join('\u0000');
};

const reachableStateIds = (flow: FlowguardFlow): Set<string> => {
  const reachable = new Set<string>([flow.entryStateId]);
  const pending = [flow.entryStateId];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) continue;

    for (const transition of flow.transitions) {
      if (transition.from !== current || reachable.has(transition.to)) continue;
      reachable.add(transition.to);
      pending.push(transition.to);
    }
  }

  return reachable;
};

const readObject = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): RawObject | undefined => {
  if (isRawObject(value)) return value;

  issues.push(errorIssue('INVALID_TYPE', path, 'Expected an object.'));
  return undefined;
};

const readVersion1 = (value: RawObject, path: string, issues: SemanticIssue[]): 1 | undefined => {
  const versionPath = jsonPath(path, 'version');
  if (!hasOwn(value, 'version')) {
    issues.push(errorIssue('MISSING_REQUIRED_FIELD', versionPath, 'Missing required field.'));
    return undefined;
  }

  if (value.version !== flowguardFlowContractVersion) {
    const code = typeof value.version === 'number' ? 'UNSUPPORTED_VERSION' : 'INVALID_TYPE';
    const message =
      code === 'UNSUPPORTED_VERSION'
        ? `Unsupported document version ${String(value.version)}.`
        : 'Document version must be the number 1.';
    issues.push(errorIssue(code, versionPath, message));
    return undefined;
  }

  return flowguardFlowContractVersion;
};

const readRequiredString = (
  value: RawObject,
  key: string,
  path: string,
  issues: SemanticIssue[],
): string | undefined => {
  const fieldPath = jsonPath(path, key);
  if (!hasOwn(value, key)) {
    issues.push(errorIssue('MISSING_REQUIRED_FIELD', fieldPath, 'Missing required field.'));
    return undefined;
  }

  return readStringValue(value[key], fieldPath, issues);
};

const readOptionalString = (
  value: RawObject,
  key: string,
  path: string,
  issues: SemanticIssue[],
): string | undefined => {
  if (!hasOwn(value, key)) return undefined;
  return readStringValue(value[key], jsonPath(path, key), issues);
};

const readStringValue = (
  value: unknown,
  path: string,
  issues: SemanticIssue[],
): string | undefined => {
  if (typeof value !== 'string') {
    issues.push(errorIssue('INVALID_TYPE', path, 'Expected a string.'));
    return undefined;
  }

  if (!value.trim()) {
    issues.push(errorIssue('INVALID_VALUE', path, 'String must not be empty.'));
    return undefined;
  }

  return value;
};

const readRequiredArray = (
  value: RawObject,
  key: string,
  path: string,
  issues: SemanticIssue[],
): unknown[] | undefined => {
  const fieldPath = jsonPath(path, key);
  if (!hasOwn(value, key)) {
    issues.push(errorIssue('MISSING_REQUIRED_FIELD', fieldPath, 'Missing required field.'));
    return undefined;
  }

  if (!Array.isArray(value[key])) {
    issues.push(errorIssue('INVALID_TYPE', fieldPath, 'Expected an array.'));
    return undefined;
  }

  return value[key];
};

const readRequiredBoolean = (
  value: RawObject,
  key: string,
  path: string,
  issues: SemanticIssue[],
): boolean | undefined => {
  const fieldPath = jsonPath(path, key);
  if (!hasOwn(value, key)) {
    issues.push(errorIssue('MISSING_REQUIRED_FIELD', fieldPath, 'Missing required field.'));
    return undefined;
  }

  if (typeof value[key] !== 'boolean') {
    issues.push(errorIssue('INVALID_TYPE', fieldPath, 'Expected a boolean.'));
    return undefined;
  }

  return value[key];
};

const readOptionalStringArray = (
  value: RawObject,
  key: string,
  path: string,
  issues: SemanticIssue[],
): string[] | undefined => {
  if (!hasOwn(value, key)) return undefined;
  const fieldPath = jsonPath(path, key);
  const raw = value[key];
  if (!Array.isArray(raw)) {
    issues.push(errorIssue('INVALID_TYPE', fieldPath, 'Expected an array of strings.'));
    return undefined;
  }

  const parsed: string[] = [];
  raw.forEach((item, index) => {
    const itemPath = jsonPath(fieldPath, index);
    if (typeof item !== 'string') {
      issues.push(errorIssue('INVALID_TYPE', itemPath, 'Expected a string.'));
      return;
    }
    if (!item.trim()) {
      issues.push(errorIssue('INVALID_VALUE', itemPath, 'String must not be empty.'));
      return;
    }
    parsed.push(item);
  });
  return parsed;
};

const readRequiredEnum = <T extends readonly string[]>(
  value: RawObject,
  key: string,
  path: string,
  allowed: T,
  issues: SemanticIssue[],
): T[number] | undefined => {
  const fieldPath = jsonPath(path, key);
  const raw = readRequiredString(value, key, path, issues);
  if (raw === undefined) return undefined;
  if (!allowed.includes(raw)) {
    issues.push(
      errorIssue('INVALID_VALUE', fieldPath, `Value must be one of: ${allowed.join(', ')}.`),
    );
    return undefined;
  }
  return raw as T[number];
};

const readOptionalEnum = <T extends readonly string[]>(
  value: RawObject,
  key: string,
  path: string,
  allowed: T,
  issues: SemanticIssue[],
): T[number] | undefined => {
  if (!hasOwn(value, key)) return undefined;
  const fieldPath = jsonPath(path, key);
  const raw = readStringValue(value[key], fieldPath, issues);
  if (raw === undefined) return undefined;
  if (!allowed.includes(raw)) {
    issues.push(
      errorIssue('INVALID_VALUE', fieldPath, `Value must be one of: ${allowed.join(', ')}.`),
    );
    return undefined;
  }
  return raw as T[number];
};

const rejectUnknownKeys = (
  value: RawObject,
  allowed: ReadonlySet<string>,
  path: string,
  issues: SemanticIssue[],
) => {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      issues.push(errorIssue('UNKNOWN_FIELD', jsonPath(path, key), 'Unknown field.'));
    }
  });
};

const requireAtLeastOneKnownKey = (
  value: RawObject,
  allowed: ReadonlySet<string>,
  path: string,
  issues: SemanticIssue[],
  label: string,
) => {
  if (Object.keys(value).some((key) => allowed.has(key))) return;

  issues.push(
    errorIssue('INVALID_VALUE', path, `${label} must contain at least one mutable field.`),
  );
};

const assignOptional = <T extends object, K extends keyof T>(target: T, key: K, value: T[K]) => {
  if (value !== undefined) {
    target[key] = value;
  }
};

const compact = <T>(values: (T | undefined)[] | undefined): T[] => {
  return values?.filter((value): value is T => value !== undefined) ?? [];
};

const isRawObject = (value: unknown): value is RawObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasOwn = (value: RawObject, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

import {
  validateFlowProposal,
  type FlowguardFlow,
  type FlowguardGraph,
  type FlowguardGraphEdge,
  type FlowguardGraphNode,
  type FlowguardGraphStatus,
  type FlowMetadataPatch,
  type FlowProposal,
  type FlowProposalOperation,
  type FlowState,
  type FlowStatePatch,
  type FlowTransition,
  type FlowTransitionPatch,
  type GraphIssue,
  type SemanticIssue,
} from '@workspace/flowguard-contracts';

const graphNodePrefix = 'state:';
const graphEdgePrefix = 'transition:';

export const flowguardGraphNodeId = (stateId: string): string => {
  return `${graphNodePrefix}${stateId}`;
};

export const flowguardGraphEdgeId = (transitionId: string): string => {
  return `${graphEdgePrefix}${transitionId}`;
};

export const projectFlowguardGraph = (flow: FlowguardFlow): FlowguardGraph => {
  return buildFlowguardGraph({
    flowId: flow.id,
    entryStateId: flow.entryStateId,
    states: flow.states.map((state, index) => ({
      state: cloneState(state),
      status: 'unchanged',
      path: `$.states[${index}].id`,
    })),
    transitions: flow.transitions.map((transition, index) => ({
      transition: cloneTransition(transition),
      status: 'unchanged',
      path: `$.transitions[${index}].id`,
    })),
    issues: [],
  });
};

export interface ProposalOverlayOptions {
  includeProposalValidationIssues?: boolean;
}

export const projectProposalOverlayGraph = (
  baseFlow: FlowguardFlow,
  proposal: FlowProposal,
  options: ProposalOverlayOptions = {},
): FlowguardGraph => {
  const includeProposalValidationIssues = options.includeProposalValidationIssues ?? true;
  const stateRecords = new Map<string, MutableStateRecord>();
  const transitionRecords = new Map<string, MutableTransitionRecord>();
  const issues: GraphIssue[] = includeProposalValidationIssues
    ? validateFlowProposal(proposal).map(graphIssueFromSemanticIssue)
    : [];
  let entryStateId = baseFlow.entryStateId;

  baseFlow.states.forEach((state, index) => {
    stateRecords.set(state.id, {
      state: cloneState(state),
      status: 'unchanged',
      path: `$.states[${index}].id`,
    });
  });
  baseFlow.transitions.forEach((transition, index) => {
    transitionRecords.set(transition.id, {
      transition: cloneTransition(transition),
      status: 'unchanged',
      path: `$.transitions[${index}].id`,
    });
  });

  if (proposal.flowId !== baseFlow.id) {
    issues.push({
      severity: 'error',
      code: 'FLOW_ID_MISMATCH',
      path: '$.flowId',
      message: `Proposal targets flow "${proposal.flowId}" but approved Flowguard contract is "${baseFlow.id}".`,
    });
    return buildFlowguardGraph({
      flowId: baseFlow.id,
      entryStateId,
      states: [...stateRecords.values()],
      transitions: [...transitionRecords.values()],
      issues,
    });
  }

  proposal.operations.forEach((operation, index) => {
    const path = `$.operations[${index}]`;
    const nextEntryStateId = applyProposalOperation(
      operation,
      path,
      stateRecords,
      transitionRecords,
      entryStateId,
      issues,
    );
    if (nextEntryStateId) entryStateId = nextEntryStateId;
  });

  return buildFlowguardGraph({
    flowId: baseFlow.id,
    entryStateId,
    states: [...stateRecords.values()],
    transitions: [...transitionRecords.values()],
    issues,
  });
};

interface StateRecord {
  state: FlowState;
  status: FlowguardGraphStatus;
  path: string;
}

interface TransitionRecord {
  transition: FlowTransition;
  status: FlowguardGraphStatus;
  path: string;
}

type MutableStateRecord = StateRecord;
type MutableTransitionRecord = TransitionRecord;

interface BuildFlowguardGraphInput {
  flowId: string;
  entryStateId: string;
  states: StateRecord[];
  transitions: TransitionRecord[];
  issues: GraphIssue[];
}

const buildFlowguardGraph = (input: BuildFlowguardGraphInput): FlowguardGraph => {
  const states = orderStateRecords(input.entryStateId, input.states, input.transitions);
  const transitions = orderTransitionRecords(states, input.transitions);

  return {
    flowId: input.flowId,
    nodes: states.map(graphNodeFromRecord),
    edges: transitions.map(graphEdgeFromRecord),
    issues: stableGraphIssues([
      ...input.issues,
      ...findReachabilityIssues(input.entryStateId, input.states, input.transitions),
    ]),
  };
};

const graphNodeFromRecord = (record: StateRecord): FlowguardGraphNode => {
  const node: FlowguardGraphNode = {
    id: flowguardGraphNodeId(record.state.id),
    stateId: record.state.id,
    label: record.state.name,
    kind: record.state.kind,
    status: record.status,
  };
  if (record.state.route !== undefined) node.route = record.state.route;
  return node;
};

const graphEdgeFromRecord = (record: TransitionRecord): FlowguardGraphEdge => {
  return {
    id: flowguardGraphEdgeId(record.transition.id),
    transitionId: record.transition.id,
    source: flowguardGraphNodeId(record.transition.from),
    target: flowguardGraphNodeId(record.transition.to),
    label: record.transition.action,
    actor: record.transition.actor,
    status: record.status,
  };
};

const applyProposalOperation = (
  operation: FlowProposalOperation,
  path: string,
  states: Map<string, MutableStateRecord>,
  transitions: Map<string, MutableTransitionRecord>,
  entryStateId: string,
  issues: GraphIssue[],
): string | undefined => {
  switch (operation.op) {
    case 'addState':
      applyAddState(operation.state, `${path}.state`, states, issues);
      return undefined;
    case 'updateState':
      applyUpdateState(operation.stateId, operation.patch, path, states, issues);
      return undefined;
    case 'removeState':
      applyRemoveState(operation.stateId, `${path}.stateId`, states, issues);
      return undefined;
    case 'addTransition':
      applyAddTransition(operation.transition, `${path}.transition`, states, transitions, issues);
      return undefined;
    case 'updateTransition':
      applyUpdateTransition(
        operation.transitionId,
        operation.patch,
        path,
        states,
        transitions,
        issues,
      );
      return undefined;
    case 'removeTransition':
      applyRemoveTransition(operation.transitionId, `${path}.transitionId`, transitions, issues);
      return undefined;
    case 'updateFlow':
      return applyUpdateFlow(operation.patch, `${path}.patch`, entryStateId, states, issues);
  }
};

const applyAddState = (
  state: FlowState,
  path: string,
  states: Map<string, MutableStateRecord>,
  issues: GraphIssue[],
) => {
  const existing = states.get(state.id);
  if (existing && existing.status !== 'removed') {
    existing.status = 'uncertain';
    issues.push(
      operationConflict(
        `${path}.id`,
        `Cannot add state "${state.id}" because that id already exists.`,
        { stateId: state.id },
      ),
    );
    return;
  }

  states.set(state.id, {
    state: cloneState(state),
    status: existing ? 'modified' : 'added',
    path: `${path}.id`,
  });
};

const applyUpdateState = (
  stateId: string,
  patch: FlowStatePatch,
  path: string,
  states: Map<string, MutableStateRecord>,
  issues: GraphIssue[],
) => {
  const existing = states.get(stateId);
  if (!existing || existing.status === 'removed') {
    issues.push(
      operationConflict(`${path}.stateId`, `Cannot update missing state "${stateId}".`, {
        stateId,
      }),
    );
    return;
  }

  const nextState = applyStatePatch(existing.state, patch);
  if (!sameState(existing.state, nextState)) {
    existing.status = mergeModifiedStatus(existing.status);
    existing.state = nextState;
  }
};

const applyRemoveState = (
  stateId: string,
  path: string,
  states: Map<string, MutableStateRecord>,
  issues: GraphIssue[],
) => {
  const existing = states.get(stateId);
  if (!existing || existing.status === 'removed') {
    issues.push(operationConflict(path, `Cannot remove missing state "${stateId}".`, { stateId }));
    return;
  }

  existing.status = 'removed';
  existing.path = path;
};

const applyAddTransition = (
  transition: FlowTransition,
  path: string,
  states: Map<string, MutableStateRecord>,
  transitions: Map<string, MutableTransitionRecord>,
  issues: GraphIssue[],
) => {
  const existing = transitions.get(transition.id);
  if (existing && existing.status !== 'removed') {
    existing.status = 'uncertain';
    issues.push(
      operationConflict(
        `${path}.id`,
        `Cannot add transition "${transition.id}" because that id already exists.`,
        { transitionId: transition.id },
      ),
    );
    return;
  }

  const status = validateTransitionEndpoints(transition, path, states, issues)
    ? 'added'
    : 'uncertain';
  transitions.set(transition.id, {
    transition: cloneTransition(transition),
    status: existing ? 'modified' : status,
    path: `${path}.id`,
  });
};

const applyUpdateTransition = (
  transitionId: string,
  patch: FlowTransitionPatch,
  path: string,
  states: Map<string, MutableStateRecord>,
  transitions: Map<string, MutableTransitionRecord>,
  issues: GraphIssue[],
) => {
  const existing = transitions.get(transitionId);
  if (!existing || existing.status === 'removed') {
    issues.push(
      operationConflict(
        `${path}.transitionId`,
        `Cannot update missing transition "${transitionId}".`,
        { transitionId },
      ),
    );
    return;
  }

  const nextTransition = applyTransitionPatch(existing.transition, patch);
  const hasValidEndpoints = validateTransitionEndpoints(
    nextTransition,
    `${path}.patch`,
    states,
    issues,
  );
  if (!sameTransition(existing.transition, nextTransition)) {
    existing.status = hasValidEndpoints ? mergeModifiedStatus(existing.status) : 'uncertain';
    existing.transition = nextTransition;
  }
};

const applyRemoveTransition = (
  transitionId: string,
  path: string,
  transitions: Map<string, MutableTransitionRecord>,
  issues: GraphIssue[],
) => {
  const existing = transitions.get(transitionId);
  if (!existing || existing.status === 'removed') {
    issues.push(
      operationConflict(path, `Cannot remove missing transition "${transitionId}".`, {
        transitionId,
      }),
    );
    return;
  }

  existing.status = 'removed';
  existing.path = path;
};

const applyUpdateFlow = (
  patch: FlowMetadataPatch,
  path: string,
  entryStateId: string,
  states: Map<string, MutableStateRecord>,
  issues: GraphIssue[],
): string | undefined => {
  if (!patch.entryStateId) return undefined;
  const entryRecord = states.get(patch.entryStateId);
  if (!entryRecord || entryRecord.status === 'removed') {
    issues.push(
      operationConflict(
        `${path}.entryStateId`,
        `Cannot set entryStateId to missing state "${patch.entryStateId}".`,
        { stateId: patch.entryStateId },
      ),
    );
    return entryStateId;
  }
  return patch.entryStateId;
};

const validateTransitionEndpoints = (
  transition: FlowTransition,
  path: string,
  states: Map<string, MutableStateRecord>,
  issues: GraphIssue[],
): boolean => {
  const sourceExists = isActiveState(states.get(transition.from));
  const targetExists = isActiveState(states.get(transition.to));
  if (!sourceExists) {
    issues.push(
      operationConflict(
        `${path}.from`,
        `Transition source "${transition.from}" does not exist in the current flow.`,
        { stateId: transition.from, transitionId: transition.id },
      ),
    );
  }
  if (!targetExists) {
    issues.push(
      operationConflict(
        `${path}.to`,
        `Transition target "${transition.to}" does not exist in the current flow.`,
        { stateId: transition.to, transitionId: transition.id },
      ),
    );
  }
  return sourceExists && targetExists;
};

const orderStateRecords = (
  entryStateId: string,
  states: readonly StateRecord[],
  transitions: readonly TransitionRecord[],
): StateRecord[] => {
  const stateById = new Map(states.map((record) => [record.state.id, record]));
  const adjacency = new Map<string, TransitionRecord[]>();
  const sortedTransitions = [...transitions].sort(compareTransitionRecords);
  for (const transition of sortedTransitions) {
    const bucket = adjacency.get(transition.transition.from) ?? [];
    bucket.push(transition);
    adjacency.set(transition.transition.from, bucket);
  }

  const ordered: StateRecord[] = [];
  const seen = new Set<string>();
  const queue: string[] = [];
  if (stateById.has(entryStateId)) queue.push(entryStateId);

  while (queue.length > 0) {
    const stateId = queue.shift();
    if (!stateId || seen.has(stateId)) continue;
    const state = stateById.get(stateId);
    if (!state) continue;

    seen.add(stateId);
    ordered.push(state);
    for (const transition of adjacency.get(stateId) ?? []) {
      if (!seen.has(transition.transition.to) && stateById.has(transition.transition.to)) {
        queue.push(transition.transition.to);
      }
    }
  }

  const remaining = states.filter((record) => !seen.has(record.state.id)).sort(compareStateRecords);
  return [...ordered, ...remaining];
};

const orderTransitionRecords = (
  orderedStates: readonly StateRecord[],
  transitions: readonly TransitionRecord[],
): TransitionRecord[] => {
  const stateRank = new Map(orderedStates.map((record, index) => [record.state.id, index]));
  return [...transitions].sort((left, right) => {
    const source = compareRank(
      stateRank.get(left.transition.from),
      stateRank.get(right.transition.from),
    );
    if (source !== 0) return source;

    const target = compareRank(
      stateRank.get(left.transition.to),
      stateRank.get(right.transition.to),
    );
    if (target !== 0) return target;

    return compareTransitionRecords(left, right);
  });
};

const findReachabilityIssues = (
  entryStateId: string,
  states: readonly StateRecord[],
  transitions: readonly TransitionRecord[],
): GraphIssue[] => {
  const activeStates = states.filter(isActiveState);
  const activeStateIds = new Set(activeStates.map((record) => record.state.id));
  const activeTransitions = transitions.filter(isActiveTransition);
  const issues: GraphIssue[] = [];

  for (const record of activeTransitions) {
    if (!activeStateIds.has(record.transition.from)) {
      issues.push({
        severity: 'error',
        code: 'BROKEN_REFERENCE',
        path: record.path,
        message: `Transition source "${record.transition.from}" does not reference an active state.`,
        stateId: record.transition.from,
        transitionId: record.transition.id,
      });
    }
    if (!activeStateIds.has(record.transition.to)) {
      issues.push({
        severity: 'error',
        code: 'BROKEN_REFERENCE',
        path: record.path,
        message: `Transition target "${record.transition.to}" does not reference an active state.`,
        stateId: record.transition.to,
        transitionId: record.transition.id,
      });
    }
  }

  if (activeStates.length === 0) return issues;

  if (!activeStateIds.has(entryStateId)) {
    issues.push({
      severity: 'error',
      code: 'BROKEN_REFERENCE',
      path: '$.entryStateId',
      message: `Entry state "${entryStateId}" does not reference an active state.`,
      stateId: entryStateId,
    });
    return issues;
  }

  const reachable = new Set<string>([entryStateId]);
  const pending = [entryStateId];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) continue;

    for (const record of activeTransitions) {
      const transition = record.transition;
      if (
        transition.from !== current ||
        reachable.has(transition.to) ||
        !activeStateIds.has(transition.to)
      ) {
        continue;
      }
      reachable.add(transition.to);
      pending.push(transition.to);
    }
  }

  for (const record of activeStates) {
    if (!reachable.has(record.state.id)) {
      issues.push({
        severity: 'warning',
        code: 'UNREACHABLE_STATE',
        path: record.path,
        message: `State "${record.state.id}" is not reachable from the entry state.`,
        stateId: record.state.id,
      });
    }
  }

  return issues;
};

const graphIssueFromSemanticIssue = (issue: SemanticIssue): GraphIssue => {
  return {
    severity: issue.severity,
    code: issue.code,
    path: issue.path,
    message: issue.message,
  };
};

const operationConflict = (
  path: string,
  message: string,
  ids: { stateId?: string; transitionId?: string } = {},
): GraphIssue => {
  return {
    severity: 'error',
    code: 'OPERATION_CONFLICT',
    path,
    message,
    ...ids,
  };
};

const mergeModifiedStatus = (status: FlowguardGraphStatus): FlowguardGraphStatus => {
  if (status === 'added' || status === 'removed' || status === 'uncertain') return status;
  return 'modified';
};

const isActiveState = (record: StateRecord | undefined): record is StateRecord => {
  return record !== undefined && record.status !== 'removed';
};

const isActiveTransition = (record: TransitionRecord): boolean => {
  return record.status !== 'removed';
};

const compareStateRecords = (left: StateRecord, right: StateRecord): number => {
  return left.state.id.localeCompare(right.state.id);
};

const compareTransitionRecords = (left: TransitionRecord, right: TransitionRecord): number => {
  const source = left.transition.from.localeCompare(right.transition.from);
  if (source !== 0) return source;
  const target = left.transition.to.localeCompare(right.transition.to);
  if (target !== 0) return target;
  const id = left.transition.id.localeCompare(right.transition.id);
  if (id !== 0) return id;
  return left.transition.action.localeCompare(right.transition.action);
};

const compareRank = (left: number | undefined, right: number | undefined): number => {
  const leftRank = left ?? Number.MAX_SAFE_INTEGER;
  const rightRank = right ?? Number.MAX_SAFE_INTEGER;
  return leftRank - rightRank;
};

const stableGraphIssues = (issues: readonly GraphIssue[]): GraphIssue[] => {
  return [...issues].sort((left, right) => {
    const severity = severityRank(left.severity) - severityRank(right.severity);
    if (severity !== 0) return severity;
    const code = left.code.localeCompare(right.code);
    if (code !== 0) return code;
    const path = (left.path ?? '').localeCompare(right.path ?? '');
    if (path !== 0) return path;
    return (left.stateId ?? left.transitionId ?? '').localeCompare(
      right.stateId ?? right.transitionId ?? '',
    );
  });
};

const severityRank = (severity: GraphIssue['severity']): number => {
  return severity === 'error' ? 0 : 1;
};

const applyStatePatch = (state: FlowState, patch: FlowStatePatch): FlowState => {
  return pruneUndefined({
    ...cloneState(state),
    ...cloneStatePatch(patch),
  });
};

const applyTransitionPatch = (
  transition: FlowTransition,
  patch: FlowTransitionPatch,
): FlowTransition => {
  return pruneUndefined({
    ...cloneTransition(transition),
    ...cloneTransitionPatch(patch),
  });
};

const cloneState = (state: FlowState): FlowState => {
  return pruneUndefined({
    id: state.id,
    name: state.name,
    kind: state.kind,
    route: state.route,
    description: state.description,
    sources: state.sources ? [...state.sources] : undefined,
    tags: state.tags ? [...state.tags] : undefined,
  });
};

const cloneTransition = (transition: FlowTransition): FlowTransition => {
  return pruneUndefined({
    id: transition.id,
    from: transition.from,
    to: transition.to,
    actor: transition.actor,
    action: transition.action,
    condition: transition.condition,
    outcome: transition.outcome,
    sources: transition.sources ? [...transition.sources] : undefined,
    tags: transition.tags ? [...transition.tags] : undefined,
  });
};

const cloneStatePatch = (patch: FlowStatePatch): FlowStatePatch => {
  return pruneUndefined({
    name: patch.name,
    kind: patch.kind,
    route: patch.route,
    description: patch.description,
    sources: patch.sources ? [...patch.sources] : undefined,
    tags: patch.tags ? [...patch.tags] : undefined,
  });
};

const cloneTransitionPatch = (patch: FlowTransitionPatch): FlowTransitionPatch => {
  return pruneUndefined({
    from: patch.from,
    to: patch.to,
    actor: patch.actor,
    action: patch.action,
    condition: patch.condition,
    outcome: patch.outcome,
    sources: patch.sources ? [...patch.sources] : undefined,
    tags: patch.tags ? [...patch.tags] : undefined,
  });
};

const sameState = (left: FlowState, right: FlowState): boolean => {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.kind === right.kind &&
    left.route === right.route &&
    left.description === right.description &&
    sameStringArray(left.sources, right.sources) &&
    sameStringArray(left.tags, right.tags)
  );
};

const sameTransition = (left: FlowTransition, right: FlowTransition): boolean => {
  return (
    left.id === right.id &&
    left.from === right.from &&
    left.to === right.to &&
    left.actor === right.actor &&
    left.action === right.action &&
    left.condition === right.condition &&
    left.outcome === right.outcome &&
    sameStringArray(left.sources, right.sources) &&
    sameStringArray(left.tags, right.tags)
  );
};

const sameStringArray = (
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean => {
  if (left === undefined || right === undefined) return left === right;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const pruneUndefined = <T extends object>(value: T): T => {
  Object.keys(value).forEach((key) => {
    if ((value as Record<string, unknown>)[key] === undefined) {
      delete (value as Record<string, unknown>)[key];
    }
  });
  return value;
};

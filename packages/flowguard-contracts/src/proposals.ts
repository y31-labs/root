import { digestFlowguardFlow } from '#/canonical';
import { errorIssue, hasIssueErrors, type SemanticIssue } from '#/issues';
import { jsonPath, jsonPathRoot } from '#/paths';
import type {
  FlowguardFlow,
  CanonicalDigest,
  FlowMetadataPatch,
  FlowProposal,
  FlowProposalOperation,
  FlowState,
  FlowStatePatch,
  FlowTransition,
  FlowTransitionPatch,
} from '#/types';
import { validateFlowguardFlow, validateFlowProposal } from '#/validation';

export interface ApplyFlowProposalSuccess {
  ok: true;
  flow: FlowguardFlow;
  digest: CanonicalDigest;
  issues: SemanticIssue[];
}

export interface ApplyFlowProposalFailure {
  ok: false;
  issues: SemanticIssue[];
}

export type ApplyFlowProposalResult = ApplyFlowProposalSuccess | ApplyFlowProposalFailure;

export const applyFlowProposal = async (
  baseFlow: FlowguardFlow,
  proposal: FlowProposal,
): Promise<ApplyFlowProposalResult> => {
  const preflightIssues = [
    ...validateFlowguardFlow(baseFlow),
    ...validateFlowProposal(proposal),
    ...validateProposalBase(baseFlow, proposal),
  ];

  if (hasIssueErrors(preflightIssues)) {
    return { ok: false, issues: preflightIssues };
  }

  const actualBaseDigest = await digestFlowguardFlow(baseFlow);
  if (actualBaseDigest !== proposal.baseDigest) {
    return {
      ok: false,
      issues: [
        errorIssue(
          'STALE_DIGEST',
          jsonPath(jsonPathRoot, 'baseDigest'),
          'Proposal base digest does not match the current approved Flowguard contract.',
          { expected: proposal.baseDigest, actual: actualBaseDigest },
        ),
      ],
    };
  }

  let nextFlow = cloneFlow(baseFlow);
  const operationIssues: SemanticIssue[] = [];

  for (let index = 0; index < proposal.operations.length; index += 1) {
    const operation = proposal.operations[index];
    const operationPath = jsonPath(jsonPath(jsonPathRoot, 'operations'), index);
    const applied = applyOperation(nextFlow, operation, operationPath);
    if (!applied.ok) {
      operationIssues.push(...applied.issues);
      break;
    }
    nextFlow = applied.flow;
  }

  if (hasIssueErrors(operationIssues)) {
    return { ok: false, issues: operationIssues };
  }

  const finalIssues = validateFlowguardFlow(nextFlow);
  if (hasIssueErrors(finalIssues)) {
    return { ok: false, issues: finalIssues };
  }

  return {
    ok: true,
    flow: nextFlow,
    digest: await digestFlowguardFlow(nextFlow),
    issues: finalIssues,
  };
};

const validateProposalBase = (baseFlow: FlowguardFlow, proposal: FlowProposal): SemanticIssue[] => {
  if (baseFlow.id === proposal.flowId) return [];

  return [
    errorIssue(
      'FLOW_ID_MISMATCH',
      jsonPath(jsonPathRoot, 'flowId'),
      `Proposal targets flow "${proposal.flowId}" but approved Flowguard contract is "${baseFlow.id}".`,
    ),
  ];
};

const applyOperation = (
  flow: FlowguardFlow,
  operation: FlowProposalOperation,
  path: string,
): ApplyOperationResult => {
  switch (operation.op) {
    case 'addState':
      return applyAddState(flow, operation.state, jsonPath(path, 'state'));
    case 'updateState':
      return applyUpdateState(flow, operation.stateId, operation.patch, path);
    case 'removeState':
      return applyRemoveState(flow, operation.stateId, jsonPath(path, 'stateId'));
    case 'addTransition':
      return applyAddTransition(flow, operation.transition, jsonPath(path, 'transition'));
    case 'updateTransition':
      return applyUpdateTransition(flow, operation.transitionId, operation.patch, path);
    case 'removeTransition':
      return applyRemoveTransition(flow, operation.transitionId, jsonPath(path, 'transitionId'));
    case 'updateFlow':
      return applyUpdateFlow(flow, operation.patch, jsonPath(path, 'patch'));
  }
};

type ApplyOperationResult =
  | { ok: true; flow: FlowguardFlow }
  | { ok: false; issues: SemanticIssue[] };

const applyAddState = (
  flow: FlowguardFlow,
  state: FlowState,
  path: string,
): ApplyOperationResult => {
  if (flow.states.some((item) => item.id === state.id)) {
    return conflict(
      jsonPath(path, 'id'),
      `Cannot add state "${state.id}" because that id already exists.`,
      { id: state.id },
    );
  }

  return {
    ok: true,
    flow: { ...cloneFlow(flow), states: [...cloneStates(flow.states), cloneState(state)] },
  };
};

const applyUpdateState = (
  flow: FlowguardFlow,
  stateId: string,
  patch: FlowStatePatch,
  path: string,
): ApplyOperationResult => {
  if (!flow.states.some((item) => item.id === stateId)) {
    return conflict(jsonPath(path, 'stateId'), `Cannot update missing state "${stateId}".`, {
      id: stateId,
    });
  }

  return {
    ok: true,
    flow: {
      ...cloneFlow(flow),
      states: flow.states.map((state) =>
        state.id === stateId ? applyStatePatch(state, patch) : cloneState(state),
      ),
    },
  };
};

const applyRemoveState = (
  flow: FlowguardFlow,
  stateId: string,
  path: string,
): ApplyOperationResult => {
  if (!flow.states.some((item) => item.id === stateId)) {
    return conflict(path, `Cannot remove missing state "${stateId}".`, { id: stateId });
  }

  if (flow.entryStateId === stateId) {
    return conflict(path, 'Cannot remove the current entry state before updating entryStateId.', {
      id: stateId,
    });
  }

  const referencingTransitions = flow.transitions
    .filter((transition) => transition.from === stateId || transition.to === stateId)
    .map((transition) => transition.id);
  if (referencingTransitions.length > 0) {
    return conflict(path, 'Cannot remove a state while transitions still reference it.', {
      id: stateId,
      transitionIds: referencingTransitions,
    });
  }

  return {
    ok: true,
    flow: {
      ...cloneFlow(flow),
      states: flow.states.filter((state) => state.id !== stateId).map(cloneState),
    },
  };
};

const applyAddTransition = (
  flow: FlowguardFlow,
  transition: FlowTransition,
  path: string,
): ApplyOperationResult => {
  if (flow.transitions.some((item) => item.id === transition.id)) {
    return conflict(
      jsonPath(path, 'id'),
      `Cannot add transition "${transition.id}" because that id already exists.`,
      { id: transition.id },
    );
  }

  const referenceIssue = validateTransitionReferences(flow, transition, path);
  if (referenceIssue) return referenceIssue;

  return {
    ok: true,
    flow: {
      ...cloneFlow(flow),
      transitions: [...cloneTransitions(flow.transitions), cloneTransition(transition)],
    },
  };
};

const applyUpdateTransition = (
  flow: FlowguardFlow,
  transitionId: string,
  patch: FlowTransitionPatch,
  path: string,
): ApplyOperationResult => {
  const existing = flow.transitions.find((item) => item.id === transitionId);
  if (!existing) {
    return conflict(
      jsonPath(path, 'transitionId'),
      `Cannot update missing transition "${transitionId}".`,
      { id: transitionId },
    );
  }

  const nextTransition = applyTransitionPatch(existing, patch);
  const referenceIssue = validateTransitionReferences(
    flow,
    nextTransition,
    jsonPath(path, 'patch'),
  );
  if (referenceIssue) return referenceIssue;

  return {
    ok: true,
    flow: {
      ...cloneFlow(flow),
      transitions: flow.transitions.map((transition) =>
        transition.id === transitionId ? nextTransition : cloneTransition(transition),
      ),
    },
  };
};

const applyRemoveTransition = (
  flow: FlowguardFlow,
  transitionId: string,
  path: string,
): ApplyOperationResult => {
  if (!flow.transitions.some((item) => item.id === transitionId)) {
    return conflict(path, `Cannot remove missing transition "${transitionId}".`, {
      id: transitionId,
    });
  }

  return {
    ok: true,
    flow: {
      ...cloneFlow(flow),
      transitions: flow.transitions
        .filter((transition) => transition.id !== transitionId)
        .map(cloneTransition),
    },
  };
};

const applyUpdateFlow = (
  flow: FlowguardFlow,
  patch: FlowMetadataPatch,
  path: string,
): ApplyOperationResult => {
  if (patch.entryStateId && !flow.states.some((state) => state.id === patch.entryStateId)) {
    return conflict(
      jsonPath(path, 'entryStateId'),
      `Cannot set entryStateId to missing state "${patch.entryStateId}".`,
      { id: patch.entryStateId },
    );
  }

  return {
    ok: true,
    flow: pruneUndefined({
      ...cloneFlow(flow),
      ...patch,
    }),
  };
};

const validateTransitionReferences = (
  flow: FlowguardFlow,
  transition: FlowTransition,
  path: string,
): ApplyOperationResult | undefined => {
  const stateIds = new Set(flow.states.map((state) => state.id));

  if (!stateIds.has(transition.from)) {
    return conflict(
      jsonPath(path, 'from'),
      `Transition source "${transition.from}" does not exist in the current flow.`,
      { id: transition.from },
    );
  }
  if (!stateIds.has(transition.to)) {
    return conflict(
      jsonPath(path, 'to'),
      `Transition target "${transition.to}" does not exist in the current flow.`,
      { id: transition.to },
    );
  }

  return undefined;
};

const conflict = (
  path: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApplyOperationResult => {
  return {
    ok: false,
    issues: [errorIssue('OPERATION_CONFLICT', path, message, details)],
  };
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

const cloneFlow = (flow: FlowguardFlow): FlowguardFlow => {
  return {
    version: flow.version,
    id: flow.id,
    name: flow.name,
    goal: flow.goal,
    entryStateId: flow.entryStateId,
    states: cloneStates(flow.states),
    transitions: cloneTransitions(flow.transitions),
  };
};

const cloneStates = (states: readonly FlowState[]): FlowState[] => {
  return states.map(cloneState);
};

const cloneTransitions = (transitions: readonly FlowTransition[]): FlowTransition[] => {
  return transitions.map(cloneTransition);
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

const pruneUndefined = <T extends object>(value: T): T => {
  Object.keys(value).forEach((key) => {
    if ((value as Record<string, unknown>)[key] === undefined) {
      delete (value as Record<string, unknown>)[key];
    }
  });
  return value;
};

import type {
  FlowguardFlow,
  FlowImpact,
  FlowState,
  FlowTransition,
} from '@workspace/flowguard-contracts';

export type FlowSourceReferenceKind = 'state' | 'transition';

export interface FlowSourceReference {
  flowId: string;
  path: string;
  kind: FlowSourceReferenceKind;
  stateId?: string;
  transitionId?: string;
}

export interface FlowSourceReferenceIndex {
  flowId: string;
  paths: string[];
  references: FlowSourceReference[];
  byPath: Readonly<Record<string, FlowSourceReference[]>>;
}

export const indexFlowSourceReferences = (flow: FlowguardFlow): FlowSourceReferenceIndex => {
  const references = [
    ...flow.states.flatMap((state) => sourceReferencesForState(flow.id, state)),
    ...flow.transitions.flatMap((transition) => sourceReferencesForTransition(flow.id, transition)),
  ].sort(compareSourceReferences);
  const byPath: Record<string, FlowSourceReference[]> = {};

  for (const reference of references) {
    byPath[reference.path] = [...(byPath[reference.path] ?? []), reference];
  }

  return {
    flowId: flow.id,
    paths: Object.keys(byPath).sort(),
    references,
    byPath,
  };
};

export const calculateFlowImpact = (
  flow: FlowguardFlow,
  changedPaths: readonly string[],
): FlowImpact => {
  return calculateFlowImpactFromIndex(indexFlowSourceReferences(flow), changedPaths);
};

export const calculateFlowImpactFromIndex = (
  index: FlowSourceReferenceIndex,
  changedPaths: readonly string[],
): FlowImpact => {
  const uniqueChangedPaths = [...new Set(changedPaths)].sort();
  const matchedPaths = uniqueChangedPaths.filter((path) => index.byPath[path]?.length);
  if (matchedPaths.length === 0) {
    return {
      flowId: index.flowId,
      level: 'none',
      matchedPaths: [],
      reasons: [
        'No changed paths directly match approved source references.',
        'Absence of a direct match does not prove the flow is unaffected.',
      ],
    };
  }

  return {
    flowId: index.flowId,
    level: 'direct',
    matchedPaths,
    reasons: matchedPaths.flatMap((path) =>
      [...index.byPath[path]]
        .sort(compareSourceReferences)
        .map((reference) => impactReason(reference)),
    ),
  };
};

const sourceReferencesForState = (flowId: string, state: FlowState): FlowSourceReference[] => {
  return uniqueSorted(state.sources ?? []).map((path) => ({
    flowId,
    path,
    kind: 'state',
    stateId: state.id,
  }));
};

const sourceReferencesForTransition = (
  flowId: string,
  transition: FlowTransition,
): FlowSourceReference[] => {
  return uniqueSorted(transition.sources ?? []).map((path) => ({
    flowId,
    path,
    kind: 'transition',
    transitionId: transition.id,
  }));
};

const impactReason = (reference: FlowSourceReference): string => {
  if (reference.kind === 'state') {
    return `Path "${reference.path}" is referenced by state "${reference.stateId}".`;
  }
  return `Path "${reference.path}" is referenced by transition "${reference.transitionId}".`;
};

const uniqueSorted = (values: readonly string[]): string[] => {
  return [...new Set(values)].sort();
};

const compareSourceReferences = (left: FlowSourceReference, right: FlowSourceReference): number => {
  const path = left.path.localeCompare(right.path);
  if (path !== 0) return path;
  const kind = left.kind.localeCompare(right.kind);
  if (kind !== 0) return kind;
  return (left.stateId ?? left.transitionId ?? '').localeCompare(
    right.stateId ?? right.transitionId ?? '',
  );
};

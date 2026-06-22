import type {
  FlowguardFlow,
  FlowProposal,
  FlowProposalOperation,
  FlowState,
  FlowStatePatch,
  FlowTransition,
  FlowTransitionPatch,
} from '@workspace/flowguard-contracts';
import { projectFlowguardGraph, projectProposalOverlayGraph } from '@workspace/flowguard-engine';

import type {
  FlowguardRepositorySnapshot,
  FlowguardWorkspaceSnapshot,
} from '#/extension/workspace';
import type {
  FlowguardRevealSourceTarget,
  FlowguardWebviewFlowSnapshot,
  FlowguardWebviewProposalSnapshot,
  FlowguardWebviewSnapshot,
  FlowguardWebviewSourceReference,
} from '#/shared/messages';

export const createFlowguardWebviewSnapshot = (
  snapshot: FlowguardWorkspaceSnapshot,
): FlowguardWebviewSnapshot => {
  return {
    version: 1,
    sequence: snapshot.sequence,
    generatedAt: snapshot.generatedAt,
    repositories: snapshot.repositories.map((repository) => createRepositorySnapshot(repository)),
  };
};

const createRepositorySnapshot = (repository: FlowguardRepositorySnapshot) => {
  const flowsById = new Map(
    repository.flows.map((flow) => [flow.document.id, flow.document] as const),
  );

  return {
    root: {
      uri: repository.root.uri,
      name: repository.root.name,
      index: repository.root.index,
    },
    flows: repository.flows.map((flow): FlowguardWebviewFlowSnapshot => {
      return {
        flowId: flow.document.id,
        name: flow.document.name,
        goal: flow.document.goal,
        relativePath: flow.relativePath,
        digest: flow.digest,
        graph: projectFlowguardGraph(flow.document),
        sourceReferences: sourceReferencesFromFlow(flow.document),
      };
    }),
    proposals: repository.proposals.map((proposal): FlowguardWebviewProposalSnapshot => {
      const baseFlow = flowsById.get(proposal.document.flowId);
      const graph =
        baseFlow === undefined
          ? undefined
          : projectProposalOverlayGraph(baseFlow, proposal.document);

      return {
        proposalId: proposal.document.id,
        flowId: proposal.document.flowId,
        summary: proposal.document.summary,
        confidence: proposal.document.confidence,
        relativePath: proposal.relativePath,
        digest: proposal.digest,
        graph,
        sourceReferences: sourceReferencesFromProposal(proposal.document),
      };
    }),
    invalidDocuments: repository.invalidDocuments.map((document) => ({
      kind: document.kind,
      relativePath: document.relativePath,
      issueCount: document.issues.length,
    })),
  };
};

export const sourceReferencesFromFlow = (
  flow: FlowguardFlow,
): readonly FlowguardWebviewSourceReference[] => {
  return [
    ...flow.states.flatMap((state) =>
      sourceReferenceFromState(state, {
        kind: 'state',
        stateId: state.id,
      }),
    ),
    ...flow.transitions.flatMap((transition) =>
      sourceReferenceFromTransition(transition, {
        kind: 'transition',
        transitionId: transition.id,
      }),
    ),
  ];
};

export const sourceReferencesFromProposal = (
  proposal: FlowProposal,
): readonly FlowguardWebviewSourceReference[] => {
  return proposal.operations.flatMap(sourceReferencesFromProposalOperation);
};

const sourceReferencesFromProposalOperation = (
  operation: FlowProposalOperation,
): readonly FlowguardWebviewSourceReference[] => {
  switch (operation.op) {
    case 'addState':
      return sourceReferenceFromState(operation.state, {
        kind: 'state',
        stateId: operation.state.id,
      });
    case 'updateState':
      return sourceReferenceFromStatePatch(operation.stateId, operation.patch);
    case 'addTransition':
      return sourceReferenceFromTransition(operation.transition, {
        kind: 'transition',
        transitionId: operation.transition.id,
      });
    case 'updateTransition':
      return sourceReferenceFromTransitionPatch(operation.transitionId, operation.patch);
    case 'removeState':
    case 'removeTransition':
    case 'updateFlow':
      return [];
  }
};

const sourceReferenceFromState = (
  state: FlowState,
  target: FlowguardRevealSourceTarget,
): readonly FlowguardWebviewSourceReference[] => {
  return sourceReferenceFromSources(target, state.name, state.sources);
};

const sourceReferenceFromStatePatch = (
  stateId: string,
  patch: FlowStatePatch,
): readonly FlowguardWebviewSourceReference[] => {
  return sourceReferenceFromSources(
    {
      kind: 'state',
      stateId,
    },
    stateId,
    patch.sources,
  );
};

const sourceReferenceFromTransition = (
  transition: FlowTransition,
  target: FlowguardRevealSourceTarget,
): readonly FlowguardWebviewSourceReference[] => {
  return sourceReferenceFromSources(target, transition.action, transition.sources);
};

const sourceReferenceFromTransitionPatch = (
  transitionId: string,
  patch: FlowTransitionPatch,
): readonly FlowguardWebviewSourceReference[] => {
  return sourceReferenceFromSources(
    {
      kind: 'transition',
      transitionId,
    },
    transitionId,
    patch.sources,
  );
};

const sourceReferenceFromSources = (
  target: FlowguardRevealSourceTarget,
  label: string,
  sources: readonly string[] | undefined,
): readonly FlowguardWebviewSourceReference[] => {
  if (sources === undefined || sources.length === 0) return [];

  return [
    {
      target,
      label,
      sources: [...sources],
    },
  ];
};

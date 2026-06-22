export const FLOWGUARD_TREE_CONTEXT_VALUES = {
  empty: 'flowguard.empty',
  workspaceMissing: 'flowguard.workspace.missing',
  flowValid: 'flowguard.flow.valid',
  flowInvalid: 'flowguard.flow.invalid',
  flowAffected: 'flowguard.flow.affected',
  flowProposed: 'flowguard.flow.proposed',
  flowAffectedProposed: 'flowguard.flow.affected.proposed',
  proposalProposed: 'flowguard.proposal.proposed',
  proposalInvalid: 'flowguard.proposal.invalid',
} as const;

export type FlowguardTreeContextValue =
  (typeof FLOWGUARD_TREE_CONTEXT_VALUES)[keyof typeof FLOWGUARD_TREE_CONTEXT_VALUES];

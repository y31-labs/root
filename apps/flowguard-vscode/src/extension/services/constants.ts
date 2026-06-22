export const FLOWGUARD_COMMANDS = {
  initializeRepository: 'flowguard.initializeRepository',
  openFlow: 'flowguard.openFlow',
  refresh: 'flowguard.refresh',
  showAffectedFlows: 'flowguard.showAffectedFlows',
  reviewProposal: 'flowguard.reviewProposal',
  acceptProposal: 'flowguard.acceptProposal',
  rejectProposal: 'flowguard.rejectProposal',
} as const;

export const FLOWGUARD_VIEWS = {
  flows: 'flowguard.flows',
  proposals: 'flowguard.proposals',
} as const;

export type FlowguardCommandId = (typeof FLOWGUARD_COMMANDS)[keyof typeof FLOWGUARD_COMMANDS];

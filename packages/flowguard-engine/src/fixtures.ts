import type { FlowguardFlow, FlowProposal } from '@workspace/flowguard-contracts';
import { makeLoginFlowFixture } from '@workspace/flowguard-contracts/fixtures';

export const makeUnreachableHelpFlowFixture = (): FlowguardFlow => {
  const flow = makeLoginFlowFixture();
  return {
    ...flow,
    states: [
      ...flow.states,
      {
        id: 'help-center',
        name: 'Help center',
        kind: 'page',
        route: '/help',
        sources: ['src/routes/help.tsx'],
      },
    ],
  };
};

export const makeRemoveAccountHomeProposalFixture = (
  baseDigest: FlowProposal['baseDigest'],
): FlowProposal => {
  return {
    version: 1,
    id: '01JREMOVE',
    flowId: 'login',
    baseDigest,
    createdAt: '2026-06-14T12:30:00.000Z',
    producer: {
      kind: 'codex',
      label: 'Codex',
    },
    summary: 'Remove the account home endpoint from the sign-in flow',
    confidence: 'medium',
    operations: [
      {
        op: 'removeTransition',
        transitionId: 'submit-valid-credentials',
        reason: 'The proposal removes the successful sign-in transition from this flow',
      },
      {
        op: 'removeState',
        stateId: 'account-home',
        reason: 'The account home state is no longer part of this flow',
      },
    ],
  };
};

import type {
  FlowCoverageDocument,
  FlowguardFlow,
  CanonicalDigest,
  FlowProposal,
  FlowguardConfig,
} from '#/types';

export const makeFlowguardConfigFixture = (): FlowguardConfig => {
  return {
    version: 1,
    flowDirectory: 'flows',
    proposalDirectory: 'proposals',
    coverageDirectory: 'coverage',
  };
};

export const makeLoginFlowFixture = (): FlowguardFlow => {
  return {
    version: 1,
    id: 'login',
    name: 'Sign in',
    goal: 'An existing user reaches their account',
    entryStateId: 'login-form',
    states: [
      {
        id: 'login-form',
        name: 'Login form',
        kind: 'page',
        route: '/login',
        description: 'Email and password fields are visible',
        sources: ['src/routes/login.tsx'],
      },
      {
        id: 'account-home',
        name: 'Account home',
        kind: 'page',
        route: '/account',
        sources: ['src/routes/account.tsx'],
      },
    ],
    transitions: [
      {
        id: 'submit-valid-credentials',
        from: 'login-form',
        to: 'account-home',
        actor: 'user',
        action: 'Submit valid credentials',
        outcome: 'The user is authenticated',
        sources: ['src/server/auth.ts'],
      },
    ],
  };
};

export const makePasswordResetProposalFixture = (baseDigest: CanonicalDigest): FlowProposal => {
  return {
    version: 1,
    id: '01JPROPOSAL',
    flowId: 'login',
    baseDigest,
    createdAt: '2026-06-14T12:00:00.000Z',
    producer: {
      kind: 'codex',
      label: 'Codex',
    },
    summary: 'Add password reset entry from the login form',
    confidence: 'medium',
    operations: [
      {
        op: 'addState',
        state: {
          id: 'password-reset',
          name: 'Password reset',
          kind: 'page',
          route: '/forgot-password',
        },
        reason: 'The feature adds a new user-visible recovery state',
      },
      {
        op: 'addTransition',
        transition: {
          id: 'open-password-reset',
          from: 'login-form',
          to: 'password-reset',
          actor: 'user',
          action: 'Choose forgot password',
        },
        reason: 'The login form exposes the new recovery action',
      },
    ],
  };
};

export const makeLoginCoverageFixture = (): FlowCoverageDocument => {
  return {
    version: 1,
    id: 'login-e2e',
    flowId: 'login',
    title: 'Login happy path',
    description: 'Playwright verifies that a known user can sign in and land on the account page.',
    gate: 'e2e',
    covers: [
      {
        kind: 'state',
        id: 'login-form',
        behavior: 'The email and password fields are visible.',
        required: true,
      },
      {
        kind: 'transition',
        id: 'submit-valid-credentials',
        behavior: 'Submitting valid credentials authenticates the user.',
        required: true,
      },
      {
        kind: 'state',
        id: 'account-home',
        behavior: 'The account home page confirms the user is signed in.',
        required: true,
      },
    ],
    evidence: [
      {
        kind: 'screenshot',
        label: 'Signed-in account page',
        required: true,
      },
      {
        kind: 'playwrightTrace',
        label: 'Playwright trace',
        required: true,
      },
      {
        kind: 'assertions',
        label: 'Assertion log',
        required: false,
      },
    ],
  };
};

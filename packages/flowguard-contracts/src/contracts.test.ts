import { describe, expect, test } from 'bun:test';

import {
  applyFlowProposal,
  canonicalSerialize,
  digestFlowCoverageDocument,
  digestFlowguardFlow,
  digestCanonicalJson,
  makeLoginCoverageFixture,
  makeLoginFlowFixture,
  makePasswordResetProposalFixture,
  makeFlowguardConfigFixture,
  parseFlowCoverageDocument,
  parseFlowCoverageDocumentJson,
  parseFlowguardFlow,
  parseFlowguardFlowJson,
  parseFlowProposal,
  parseFlowguardConfig,
} from '#/index';
import type { FlowProposal } from '#/types';

describe('Flowguard contracts', () => {
  test('parses valid version 1 config, flow, and proposal fixtures', async () => {
    const flow = makeLoginFlowFixture();
    const digest = await digestFlowguardFlow(flow);
    const proposal = makePasswordResetProposalFixture(digest);

    expect(parseFlowguardConfig(makeFlowguardConfigFixture()).ok).toBe(true);
    expect(parseFlowguardFlow(flow).ok).toBe(true);
    expect(parseFlowProposal(proposal).ok).toBe(true);
    expect(parseFlowCoverageDocument(makeLoginCoverageFixture()).ok).toBe(true);
  });

  test('defaults missing coverageDirectory for older config files', () => {
    const result = parseFlowguardConfig({
      version: 1,
      flowDirectory: 'flows',
      proposalDirectory: 'proposals',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected config parsing to succeed.');
    expect(result.value.coverageDirectory).toBe('coverage');
  });

  test('reports invalid JSON with a root JSON path', () => {
    const result = parseFlowguardFlowJson('{');

    expect(result.ok).toBe(false);
    expectIssue(result.issues, 'INVALID_JSON', '$');
  });

  test('reports duplicate entity ids and duplicate semantic transitions', () => {
    const flow = makeLoginFlowFixture();
    flow.states.push({
      id: 'login-form',
      name: 'Duplicate login form',
      kind: 'page',
    });
    flow.transitions.push({
      ...flow.transitions[0],
      id: 'submit-valid-credentials-copy',
    });

    const result = parseFlowguardFlow(flow);

    expect(result.ok).toBe(false);
    expectIssue(result.issues, 'DUPLICATE_ID', '$.states[2].id');
    expectIssue(result.issues, 'DUPLICATE_TRANSITION', '$.transitions[1].id');
  });

  test('reports broken state references with precise paths', () => {
    const flow = makeLoginFlowFixture();
    flow.entryStateId = 'missing-entry';
    flow.transitions[0].to = 'missing-target';

    const result = parseFlowguardFlow(flow);

    expect(result.ok).toBe(false);
    expectIssue(result.issues, 'BROKEN_REFERENCE', '$.entryStateId');
    expectIssue(result.issues, 'BROKEN_REFERENCE', '$.transitions[0].to');
  });

  test('reports unsafe repository paths', () => {
    const flow = makeLoginFlowFixture();
    flow.states[0].sources = ['../outside.ts'];
    flow.transitions[0].sources = ['src\\server\\auth.ts'];

    const result = parseFlowguardFlow(flow);

    expect(result.ok).toBe(false);
    expectIssue(result.issues, 'UNSAFE_PATH', '$.states[0].sources[0]');
    expectIssue(result.issues, 'UNSAFE_PATH', '$.transitions[0].sources[0]');
  });

  test('rejects unsupported document versions', async () => {
    const flow = makeLoginFlowFixture();
    const digest = await digestFlowguardFlow(flow);
    const proposal = makePasswordResetProposalFixture(digest);
    const config = makeFlowguardConfigFixture();

    expectIssue(
      parseFlowguardFlow({ ...flow, version: 2 }).issues,
      'UNSUPPORTED_VERSION',
      '$.version',
    );
    expectIssue(
      parseFlowProposal({ ...proposal, version: 2 }).issues,
      'UNSUPPORTED_VERSION',
      '$.version',
    );
    expectIssue(
      parseFlowCoverageDocument({ ...makeLoginCoverageFixture(), version: 2 }).issues,
      'UNSUPPORTED_VERSION',
      '$.version',
    );
    expectIssue(
      parseFlowguardConfig({ ...config, version: 2 }).issues,
      'UNSUPPORTED_VERSION',
      '$.version',
    );
  });

  test('reports implementation-shaped transition actions', () => {
    const flow = makeLoginFlowFixture();
    flow.transitions[0].action = 'submitValidCredentials()';

    const result = parseFlowguardFlow(flow);

    expect(result.ok).toBe(false);
    expectIssue(result.issues, 'IMPLEMENTATION_ACTION', '$.transitions[0].action');
  });

  test('keeps unreachable states as warnings', () => {
    const flow = makeLoginFlowFixture();
    flow.states.push({
      id: 'help-center',
      name: 'Help center',
      kind: 'page',
      route: '/help',
    });

    const result = parseFlowguardFlow(flow);

    expect(result.ok).toBe(true);
    expectIssue(result.issues, 'UNREACHABLE_STATE', '$.states[2].id');
    expect(result.issues.find((item) => item.code === 'UNREACHABLE_STATE')?.severity).toBe(
      'warning',
    );
  });

  test('canonical serialization sorts object keys recursively and digest is stable', async () => {
    const left = { b: 1, a: { d: 4, c: [{ b: 2, a: 1 }] } };
    const right = { a: { c: [{ a: 1, b: 2 }], d: 4 }, b: 1 };

    expect(canonicalSerialize(left)).toBe('{"a":{"c":[{"a":1,"b":2}],"d":4},"b":1}');
    expect(await digestCanonicalJson(left)).toBe(await digestCanonicalJson(right));
    expect(await digestCanonicalJson(left)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('digests coverage documents with canonical JSON', async () => {
    const coverage = makeLoginCoverageFixture();
    const digest = await digestFlowCoverageDocument(coverage);

    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digest).toBe(await digestCanonicalJson(coverage));
  });

  test('validates coverage documents and evidence kinds', () => {
    const coverage = makeLoginCoverageFixture();
    coverage.covers.push({ ...coverage.covers[0] });

    const duplicate = parseFlowCoverageDocument(coverage);
    expect(duplicate.ok).toBe(false);
    expectIssue(duplicate.issues, 'DUPLICATE_ID', '$.covers[3].id');

    const empty = parseFlowCoverageDocument({
      ...makeLoginCoverageFixture(),
      id: 'empty-coverage',
      covers: [],
    });
    expect(empty.ok).toBe(false);
    expectIssue(empty.issues, 'EMPTY_COLLECTION', '$.covers');

    const invalidEvidence = parseFlowCoverageDocumentJson(
      JSON.stringify({
        ...makeLoginCoverageFixture(),
        id: 'invalid-evidence',
        evidence: [{ kind: 'video', label: 'Replay', required: true }],
      }),
    );
    expect(invalidEvidence.ok).toBe(false);
    expectIssue(invalidEvidence.issues, 'INVALID_VALUE', '$.evidence[0].kind');
  });

  test('applies proposals without mutating the approved Flowguard contract', async () => {
    const baseFlow = makeLoginFlowFixture();
    const baseDigest = await digestFlowguardFlow(baseFlow);
    const proposal = makePasswordResetProposalFixture(baseDigest);

    const result = await applyFlowProposal(baseFlow, proposal);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected proposal application to succeed.');
    expect(result.flow.states.map((state) => state.id)).toEqual([
      'login-form',
      'account-home',
      'password-reset',
    ]);
    expect(result.flow.transitions.map((transition) => transition.id)).toEqual([
      'submit-valid-credentials',
      'open-password-reset',
    ]);
    expect(result.digest).not.toBe(baseDigest);
    expect(baseFlow.states.map((state) => state.id)).toEqual(['login-form', 'account-home']);
  });

  test('rejects stale proposal digests', async () => {
    const baseFlow = makeLoginFlowFixture();
    const proposal = makePasswordResetProposalFixture(`sha256:${'0'.repeat(64)}`);

    const result = await applyFlowProposal(baseFlow, proposal);

    expect(result.ok).toBe(false);
    expectIssue(result.issues, 'STALE_DIGEST', '$.baseDigest');
  });

  test('rejects operation conflicts in order', async () => {
    const baseFlow = makeLoginFlowFixture();
    const baseDigest = await digestFlowguardFlow(baseFlow);
    const duplicateStateProposal: FlowProposal = {
      ...makePasswordResetProposalFixture(baseDigest),
      operations: [
        {
          op: 'addState',
          state: { ...baseFlow.states[0] },
          reason: 'The proposal tries to add an existing state',
        },
      ],
    };
    const missingTransitionProposal: FlowProposal = {
      ...makePasswordResetProposalFixture(baseDigest),
      operations: [
        {
          op: 'updateTransition',
          transitionId: 'missing-transition',
          patch: { action: 'Choose account home' },
          reason: 'The proposal tries to update a missing transition',
        },
      ],
    };

    const duplicateResult = await applyFlowProposal(baseFlow, duplicateStateProposal);
    const missingResult = await applyFlowProposal(baseFlow, missingTransitionProposal);

    expect(duplicateResult.ok).toBe(false);
    expectIssue(duplicateResult.issues, 'OPERATION_CONFLICT', '$.operations[0].state.id');
    expect(missingResult.ok).toBe(false);
    expectIssue(missingResult.issues, 'OPERATION_CONFLICT', '$.operations[0].transitionId');
  });

  test('rejects proposal operations that point at missing states', async () => {
    const baseFlow = makeLoginFlowFixture();
    const baseDigest = await digestFlowguardFlow(baseFlow);
    const proposal: FlowProposal = {
      ...makePasswordResetProposalFixture(baseDigest),
      operations: [
        {
          op: 'addTransition',
          transition: {
            id: 'open-unknown-state',
            from: 'login-form',
            to: 'unknown-state',
            actor: 'user',
            action: 'Choose unknown state',
          },
          reason: 'The proposal references a missing target state',
        },
      ],
    };

    const result = await applyFlowProposal(baseFlow, proposal);

    expect(result.ok).toBe(false);
    expectIssue(result.issues, 'OPERATION_CONFLICT', '$.operations[0].transition.to');
  });
});

const expectIssue = (
  issues: readonly { code: string; path: string }[],
  code: string,
  path: string,
) => {
  const match = issues.find((issue) => issue.code === code && issue.path === path);
  expect(match).toBeDefined();
  return match;
};

import { describe, expect, test } from 'bun:test';

import {
  canTransitionSession,
  isFreshVerifiedSession,
  type ChangeSession,
  type VerificationSnapshot,
} from '@workspace/code-agent-contracts/sessions';

describe('change session contract', () => {
  test('supports recovery but keeps accepted and discarded final', () => {
    expect(canTransitionSession('needs_input', 'implementing')).toBe(true);
    expect(canTransitionSession('cancelled', 'verifying')).toBe(true);
    expect(canTransitionSession('accepted', 'verifying')).toBe(false);
    expect(canTransitionSession('discarded', 'implementing')).toBe(false);
  });

  test('requires a complete snapshot for the current digest', () => {
    const session = {
      status: 'verified',
      verificationDigest: 'digest-1',
    } as ChangeSession;
    const snapshot = {
      worktreeDigest: 'digest-1',
      required: 4,
      passed: 4,
      failed: 0,
      missing: 0,
      hasDiff: true,
    } as VerificationSnapshot;

    expect(isFreshVerifiedSession(session, snapshot, 'digest-1')).toBe(true);
    expect(isFreshVerifiedSession(session, snapshot, 'digest-2')).toBe(false);
    expect(isFreshVerifiedSession(session, { ...snapshot, hasDiff: false }, 'digest-1')).toBe(
      false,
    );
  });
});

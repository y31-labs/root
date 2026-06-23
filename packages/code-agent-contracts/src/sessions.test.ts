import { describe, expect, test } from 'bun:test';

import {
  canTransitionSession,
  isFreshVerifiedSession,
  parseRepositoryTarget,
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

  test('parses repository targets and rejects unsafe paths', () => {
    const target = parseRepositoryTarget({
      id: 'target-1',
      repositoryId: 'repo-1',
      name: 'trading',
      path: 'apps/trading',
      kind: 'app',
      packageName: 'trading',
      scripts: { dev: 'vite dev', typecheck: 'tsc --noEmit' },
      source: 'detected',
      selected: true,
      createdAt: 1,
      updatedAt: 2,
    });

    expect(target.path).toBe('apps/trading');
    expect(target.scripts.typecheck).toBe('tsc --noEmit');
    expect(() =>
      parseRepositoryTarget({
        ...target,
        path: '../outside',
      }),
    ).toThrow('repository-relative POSIX');
  });
});

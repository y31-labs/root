import { describe, expect, test } from 'bun:test';

import {
  canTransitionRun,
  isVerifiedResult,
  summarizeVerification,
} from '@workspace/code-agent-contracts/runs';

describe('run contract', () => {
  test('allows only declared lifecycle transitions', () => {
    expect(canTransitionRun('queued', 'preparing')).toBe(true);
    expect(canTransitionRun('failed', 'queued')).toBe(false);
    expect(canTransitionRun('implementing', 'verified')).toBe(false);
  });

  test('requires every gate and a patch before verification', () => {
    const summary = summarizeVerification(
      ['build', 'unit'],
      [
        { kind: 'build', required: true, status: 'passed' },
        { kind: 'unit', required: true, status: 'passed' },
      ],
    );
    expect(isVerifiedResult(summary, true)).toBe(true);
    expect(isVerifiedResult(summary, false)).toBe(false);
  });
});

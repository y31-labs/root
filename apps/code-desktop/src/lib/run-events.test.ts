import { describe, expect, it } from 'vitest';

import { gateMutationArgs } from '#/lib/run-events';

describe('local run event synchronization', () => {
  it('sends only the authoritative gate result fields to Convex', () => {
    expect(
      gateMutationArgs({
        type: 'gate',
        runId: 'run-1',
        kind: 'build',
        status: 'failed',
        required: true,
        attempt: 2,
        durationMs: 321,
        exitCode: 1,
      }),
    ).toEqual({
      kind: 'build',
      status: 'failed',
      required: true,
      attempt: 2,
      durationMs: 321,
      exitCode: 1,
    });
  });
});


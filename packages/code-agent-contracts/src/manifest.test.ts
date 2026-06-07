import { describe, expect, test } from 'bun:test';

import {
  defaultManifest,
  parseVerificationManifest,
} from '@workspace/code-agent-contracts/manifest';

describe('verification manifest', () => {
  test('creates a Bun manifest from known scripts', () => {
    const manifest = defaultManifest('1.3.5', { build: 'vite build', test: 'vitest run' });
    expect(manifest.gates.install?.args).toEqual(['install', '--frozen-lockfile']);
    expect(manifest.gates.build?.required).toBe(true);
    expect(manifest.gates.unit?.required).toBe(true);
  });

  test('rejects shell executables and manifests without required gates', () => {
    expect(() =>
      parseVerificationManifest({
        version: 1,
        runtime: { packageManager: 'bun', bunVersion: '1.3.5' },
        gates: {
          build: {
            command: '/bin/sh',
            args: ['-c', 'echo unsafe'],
            timeoutMs: 10_000,
            required: true,
          },
        },
      }),
    ).toThrow('PATH executable');
  });
});

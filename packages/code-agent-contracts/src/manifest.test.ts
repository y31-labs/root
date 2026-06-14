import { describe, expect, test } from 'bun:test';

import {
  defaultManifest,
  manifestFingerprintPaths,
  parseVerificationManifest,
} from '@workspace/code-agent-contracts/manifest';

describe('verification manifest', () => {
  test('creates a version 2 Bun policy and prefers test:unit', () => {
    const manifest = defaultManifest('1.3.5', {
      build: 'vite build',
      test: 'vitest run',
      'test:unit': 'vitest run unit',
      'test:e2e': 'playwright test',
    });

    expect(manifest.version).toBe(2);
    expect(manifest.gates.install).toMatchObject({
      args: ['install', '--frozen-lockfile'],
      network: 'enabled',
    });
    expect(manifest.gates.unit?.args).toEqual(['run', 'test:unit']);
    expect(manifest.gates.e2e?.network).toBe('disabled');
  });

  test('allows network only for the pinned install command', () => {
    expect(() =>
      parseVerificationManifest({
        version: 2,
        runtime: { packageManager: 'bun', bunVersion: '1.3.5' },
        gates: {
          unit: {
            command: 'bun',
            args: ['test'],
            timeoutMs: 10_000,
            required: true,
            network: 'enabled',
          },
        },
      }),
    ).toThrow('Only `bun install --frozen-lockfile`');
  });

  test('rejects a Bun version that does not match the verifier image', () => {
    expect(() => defaultManifest('1.3.6', { test: 'vitest run' })).toThrow('pinned verifier');
  });

  test('requires an app server to stay on one localhost origin', () => {
    const manifest = defaultManifest('1.3.5', { build: 'vite build' });
    expect(() =>
      parseVerificationManifest({
        ...manifest,
        appServer: {
          command: 'bun',
          args: ['run', 'dev'],
          timeoutMs: 300_000,
          healthUrl: 'http://localhost:3000/health',
          healthTimeoutMs: 30_000,
          browserBaseUrl: 'https://example.com',
        },
      }),
    ).toThrow('localhost');
  });

  test('returns deterministic policy fingerprint inputs', () => {
    expect(manifestFingerprintPaths(['apps/code', 'packages/ui/'])).toEqual([
      'bun.lock',
      'package.json',
      'bunfig.toml',
      'apps/code/package.json',
      'packages/ui/package.json',
    ]);
  });
});

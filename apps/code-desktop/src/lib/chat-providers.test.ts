import type { EngineHealth } from '@workspace/code-agent-contracts/engine';
import { describe, expect, it } from 'vitest';

import {
  getChatProvider,
  providerConnectionStatus,
  relativeUpdatedAt,
  repositoryName,
} from '#/lib/chat-providers';

const health = (overrides: Partial<EngineHealth> = {}): EngineHealth => ({
  available: false,
  authenticated: false,
  dockerAvailable: false,
  ...overrides,
});

describe('chat providers', () => {
  it('looks up the enabled Codex provider', () => {
    expect(getChatProvider('codex')).toMatchObject({
      id: 'codex',
      label: 'Codex',
      enabled: true,
    });
  });

  it('derives exact connection states without requiring Docker', () => {
    expect(providerConnectionStatus(undefined, { checking: true })).toBe('checking');
    expect(providerConnectionStatus(undefined, { checking: false, error: 'Failed' })).toBe(
      'error',
    );
    expect(providerConnectionStatus(health(), { checking: false })).toBe('unavailable');
    expect(
      providerConnectionStatus(health({ version: 'codex 1.0.0' }), { checking: false }),
    ).toBe('disconnected');
    expect(
      providerConnectionStatus(
        health({ version: 'codex 1.0.0', authenticated: true, dockerAvailable: false }),
        { checking: false },
      ),
    ).toBe('connected');
  });

  it('formats repository names and relative activity', () => {
    expect(repositoryName('/Users/example/root/')).toBe('root');
    expect(relativeUpdatedAt(1_700_000_000_000, 1_700_000_120_000)).toBe('2 minutes ago');
  });
});

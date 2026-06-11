import { describe, expect, it, vi } from 'vitest';

import { DesktopLogger, sanitizeLogEvent } from '#/lib/logging';

describe('desktop logging', () => {
  it('is a no-op without a configured client', async () => {
    const installationId = vi.fn(async () => 'installation-1');
    await new DesktopLogger(undefined, installationId).write({
      level: 'info',
      message: 'application started',
    });

    expect(installationId).not.toHaveBeenCalled();
  });

  it('filters messages and attributes to metadata allowlists', () => {
    expect(
      sanitizeLogEvent({
        level: 'error',
        message: 'chat operation failed',
        attributes: {
          operation: 'send-message',
          threadId: 'thread-1',
          prompt: 'private prompt',
          path: '/private/repository',
        },
      }),
    ).toEqual({
      level: 'error',
      message: 'chat operation failed',
      attributes: {
        operation: 'send-message',
        threadId: 'thread-1',
      },
    });
    expect(
      sanitizeLogEvent({ level: 'error', message: 'arbitrary private error' }),
    ).toBeUndefined();
  });

  it('enriches records with the installation id and application context', async () => {
    const info = vi.fn();
    const logger = new DesktopLogger(
      { logger: { info, warn: vi.fn(), error: vi.fn() } },
      async () => 'installation-1',
    );

    await logger.write({
      level: 'info',
      message: 'application started',
      attributes: { operation: 'startup' },
    });

    expect(info).toHaveBeenCalledWith('application started', {
      application: 'code-desktop',
      source: 'frontend',
      installationId: 'installation-1',
      operation: 'startup',
    });
  });

  it('accepts sanitized engine event payloads', async () => {
    const error = vi.fn();
    const logger = new DesktopLogger(
      { logger: { info: vi.fn(), warn: vi.fn(), error } },
      async () => 'installation-1',
    );

    await logger.write({
      level: 'error',
      message: 'codex request failed',
      attributes: {
        source: 'engine',
        operation: 'turn/start',
        errorCategory: 'timeout',
        output: 'private command output',
      },
    });

    expect(error).toHaveBeenCalledWith('codex request failed', {
      application: 'code-desktop',
      source: 'engine',
      installationId: 'installation-1',
      operation: 'turn/start',
      errorCategory: 'timeout',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';

import { createLocalApi } from '#/lib/local-api';

describe('local API', () => {
  it('uses local repository and session commands with structured inputs', async () => {
    const invoke = vi.fn(async () => undefined);
    const api = createLocalApi(invoke);

    await api.approveRepositoryPolicy('repo-1', {
      version: 2,
      runtime: { packageManager: 'bun', bunVersion: '1.3.5' },
      gates: {
        install: {
          command: 'bun',
          args: ['install', '--frozen-lockfile'],
          timeoutMs: 300_000,
          required: true,
          network: 'enabled',
        },
      },
    });
    await api.scanRepositoryTargets('repo-1');
    await api.saveRepositoryTargets('repo-1', [
      {
        name: 'trading',
        path: 'apps/trading',
        kind: 'app',
        packageName: 'trading',
        scripts: { build: 'vite build' },
        source: 'detected',
        selected: true,
      },
    ]);
    await api.startChangeSession('repo-1', 'Add a verified feature');
    await api.exportEvidenceReport('session-1');

    expect(invoke).toHaveBeenNthCalledWith(1, 'approve_repository_policy', {
      input: {
        repositoryId: 'repo-1',
        manifest: expect.objectContaining({ version: 2 }),
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'scan_repository_targets', {
      repositoryId: 'repo-1',
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'save_repository_targets', {
      input: {
        repositoryId: 'repo-1',
        targets: [
          {
            name: 'trading',
            path: 'apps/trading',
            kind: 'app',
            packageName: 'trading',
            scripts: { build: 'vite build' },
            source: 'detected',
            selected: true,
          },
        ],
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, 'start_change_session', {
      input: { repositoryId: 'repo-1', request: 'Add a verified feature' },
    });
    expect(invoke).toHaveBeenNthCalledWith(5, 'export_evidence_report', {
      sessionId: 'session-1',
    });
  });
});

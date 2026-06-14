import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const repository = {
      id: 'repo-1',
      path: '/fixtures/code',
      name: 'code',
      headSha: '0123456789abcdef',
      branch: 'main',
      dirty: true,
      compatible: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      policy: {
        repositoryId: 'repo-1',
        manifest: {
          version: 2,
          runtime: { packageManager: 'bun', bunVersion: '1.3.5' },
          gates: {
            install: {
              command: 'bun',
              args: ['install', '--frozen-lockfile'],
              timeoutMs: 300000,
              required: true,
              network: 'enabled',
            },
            unit: {
              command: 'bun',
              args: ['run', 'test:unit'],
              timeoutMs: 300000,
              required: true,
              network: 'disabled',
            },
          },
        },
        fingerprint: 'fingerprint',
        fingerprintPaths: ['bun.lock', 'package.json'],
        approvedAt: Date.now(),
        valid: true,
      },
    };
    window.__CODE_TEST_INVOKE__ = async (command) => {
      if (command === 'list_repositories') return [repository];
      if (command === 'list_change_sessions') return [];
      if (command === 'engine_health') {
        return {
          available: true,
          version: 'codex-cli test',
          authenticated: true,
          gitAvailable: true,
          dockerAvailable: true,
          appServerAvailable: true,
          browserToolsAvailable: true,
        };
      }
      throw new Error(`Unhandled test command: ${command}`);
    };
  });
});

test('opens a dirty local repository without treating its edits as session input', async ({
  page,
}) => {
  await page.goto('/repositories');

  await expect(page.getByRole('heading', { name: 'Repositories' })).toBeVisible();
  await expect(page.getByText('/fixtures/code')).toBeVisible();
  await expect(
    page.getByText('Uncommitted changes stay in this working tree and are excluded from sessions.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'code' })).toBeVisible();
  await expect(page.getByText('Approved and current')).toBeVisible();
});

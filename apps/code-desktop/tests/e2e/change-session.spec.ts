import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const repository = {
      id: 'repo-1',
      path: '/fixtures/code',
      name: 'code',
      headSha: '0123456789abcdef',
      branch: 'main',
      dirty: true,
      compatible: true,
      createdAt: now,
      updatedAt: now,
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
        approvedAt: now,
        valid: true,
      },
    };
    const session = {
      id: 'session-1',
      repositoryId: 'repo-1',
      repositoryName: 'code',
      request: 'Repair the checkout flow',
      baseSha: '0123456789abcdef',
      worktreePath: '/app-data/worktrees/session-1',
      codexThreadId: 'thread-1',
      status: 'needs_input',
      attempt: 2,
      terminalReason: 'Unit verification needs developer input',
      createdAt: now,
      updatedAt: now,
    };
    const detail = {
      session,
      repository,
      policy: repository.policy,
      events: [
        { id: 1, sessionId: session.id, kind: 'user', message: session.request, createdAt: now },
        {
          id: 2,
          sessionId: session.id,
          kind: 'repair',
          message: 'Verification failed against digest abc123',
          createdAt: now,
        },
      ],
      gateResults: [
        {
          id: 1,
          sessionId: session.id,
          kind: 'unit',
          required: true,
          status: 'failed',
          attempt: 2,
          durationMs: 1200,
          exitCode: 1,
          worktreeDigest: 'abc123',
          artifactIds: ['artifact-log'],
        },
      ],
      approvals: [
        {
          requestId: 7,
          method: 'item/networkAccess/requestApproval',
          detail: 'Network access to the approved localhost origin',
          status: 'pending',
          createdAt: now,
        },
      ],
      artifacts: [
        {
          id: 'artifact-log',
          sessionId: session.id,
          kind: 'commandLog',
          path: '/app-data/sessions/session-1/artifacts/unit.log',
          label: 'Unit command log',
          createdAt: now,
        },
        {
          id: 'artifact-trace',
          sessionId: session.id,
          kind: 'playwrightTrace',
          path: '/app-data/sessions/session-1/artifacts/trace.zip',
          label: 'Playwright trace',
          createdAt: now,
        },
      ],
      diff: 'diff --git a/source.ts b/source.ts\n+fixed',
      currentDigest: 'abc123',
      verificationStale: false,
    };

    window.__CODE_TEST_INVOKE__ = async (command) => {
      if (command === 'list_repositories') return [repository];
      if (command === 'list_change_sessions') return [session];
      if (command === 'get_change_session') return structuredClone(detail);
      if (command === 'resolve_session_approval') {
        detail.approvals = [];
        return;
      }
      if (command === 'continue_change_session') {
        detail.session.status = 'implementing';
        return;
      }
      if (command === 'verify_change_session') {
        detail.session.status = 'verified';
        detail.session.verificationDigest = 'abc123';
        detail.verificationStale = false;
        detail.snapshot = {
          sessionId: session.id,
          worktreeDigest: 'abc123',
          required: 1,
          passed: 1,
          failed: 0,
          missing: 0,
          hasDiff: true,
          verifiedAt: Date.now(),
        };
        detail.gateResults[0].status = 'passed';
        return;
      }
      if (command === 'accept_change_session') {
        detail.session.status = 'accepted';
        detail.session.branchName = 'code/repair-checkout-session1';
        return detail.session.branchName;
      }
      if (command === 'discard_change_session') {
        detail.session.status = 'discarded';
        return;
      }
      if (command === 'read_artifact') return 'redacted command output';
      if (command === 'reveal_artifact') return;
      throw new Error(`Unhandled test command: ${command}`);
    };
  });
});

test('reviews approvals, grouped repair history, and evidence', async ({ page }) => {
  await page.goto('/sessions/session-1');

  await expect(page.getByRole('heading', { name: 'Repair the checkout flow' })).toBeVisible();
  await expect(page.getByText('Verification failed against digest abc123')).toBeVisible();
  await expect(page.getByText('Network access to the approved localhost origin')).toBeVisible();
  await page.getByRole('button', { name: 'Allow once' }).click();
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeHidden();

  await page.getByRole('tab', { name: 'Artifacts' }).click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText('redacted command output')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal' })).toHaveCount(2);
});

test('re-verifies a recoverable session and accepts the fresh branch', async ({ page }) => {
  await page.goto('/sessions/session-1');

  await page.getByRole('button', { name: 'Verify again' }).click();
  await expect(page.getByText('verified', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Accept branch' }).click();
  await expect(page.getByText('accepted', { exact: true })).toBeVisible();
});

test('shows stale verification and blocks acceptance', async ({ page }) => {
  await page.addInitScript(() => {
    const invoke = window.__CODE_TEST_INVOKE__!;
    window.__CODE_TEST_INVOKE__ = async (command, args) => {
      const value = await invoke(command, args);
      if (command === 'get_change_session' && value) {
        const detail = value as Record<string, any>;
        detail.session.status = 'verified';
        detail.session.verificationDigest = 'old-digest';
        detail.verificationStale = true;
        detail.snapshot = {
          sessionId: 'session-1',
          worktreeDigest: 'old-digest',
          required: 1,
          passed: 1,
          failed: 0,
          missing: 0,
          hasDiff: true,
          verifiedAt: Date.now(),
        };
      }
      return value;
    };
  });
  await page.goto('/sessions/session-1');

  await expect(page.getByText(/worktree changed after verification/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept branch' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Verify again' })).toBeVisible();
});

test('discards a recoverable session after confirmation', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/sessions/session-1');

  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('discarded', { exact: true })).toBeVisible();
});

import { expect, test } from '@playwright/test';

const now = Date.now();

function manifest() {
  return {
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
  };
}

test('registers a local repository and prompts for project mapping', async ({ page }) => {
  await page.addInitScript(
    ({ timestamp }) => {
      let repositories: Array<Record<string, unknown>> = [];
      window.__CODE_TEST_SELECT_DIRECTORY__ = async () => '/fixtures/new-repository';
      window.__CODE_TEST_INVOKE__ = async (command) => {
        if (command === 'list_repositories') return structuredClone(repositories);
        if (command === 'list_repository_targets') return [];
        if (command === 'scan_repository_targets') {
          return { targets: [], assisted: false, assistanceDetail: 'deterministic scan' };
        }
        if (command === 'list_change_sessions') return [];
        if (command === 'register_repository') {
          const repository = {
            id: 'repo-new',
            path: '/fixtures/new-repository',
            name: 'new-repository',
            headSha: 'abcdef0123456789',
            branch: 'main',
            dirty: true,
            compatible: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          repositories = [repository];
          return structuredClone(repository);
        }
        throw new Error(`Unhandled test command: ${command}`);
      };
    },
    { timestamp: now },
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Open repository' }).click();

  await expect(page.getByRole('heading', { name: 'Map new-repository' })).toBeVisible();
  await expect(page.getByText('Mapping required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start isolated session' })).toHaveCount(0);
});

test('proposes, edits, approves, and invalidates repository policy', async ({ page }) => {
  await page.addInitScript(
    ({ timestamp, proposedManifest }) => {
      const repository: Record<string, any> = {
        id: 'repo-1',
        path: '/fixtures/code',
        name: 'code',
        headSha: '0123456789abcdef',
        branch: 'main',
        dirty: false,
        compatible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      window.__CODE_TEST_INVOKE__ = async (command, args) => {
        if (command === 'list_repositories') return [structuredClone(repository)];
        if (command === 'list_repository_targets') return [];
        if (command === 'scan_repository_targets') {
          return { targets: [], assisted: false, assistanceDetail: 'deterministic scan' };
        }
        if (command === 'list_change_sessions') return [];
        if (command === 'propose_repository_policy') {
          return {
            manifest: structuredClone(proposedManifest),
            fingerprint: 'proposal-fingerprint',
            fingerprintPaths: ['bun.lock', 'package.json'],
            detectedScripts: ['test:unit'],
          };
        }
        if (command === 'approve_repository_policy') {
          repository.policy = {
            repositoryId: 'repo-1',
            manifest: structuredClone((args as any).input.manifest),
            fingerprint: 'approved-fingerprint',
            fingerprintPaths: ['bun.lock', 'package.json'],
            approvedAt: timestamp,
            valid: true,
          };
          return structuredClone(repository);
        }
        if (command === 'refresh_repository') {
          repository.policy.valid = false;
          return structuredClone(repository);
        }
        throw new Error(`Unhandled test command: ${command}`);
      };
    },
    { timestamp: now, proposedManifest: manifest() },
  );

  await page.goto('/repositories/repo-1');
  await page.getByRole('button', { name: 'Propose policy' }).click();
  await page.getByText('Technical details').click();
  await page
    .locator('textarea')
    .first()
    .fill(JSON.stringify(manifest(), null, 2));
  await page.getByRole('button', { name: 'Approve policy' }).click();

  await expect(page.getByText('Approved and current')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Review required')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start isolated session' })).toBeDisabled();
});

test('creates an active isolated session and exposes cancellation', async ({ page }) => {
  await page.addInitScript(
    ({ timestamp, approvedManifest }) => {
      const repository = {
        id: 'repo-1',
        path: '/fixtures/code',
        name: 'code',
        headSha: '0123456789abcdef',
        branch: 'main',
        dirty: false,
        compatible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        policy: {
          repositoryId: 'repo-1',
          manifest: approvedManifest,
          fingerprint: 'approved',
          fingerprintPaths: ['bun.lock', 'package.json'],
          approvedAt: timestamp,
          valid: true,
        },
      };
      const session = {
        id: 'session-active',
        repositoryId: 'repo-1',
        repositoryName: 'code',
        request: 'Add checkout recovery',
        baseSha: repository.headSha,
        worktreePath: '/app-data/worktrees/session-active',
        status: 'implementing',
        attempt: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      window.__CODE_TEST_INVOKE__ = async (command) => {
        if (command === 'list_repositories') return [repository];
        if (command === 'list_repository_targets') return [];
        if (command === 'scan_repository_targets') {
          return { targets: [], assisted: false, assistanceDetail: 'deterministic scan' };
        }
        if (command === 'list_change_sessions') return [];
        if (command === 'start_change_session') return session.id;
        if (command === 'get_change_session') {
          return {
            session,
            repository,
            policy: repository.policy,
            events: [],
            gateResults: [],
            approvals: [],
            artifacts: [],
            diff: '',
            currentDigest: '',
            verificationStale: false,
          };
        }
        if (command === 'cancel_change_session') {
          session.status = 'cancelled';
          return;
        }
        throw new Error(`Unhandled test command: ${command}`);
      };
    },
    { timestamp: now, approvedManifest: manifest() },
  );

  await page.goto('/repositories/repo-1');
  await page
    .getByPlaceholder('Describe the change and the behavior that should be verified.')
    .fill('Add checkout recovery');
  await page.getByRole('button', { name: 'Start isolated session' }).click();

  await expect(page.getByText('implementing', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
});

test('scans, curates, and starts a target-scoped session', async ({ page }) => {
  await page.addInitScript(
    ({ timestamp, approvedManifest }) => {
      const repository = {
        id: 'repo-1',
        path: '/fixtures/root',
        name: 'root',
        headSha: '0123456789abcdef',
        branch: 'main',
        dirty: false,
        compatible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        policy: {
          repositoryId: 'repo-1',
          manifest: approvedManifest,
          fingerprint: 'approved',
          fingerprintPaths: ['bun.lock', 'package.json'],
          approvedAt: timestamp,
          valid: true,
        },
      };
      let targets: Array<Record<string, unknown>> = [];
      const session = {
        id: 'session-target',
        repositoryId: 'repo-1',
        repositoryName: 'root',
        targetId: 'target-trading',
        targetName: 'trading',
        targetPath: 'apps/trading',
        request: 'Fix trading header',
        baseSha: repository.headSha,
        worktreePath: '/app-data/worktrees/session-target',
        status: 'implementing',
        attempt: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      window.__CODE_TEST_INVOKE__ = async (command, args) => {
        if (command === 'list_repositories') return [repository];
        if (command === 'list_repository_targets') return structuredClone(targets);
        if (command === 'scan_repository_targets') {
          return {
            assisted: false,
            assistanceDetail: 'deterministic scan',
            targets: [
              {
                id: 'target-trading',
                repositoryId: 'repo-1',
                name: 'trading',
                path: 'apps/trading',
                kind: 'app',
                packageName: 'trading',
                scripts: { dev: 'vite dev', build: 'vite build' },
                source: 'detected',
                selected: true,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
              {
                id: 'target-ui',
                repositoryId: 'repo-1',
                name: 'ui',
                path: 'packages/ui',
                kind: 'package',
                packageName: '@workspace/ui',
                scripts: { typecheck: 'tsc --noEmit' },
                source: 'detected',
                selected: true,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          };
        }
        if (command === 'save_repository_targets') {
          targets = (args as any).input.targets.map((target: any, index: number) => ({
            ...target,
            id: target.id ?? `manual-${index}`,
            repositoryId: 'repo-1',
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
          return structuredClone(targets);
        }
        if (command === 'list_change_sessions') return [];
        if (command === 'get_target_flow_overview') {
          return {
            snapshot: {
              target: targets.find((target) => target.id === 'target-trading'),
              flows: [],
              unscopedFlows: [],
              proposals: [],
              invalidDocuments: [],
              generatedAt: timestamp,
            },
            timeline: [],
          };
        }
        if (command === 'start_change_session') {
          (window as any).__START_INPUT__ = (args as any).input;
          return session.id;
        }
        if (command === 'get_change_session') {
          return {
            session,
            repository,
            policy: repository.policy,
            events: [],
            gateResults: [],
            approvals: [],
            artifacts: [],
            diff: '',
            currentDigest: '',
            verificationStale: false,
          };
        }
        throw new Error(`Unhandled test command: ${command}`);
      };
    },
    { timestamp: now, approvedManifest: manifest() },
  );

  await page.goto('/repositories/repo-1');

  await expect(page.getByRole('heading', { name: 'Repository map' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Packages' })).toBeVisible();
  await expect(page.getByText('trading', { exact: true })).toBeVisible();
  await expect(page.getByText('packages/ui')).toBeVisible();

  await page.getByPlaceholder('Target name').fill('docs');
  await page.getByPlaceholder('apps/example').fill('apps/docs');
  await page.getByRole('button', { name: 'Add target' }).click();
  await expect(page.getByText('apps/docs')).toBeVisible();
  await page.getByRole('button', { name: 'Save map' }).click();

  await expect(page.getByRole('heading', { name: 'trading' })).toBeVisible();
  await page
    .getByPlaceholder('Describe the change and the behavior that should be verified.')
    .fill('Fix trading header');
  await page.getByRole('button', { name: 'Start isolated session' }).click();

  await expect(page.getByRole('heading', { name: 'Fix trading header' })).toBeVisible();
  const startInput = await page.evaluate(() => (window as any).__START_INPUT__);
  expect(startInput).toMatchObject({ targetId: 'target-trading' });
});

test('maps target flow coverage into an interactive workbench', async ({ page }) => {
  await page.addInitScript(
    ({ timestamp, approvedManifest }) => {
      const repository = {
        id: 'repo-1',
        path: '/fixtures/root',
        name: 'root',
        headSha: '0123456789abcdef',
        branch: 'main',
        dirty: false,
        compatible: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        policy: {
          repositoryId: 'repo-1',
          manifest: approvedManifest,
          fingerprint: 'approved',
          fingerprintPaths: ['bun.lock', 'package.json'],
          approvedAt: timestamp,
          valid: true,
        },
      };
      const target = {
        id: 'target-trading',
        repositoryId: 'repo-1',
        name: 'trading',
        path: 'apps/trading',
        kind: 'app',
        packageName: 'trading',
        scripts: { dev: 'vite dev', build: 'vite build', 'test:e2e': 'playwright test' },
        source: 'detected',
        selected: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const coverageSummary = (behavior: string) => ({
        status: 'covered',
        required: 1,
        covered: 1,
        missing: 0,
        optional: 0,
        scenarios: [
          {
            scenarioId: 'login-e2e',
            title: 'Cover login',
            behavior,
            required: true,
            covered: true,
          },
        ],
      });
      const evidence = {
        scenarioId: 'login-e2e',
        sessionId: 'session-verified',
        artifactId: 'artifact-dashboard',
        kind: 'screenshot',
        label: 'Signed-in dashboard',
        path: '/app-data/sessions/session-verified/dashboard.png',
        createdAt: timestamp,
        verifiedAt: timestamp,
      };

      window.__CODE_TEST_INVOKE__ = async (command, args) => {
        if (command === 'list_repositories') return [repository];
        if (command === 'list_repository_targets') return [target];
        if (command === 'list_change_sessions') return [];
        if (command === 'get_target_flow_overview') {
          return {
            snapshot: {
              target,
              flows: [
                {
                  flowId: 'login',
                  name: 'Login',
                  goal: 'User signs in',
                  relativePath: '.flowguard/flows/login.json',
                  digest: 'sha256:login',
                  sourcePaths: ['apps/trading/src/Login.tsx'],
                  coverageScenarios: [
                    {
                      scenarioId: 'login-e2e',
                      flowId: 'login',
                      title: 'Cover login',
                      description: 'A user can sign in with valid credentials.',
                      gate: 'e2e',
                      relativePath: '.flowguard/coverage/login-e2e.json',
                      digest: 'sha256:coverage',
                      covers: [
                        {
                          kind: 'state',
                          id: 'start',
                          behavior: 'Login form is visible.',
                          required: true,
                          covered: true,
                        },
                        {
                          kind: 'transition',
                          id: 'submit',
                          behavior: 'Valid credentials submit successfully.',
                          required: true,
                          covered: true,
                        },
                      ],
                      expectedEvidence: [
                        { kind: 'screenshot', label: 'Signed-in dashboard', required: true },
                      ],
                      evidence: [evidence],
                      latestSession: {
                        sessionId: 'session-verified',
                        request: 'Implement login',
                        status: 'verified',
                        verifiedAt: timestamp,
                      },
                    },
                  ],
                  graph: {
                    issues: [],
                    nodes: [
                      {
                        id: 'state:start',
                        stateId: 'start',
                        label: 'Start',
                        kind: 'page',
                        route: '/login',
                        status: 'unchanged',
                        coverage: coverageSummary('Login form is visible.'),
                      },
                      {
                        id: 'state:done',
                        stateId: 'done',
                        label: 'Done',
                        kind: 'page',
                        status: 'unchanged',
                        coverage: coverageSummary('Signed-in dashboard is visible.'),
                      },
                    ],
                    edges: [
                      {
                        id: 'transition:submit',
                        transitionId: 'submit',
                        source: 'state:start',
                        target: 'state:done',
                        label: 'Submit valid credentials',
                        actor: 'user',
                        status: 'unchanged',
                        coverage: coverageSummary('Valid credentials submit successfully.'),
                      },
                    ],
                  },
                },
              ],
              unscopedFlows: [],
              proposals: [],
              invalidDocuments: [],
              generatedAt: timestamp,
            },
            timeline: [],
          };
        }
        if (command === 'read_artifact') {
          (window as any).__READ_ARTIFACT__ = (args as any).path;
          return 'data:image/png;base64,iVBORw0KGgo=';
        }
        if (command === 'reveal_artifact') {
          (window as any).__REVEALED_ARTIFACT__ = (args as any).path;
          return;
        }
        throw new Error(`Unhandled test command: ${command}`);
      };
    },
    { timestamp: now, approvedManifest: manifest() },
  );

  await page.goto('/repositories/repo-1/targets/target-trading');
  await page.getByRole('tab', { name: 'Flows' }).click();

  await expect(page.getByRole('heading', { name: 'Flows visualization' })).toBeVisible();
  await expect(page.getByText('Login', { exact: true })).toBeVisible();
  await expect(page.getByText('Submit valid credentials')).toBeVisible();
  await expect(page.getByText('Covered').first()).toBeVisible();

  await page.getByText('Start', { exact: true }).first().click();
  await expect(page.getByText('State start')).toBeVisible();
  await expect(page.getByText('Login form is visible.')).toBeVisible();
  await expect(page.getByText('Implement login - verified')).toBeVisible();

  await page.locator('.flow-edge-transition-submit').click({ force: true });
  await expect(page.getByText('Transition submit')).toBeVisible();
  await expect(page.getByText('Valid credentials submit successfully.')).toBeVisible();

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByAltText('Signed-in dashboard')).toBeVisible();
  const readArtifact = await page.evaluate(() => (window as any).__READ_ARTIFACT__);
  expect(readArtifact).toBe('/app-data/sessions/session-verified/dashboard.png');

  await page.getByRole('button', { name: 'Reveal' }).click();
  const revealedArtifact = await page.evaluate(() => (window as any).__REVEALED_ARTIFACT__);
  expect(revealedArtifact).toBe('/app-data/sessions/session-verified/dashboard.png');
});

test('shows distinct setup guidance when the local runtime is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    window.__CODE_TEST_INVOKE__ = async (command) => {
      if (command === 'engine_health') {
        return {
          available: false,
          authenticated: false,
          gitAvailable: true,
          dockerAvailable: false,
          appServerAvailable: false,
          browserToolsAvailable: false,
          detail: 'Docker is stopped. Start Docker Desktop, then check again.',
        };
      }
      if (command === 'list_repositories') return [];
      if (command === 'list_repository_targets') return [];
      if (command === 'list_change_sessions') return [];
      throw new Error(`Unhandled test command: ${command}`);
    };
  });

  await page.goto('/settings');
  await expect(page.getByText(/Docker is stopped/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Codex login' })).toBeVisible();
});

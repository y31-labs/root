import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  loadConfig,
  nativeSmokeCommand,
  PACKAGED_CODE_EXECUTABLE_RELATIVE_PATH,
  readReportWithChecksum,
  resolvePackagedCodeExecutable,
  sha256File,
  smokeChildEnvironment,
  validateSmokeReport,
  writeReportWithChecksum,
} from './lib.mjs';

const temporaryDirectories = [];
const commitSha = 'a'.repeat(40);
const imageId = `sha256:${'b'.repeat(64)}`;

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('Stage 8 smoke report', () => {
  test('resolves only the known packaged Code executable', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'code-mvp-smoke-repository-'));
    temporaryDirectories.push(repositoryRoot);
    const executablePath = join(repositoryRoot, PACKAGED_CODE_EXECUTABLE_RELATIVE_PATH);
    await mkdir(dirname(executablePath), { recursive: true });
    await writeFile(executablePath, '#!/bin/sh\n', { mode: 0o700 });
    await chmod(executablePath, 0o700);

    expect(
      await resolvePackagedCodeExecutable(repositoryRoot, { verifyDistribution: false }),
    ).toBe(
      await realpath(executablePath),
    );
  });

  test('rejects a missing packaged Code executable', async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), 'code-mvp-smoke-repository-'));
    temporaryDirectories.push(repositoryRoot);

    await expect(resolvePackagedCodeExecutable(repositoryRoot)).rejects.toThrow(
      'Packaged Code executable is missing',
    );
  });

  test('uses the native smoke flag and excludes unrelated environment values', () => {
    const environment = smokeChildEnvironment({
      HOME: '/Users/smoke',
      CODEX_HOME: '/Users/smoke/.codex',
      PATH: '/usr/bin:/bin',
      TMPDIR: '/tmp/smoke',
      LANG: 'en_US.UTF-8',
      CODE_MVP_SMOKE_DRIVER: '/tmp/arbitrary-driver',
      OPENAI_API_KEY: 'must-not-be-forwarded',
    });

    expect(environment).toEqual({
      HOME: '/Users/smoke',
      CODEX_HOME: '/Users/smoke/.codex',
      PATH: '/usr/bin:/bin',
      TMPDIR: '/tmp/smoke',
      LANG: 'en_US.UTF-8',
    });
    expect(
      nativeSmokeCommand('/Applications/Code.app/Contents/MacOS/code-desktop', [
        '--protocol',
        '1',
        '--cleanup',
      ]),
    ).toEqual([
      '/Applications/Code.app/Contents/MacOS/code-desktop',
      '--mvp-smoke',
      '--protocol',
      '1',
      '--cleanup',
    ]);
    expect(() => smokeChildEnvironment({ HOME: '/Users/smoke' })).toThrow(
      'PATH is required for the packaged Code smoke process',
    );
  });

  test('accepts a fresh complete report and verifies artifact bytes', async () => {
    const { report, reportDirectory, config } = await validFixture();
    const result = await validateSmokeReport(report, {
      config,
      expectedCommitSha: commitSha,
      expectedImageId: imageId,
      now: new Date('2026-06-13T12:00:00.000Z'),
      reportDirectory,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test('rejects privacy-bearing fields and modified artifact contents', async () => {
    const { report, reportDirectory, config } = await validFixture();
    report.prompt = 'not allowed';
    await writeFile(join(reportDirectory, report.artifacts[0].relativePath), 'modified evidence');
    const result = await validateSmokeReport(report, {
      config,
      expectedCommitSha: commitSha,
      expectedImageId: imageId,
      now: new Date('2026-06-13T12:00:00.000Z'),
      reportDirectory,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('report.prompt is not allowed');
    expect(result.errors).toContain('artifacts[0].sha256 does not match the artifact');
  });

  test('rejects artifacts reached through a symlinked report directory', async () => {
    const { report, reportDirectory, config } = await validFixture();
    const externalDirectory = await mkdtemp(join(tmpdir(), 'code-mvp-smoke-external-'));
    temporaryDirectories.push(externalDirectory);
    await writeFile(
      join(externalDirectory, report.artifacts[0].relativePath.split('/').at(-1)),
      'screenshot evidence',
    );
    await rm(join(reportDirectory, 'artifacts'), { recursive: true });
    await symlink(externalDirectory, join(reportDirectory, 'artifacts'));
    const result = await validateSmokeReport(report, {
      config,
      expectedCommitSha: commitSha,
      expectedImageId: imageId,
      now: new Date('2026-06-13T12:00:00.000Z'),
      reportDirectory,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'artifacts[0].relativePath escapes the real report directory',
    );
  });

  test('rejects stale identity, incomplete scenarios, and nonzero cleanup', async () => {
    const { report, reportDirectory, config } = await validFixture();
    report.completedAt = '2026-06-01T12:00:00.000Z';
    report.scenarios.pop();
    report.cleanup.remaining.labeledContainers = 1;
    const result = await validateSmokeReport(report, {
      config,
      expectedCommitSha: 'c'.repeat(40),
      expectedImageId: `sha256:${'d'.repeat(64)}`,
      now: new Date('2026-06-13T12:00:00.000Z'),
      reportDirectory,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith('commitSha must match'))).toBe(true);
    expect(result.errors.some((error) => error.startsWith('verifierImage.id must match'))).toBe(
      true,
    );
    expect(result.errors).toContain('report is older than 7 days');
    expect(result.errors).toContain('required scenario post-verification-edit is missing');
    expect(result.errors).toContain('cleanup.remaining.labeledContainers must be 0');
  });

  test('requires and verifies the report checksum sidecar', async () => {
    const { report, reportDirectory } = await validFixture();
    await writeReportWithChecksum(reportDirectory, report);
    expect(await readReportWithChecksum(reportDirectory)).toEqual(report);

    await writeFile(join(reportDirectory, 'report.json'), '{}\n');
    await expect(readReportWithChecksum(reportDirectory)).rejects.toThrow(
      'report.json.sha256 does not match report.json',
    );
  });
});

async function validFixture() {
  const config = await loadConfig();
  const reportDirectory = await mkdtemp(join(tmpdir(), 'code-mvp-smoke-'));
  temporaryDirectories.push(reportDirectory);
  const artifactDirectory = join(reportDirectory, 'artifacts');
  await mkdir(artifactDirectory);
  const artifactPath = join(artifactDirectory, 'browser-e2e-01.bin');
  await writeFile(artifactPath, 'screenshot evidence');
  const artifact = {
    id: 'browser-e2e-01',
    kind: 'screenshot',
    relativePath: 'artifacts/browser-e2e-01.bin',
    sha256: await sha256File(artifactPath),
    sizeBytes: Buffer.byteLength('screenshot evidence'),
  };
  const digest = createHash('sha256').update('verified worktree').digest('hex');
  const completedAt = '2026-06-13T11:00:00.000Z';
  const report = {
    schemaVersion: 1,
    producer: 'code-mvp-smoke-runner/1',
    commitSha,
    verifierImage: {
      reference: config.verifierImageReference,
      id: imageId,
    },
    startedAt: '2026-06-13T10:00:00.000Z',
    completedAt,
    privacy: {
      promptsIncluded: false,
      repositoryContentsIncluded: false,
      credentialsIncluded: false,
      secretValuesIncluded: false,
    },
    source: {
      cleanAtStart: true,
      unchanged: true,
    },
    scenarios: config.requiredScenarios.map((scenario) => {
      const terminalState = scenario.id === 'cancel-active-process' ? 'discarded' : 'accepted';
      return {
        id: scenario.id,
        status: 'passed',
        durationMs: 1_000,
        terminalState,
        verifiedDigest: terminalState === 'accepted' ? digest : null,
        acceptedDigest: terminalState === 'accepted' ? digest : null,
        checks: [
          ...scenario.requiredChecks,
          ...(terminalState === 'accepted' ? (scenario.acceptedChecks ?? []) : []),
        ],
        artifactIds: scenario.id === 'browser-e2e' ? [artifact.id] : [],
      };
    }),
    artifacts: [artifact],
    cleanup: {
      status: 'passed',
      durationMs: 100,
      remaining: {
        worktrees: 0,
        childProcesses: 0,
        labeledContainers: 0,
        temporaryBranches: 0,
      },
    },
  };
  return { report, reportDirectory, config };
}

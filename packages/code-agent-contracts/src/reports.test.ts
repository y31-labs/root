import { describe, expect, test } from 'bun:test';

import {
  buildEvidenceReport,
  evidenceReportVersion,
  parseEvidenceReport,
} from '@workspace/code-agent-contracts/reports';

const baseInput = {
  sessionId: 'session-1',
  repository: {
    name: 'demo-repo',
    path: '/Users/example/demo-repo',
    branch: 'main',
  },
  target: {
    name: 'checkout-app',
    path: 'apps/checkout',
    kind: 'app',
  },
  requestSummary: 'Fix the failing checkout total test.',
  baseCommit: 'abc123',
  acceptedBranch: 'code/fix-checkout-total-session-1',
  verification: {
    sessionId: 'session-1',
    worktreeDigest: 'digest-1',
    required: 4,
    passed: 4,
    failed: 0,
    missing: 0,
    hasDiff: true,
    verifiedAt: 1_000,
  },
  results: [
    {
      kind: 'diff',
      required: true,
      status: 'passed',
      attempt: 1,
      durationMs: 0,
      worktreeDigest: 'digest-1',
      artifactIds: [],
    },
    {
      kind: 'unit',
      required: true,
      status: 'passed',
      attempt: 1,
      durationMs: 2_000,
      exitCode: 0,
      worktreeDigest: 'digest-1',
      artifactIds: ['artifact-1'],
    },
  ],
  artifacts: [
    {
      id: 'artifact-1',
      sessionId: 'session-1',
      kind: 'commandLog',
      path: '/Users/example/app-data/sessions/session-1/artifacts/attempt-1-unit.log',
      label: 'unit attempt 1',
      createdAt: 900,
    },
  ],
  createdAt: 1_100,
  exportedAt: 1_200,
} as const;

describe('evidence report contract', () => {
  test('builds a v1 report with split gate and safety results', () => {
    const report = buildEvidenceReport(baseInput);

    expect(report.version).toBe(evidenceReportVersion);
    expect(report.sessionId).toBe('session-1');
    expect(report.repository).toEqual({
      name: 'demo-repo',
      path: '/Users/example/demo-repo',
      branch: 'main',
    });
    expect(report.target).toEqual({
      name: 'checkout-app',
      path: 'apps/checkout',
      kind: 'app',
    });
    expect(report.task.requestSummary).toBe('Fix the failing checkout total test.');
    expect(report.baseCommit).toBe('abc123');
    expect(report.acceptedBranch).toBe('code/fix-checkout-total-session-1');
    expect(report.gates).toHaveLength(1);
    expect(report.gates[0]).toMatchObject({ kind: 'unit', artifactIds: ['artifact-1'] });
    expect(report.safetyChecks).toHaveLength(1);
    expect(report.safetyChecks[0]).toMatchObject({ kind: 'diff' });
    expect(report.artifacts[0]).not.toHaveProperty('contents');
    expect(report.privacy.sourceContentsIncluded).toBe(false);
  });

  test('parses a report and rejects source contents or dangling artifact references', () => {
    const report = buildEvidenceReport(baseInput);

    expect(parseEvidenceReport(report)).toEqual(report);
    expect(() =>
      parseEvidenceReport({
        ...report,
        repository: { ...report.repository, sourceContents: 'const secret = true;' },
      }),
    ).toThrow('sourceContents is not supported');
    expect(() =>
      parseEvidenceReport({
        ...report,
        gates: [{ ...report.gates[0], artifactIds: ['missing-artifact'] }],
      }),
    ).toThrow('references unknown artifact missing-artifact');
  });
});

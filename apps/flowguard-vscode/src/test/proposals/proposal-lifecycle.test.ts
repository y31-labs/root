import { describe, expect, test } from 'bun:test';

import {
  digestFlowguardFlow,
  digestFlowProposal,
  digestFlowguardConfig,
  makeLoginFlowFixture,
  makePasswordResetProposalFixture,
  makeFlowguardConfigFixture,
  parseFlowguardFlowJson,
  type FlowguardFlow,
  type FlowProposal,
} from '@workspace/flowguard-contracts';

import {
  acceptFlowProposal,
  discoverPendingFlowProposals,
  rejectFlowProposal,
  type FlowProposalLifecycleHost,
  type FlowProposalWorkspaceEdit,
} from '#/extension/proposals';
import {
  FLOWGUARD_DIRECTORY,
  joinRepositoryUri,
  type FlowguardFlowDocumentSnapshot,
  type FlowguardRepositorySnapshot,
  type FlowguardWorkspaceSnapshot,
  type FlowProposalDocumentSnapshot,
  type WorkspaceRoot,
} from '#/extension/workspace';

describe('Flowguard proposal lifecycle', () => {
  test('discovers and validates pending proposal status against approved Flowguard contracts', async () => {
    const root = createRoot();
    const flow = makeLoginFlowFixture();
    const baseDigest = await digestFlowguardFlow(flow);
    const ready = makeProposal(baseDigest, '01JREADY', 'login', 'Ready proposal');
    const stale = makeProposal(`sha256:${'0'.repeat(64)}`, '01JSTALE', 'login', 'Stale proposal');
    const missingFlow = makeProposal(
      baseDigest,
      '01JMISSING',
      'unknown-flow',
      'Missing flow proposal',
    );
    const snapshot = await createSnapshot(root, {
      flows: [flow],
      proposals: [ready, stale, missingFlow],
    });

    const pending = await discoverPendingFlowProposals(snapshot);
    const statuses = new Map(
      pending.map((item) => [item.proposal.document.id, item.status] as const),
    );

    expect(statuses).toEqual(
      new Map([
        ['01JREADY', 'ready'],
        ['01JSTALE', 'stale'],
        ['01JMISSING', 'missing-flow'],
      ]),
    );
    expect(issueCodes(requirePending(pending, '01JSTALE'))).toContain('STALE_DIGEST');
    expect(issueCodes(requirePending(pending, '01JMISSING'))).toContain('BROKEN_REFERENCE');
  });

  test('accepts a current proposal by writing the approved Flowguard contract before deleting the proposal', async () => {
    const root = createRoot();
    const flow = makeLoginFlowFixture();
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(flow));
    const snapshot = await createSnapshot(root, { flows: [flow], proposals: [proposal] });
    const repository = requireRepository(snapshot);
    const flowDocument = requireFlow(repository, 'login');
    const proposalDocument = requireProposal(repository, '01JPROPOSAL');
    const host = new MemoryProposalHost();
    host.writeJson(flowDocument.uri, flow);
    host.writeJson(proposalDocument.uri, proposal);

    const result = await acceptFlowProposal({
      host,
      repository,
      proposal: proposalDocument,
    });

    expect(result.ok).toBe(true);
    expect(host.operations).toEqual([
      `read:${proposalDocument.uri}`,
      `read:${flowDocument.uri}`,
      'applyEdit',
      `delete:${proposalDocument.uri}`,
    ]);
    expect(host.hasFile(proposalDocument.uri)).toBe(false);
    expect(host.appliedEdits).toHaveLength(1);
    expect(host.appliedEdits[0]?.documentChanges[0]?.uri).toBe(flowDocument.uri);

    const approved = parseApprovedFlow(host.requireText(flowDocument.uri));
    expect(approved.states.map((state) => state.id)).toEqual([
      'login-form',
      'account-home',
      'password-reset',
    ]);
    expect(approved.transitions.map((transition) => transition.id)).toContain(
      'open-password-reset',
    );
  });

  test('refuses stale proposals after rereading the approved Flowguard contract from disk', async () => {
    const root = createRoot();
    const snapshotFlow = makeLoginFlowFixture();
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(snapshotFlow));
    const currentFlow = withExtraState(snapshotFlow);
    const snapshot = await createSnapshot(root, {
      flows: [snapshotFlow],
      proposals: [proposal],
    });
    const repository = requireRepository(snapshot);
    const flowDocument = requireFlow(repository, 'login');
    const proposalDocument = requireProposal(repository, '01JPROPOSAL');
    const host = new MemoryProposalHost();
    host.writeJson(flowDocument.uri, currentFlow);
    host.writeJson(proposalDocument.uri, proposal);

    const result = await acceptFlowProposal({
      host,
      repository,
      proposal: proposalDocument,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected stale proposal acceptance to fail.');
    expect(result.code).toBe('APPLICATION_REJECTED');
    expect(result.issues?.map((issue) => issue.code)).toContain('STALE_DIGEST');
    expect(host.appliedEdits).toHaveLength(0);
    expect(host.hasFile(proposalDocument.uri)).toBe(true);
    expect(
      parseApprovedFlow(host.requireText(flowDocument.uri)).states.map((state) => state.id),
    ).toContain('help-center');
  });

  test('preserves proposal state when the host rejects the approved Flowguard contract edit', async () => {
    const root = createRoot();
    const flow = makeLoginFlowFixture();
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(flow));
    const snapshot = await createSnapshot(root, { flows: [flow], proposals: [proposal] });
    const repository = requireRepository(snapshot);
    const flowDocument = requireFlow(repository, 'login');
    const proposalDocument = requireProposal(repository, '01JPROPOSAL');
    const host = new MemoryProposalHost();
    host.editResult = false;
    host.writeJson(flowDocument.uri, flow);
    host.writeJson(proposalDocument.uri, proposal);
    const originalFlowText = host.requireText(flowDocument.uri);

    const result = await acceptFlowProposal({
      host,
      repository,
      proposal: proposalDocument,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected host edit rejection to fail.');
    expect(result.code).toBe('FLOW_EDIT_FAILED');
    expect(host.appliedEdits).toHaveLength(1);
    expect(host.hasFile(proposalDocument.uri)).toBe(true);
    expect(host.requireText(flowDocument.uri)).toBe(originalFlowText);
    expect(host.operations).not.toContain(`delete:${proposalDocument.uri}`);
  });

  test('rejects proposals by deleting only the proposal file', async () => {
    const root = createRoot();
    const flow = makeLoginFlowFixture();
    const proposal = makePasswordResetProposalFixture(await digestFlowguardFlow(flow));
    const snapshot = await createSnapshot(root, { flows: [flow], proposals: [proposal] });
    const repository = requireRepository(snapshot);
    const flowDocument = requireFlow(repository, 'login');
    const proposalDocument = requireProposal(repository, '01JPROPOSAL');
    const host = new MemoryProposalHost();
    host.writeJson(flowDocument.uri, flow);
    host.writeJson(proposalDocument.uri, proposal);
    const originalFlowText = host.requireText(flowDocument.uri);

    const result = await rejectFlowProposal({
      host,
      proposal: proposalDocument,
    });

    expect(result.ok).toBe(true);
    expect(host.operations).toEqual([
      `read:${proposalDocument.uri}`,
      `delete:${proposalDocument.uri}`,
    ]);
    expect(host.hasFile(proposalDocument.uri)).toBe(false);
    expect(host.requireText(flowDocument.uri)).toBe(originalFlowText);
    expect(host.appliedEdits).toHaveLength(0);
  });
});

const makeProposal = (
  baseDigest: FlowProposal['baseDigest'],
  id: string,
  flowId: string,
  summary: string,
): FlowProposal => {
  return {
    ...makePasswordResetProposalFixture(baseDigest),
    id,
    flowId,
    summary,
  };
};

const withExtraState = (flow: FlowguardFlow): FlowguardFlow => {
  return {
    ...flow,
    states: [
      ...flow.states,
      {
        id: 'help-center',
        name: 'Help center',
        kind: 'page',
        route: '/help',
      },
    ],
  };
};

const createRoot = (): WorkspaceRoot => {
  return { uri: 'file:///repo', name: 'repo', index: 0 };
};

const createSnapshot = async (
  root: WorkspaceRoot,
  options: {
    readonly flows: readonly FlowguardFlow[];
    readonly proposals: readonly FlowProposal[];
  },
): Promise<FlowguardWorkspaceSnapshot> => {
  const config = makeFlowguardConfigFixture();

  return {
    version: 1,
    sequence: 1,
    generatedAt: '2026-06-20T00:00:00.000Z',
    repositories: [
      {
        root,
        config: {
          kind: 'config',
          root,
          uri: joinRepositoryUri(root.uri, FLOWGUARD_DIRECTORY, 'config.json'),
          relativePath: `${FLOWGUARD_DIRECTORY}/config.json`,
          source: 'default',
          valid: true,
          activeConfig: config,
          digest: await digestFlowguardConfig(config),
          issues: [],
        },
        flows: await Promise.all(options.flows.map((flow) => createFlowDocument(root, flow))),
        proposals: await Promise.all(
          options.proposals.map((proposal) => createProposalDocument(root, proposal)),
        ),
        coverage: [],
        invalidDocuments: [],
        diagnosticDocuments: [],
        watchPatterns: [],
      },
    ],
  };
};

const createFlowDocument = async (
  root: WorkspaceRoot,
  flow: FlowguardFlow,
): Promise<FlowguardFlowDocumentSnapshot> => {
  const relativePath = `${FLOWGUARD_DIRECTORY}/flows/${flow.id}.json`;

  return {
    kind: 'flow',
    root,
    uri: joinRepositoryUri(root.uri, relativePath),
    relativePath,
    valid: true,
    document: flow,
    digest: await digestFlowguardFlow(flow),
    issues: [],
  };
};

const createProposalDocument = async (
  root: WorkspaceRoot,
  proposal: FlowProposal,
): Promise<FlowProposalDocumentSnapshot> => {
  const relativePath = `${FLOWGUARD_DIRECTORY}/proposals/${proposal.id}.json`;

  return {
    kind: 'proposal',
    root,
    uri: joinRepositoryUri(root.uri, relativePath),
    relativePath,
    valid: true,
    document: proposal,
    digest: await digestFlowProposal(proposal),
    issues: [],
  };
};

const requireRepository = (snapshot: FlowguardWorkspaceSnapshot): FlowguardRepositorySnapshot => {
  const repository = snapshot.repositories[0];
  if (repository === undefined) throw new Error('Expected repository snapshot.');
  return repository;
};

const requireFlow = (
  repository: FlowguardRepositorySnapshot,
  flowId: string,
): FlowguardFlowDocumentSnapshot => {
  const flow = repository.flows.find((item) => item.document.id === flowId);
  if (flow === undefined) throw new Error(`Expected flow ${flowId}.`);
  return flow;
};

const requireProposal = (
  repository: FlowguardRepositorySnapshot,
  proposalId: string,
): FlowProposalDocumentSnapshot => {
  const proposal = repository.proposals.find((item) => item.document.id === proposalId);
  if (proposal === undefined) throw new Error(`Expected proposal ${proposalId}.`);
  return proposal;
};

const requirePending = (
  pending: Awaited<ReturnType<typeof discoverPendingFlowProposals>>,
  proposalId: string,
) => {
  const match = pending.find((item) => item.proposal.document.id === proposalId);
  if (match === undefined) throw new Error(`Expected pending proposal ${proposalId}.`);
  return match;
};

const issueCodes = (pending: ReturnType<typeof requirePending>): readonly string[] => {
  return pending.issues.map((issue) => issue.code);
};

const parseApprovedFlow = (text: string): FlowguardFlow => {
  const parsed = parseFlowguardFlowJson(text);
  if (!parsed.ok) {
    throw new Error(
      `Expected approved Flowguard contract JSON to parse: ${parsed.issues[0]?.message}`,
    );
  }

  return parsed.value;
};

class MemoryProposalHost implements FlowProposalLifecycleHost {
  readonly files = new Map<string, string>();
  readonly operations: string[] = [];
  readonly appliedEdits: FlowProposalWorkspaceEdit[] = [];
  editResult = true;

  writeJson(uri: string, value: unknown): void {
    this.files.set(uri, `${JSON.stringify(value, null, 2)}\n`);
  }

  hasFile(uri: string): boolean {
    return this.files.has(uri);
  }

  requireText(uri: string): string {
    const text = this.files.get(uri);
    if (text === undefined) throw new Error(`Expected file ${uri}.`);
    return text;
  }

  async readFile(uri: string): Promise<string> {
    this.operations.push(`read:${uri}`);
    return this.requireText(uri);
  }

  async applyEdit(edit: FlowProposalWorkspaceEdit): Promise<boolean> {
    this.operations.push('applyEdit');
    this.appliedEdits.push(edit);
    if (!this.editResult) return false;

    for (const change of edit.documentChanges) {
      this.files.set(change.uri, change.text);
    }

    return true;
  }

  async deleteFile(uri: string): Promise<void> {
    this.operations.push(`delete:${uri}`);
    if (!this.files.delete(uri)) {
      throw new Error(`Missing file ${uri}.`);
    }
  }
}

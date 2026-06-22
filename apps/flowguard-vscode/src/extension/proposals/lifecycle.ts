import {
  applyFlowProposal,
  errorIssue,
  hasIssueErrors,
  parseFlowguardFlowJson,
  parseFlowProposalJson,
  serializeCanonicalJson,
  type ApplyFlowProposalFailure,
  type ApplyFlowProposalSuccess,
  type CanonicalDigest,
  type FlowProposal,
  type SemanticIssue,
} from '@workspace/flowguard-contracts';

import { errorText } from '#/extension/services/errors';
import type {
  FlowguardFlowDocumentSnapshot,
  FlowguardRepositorySnapshot,
  FlowguardWorkspaceSnapshot,
  FlowProposalDocumentSnapshot,
} from '#/extension/workspace';

export type PendingFlowProposalStatus = 'ready' | 'stale' | 'conflict' | 'missing-flow';

export interface PendingFlowProposal {
  readonly repository: FlowguardRepositorySnapshot;
  readonly proposal: FlowProposalDocumentSnapshot;
  readonly flow?: FlowguardFlowDocumentSnapshot;
  readonly status: PendingFlowProposalStatus;
  readonly issues: readonly SemanticIssue[];
  readonly digest?: CanonicalDigest;
}

export interface FlowProposalLifecycleHost {
  readFile(uri: string): Promise<string>;
  applyEdit(edit: FlowProposalWorkspaceEdit): Promise<boolean>;
  deleteFile(uri: string): Promise<void>;
}

export interface FlowProposalWorkspaceEdit {
  readonly documentChanges: readonly FlowProposalTextDocumentEdit[];
}

export interface FlowProposalTextDocumentEdit {
  readonly kind: 'replace-document';
  readonly uri: string;
  readonly text: string;
}

export interface AcceptFlowProposalOptions {
  readonly host: FlowProposalLifecycleHost;
  readonly repository: FlowguardRepositorySnapshot;
  readonly proposal: FlowProposalDocumentSnapshot;
  readonly flow?: FlowguardFlowDocumentSnapshot;
}

export type AcceptFlowProposalResult =
  | {
      readonly ok: true;
      readonly proposalUri: string;
      readonly flowUri: string;
      readonly digest: CanonicalDigest;
      readonly issues: readonly SemanticIssue[];
    }
  | FlowProposalLifecycleFailure;

export interface RejectFlowProposalOptions {
  readonly host: Pick<FlowProposalLifecycleHost, 'readFile' | 'deleteFile'>;
  readonly proposal: FlowProposalDocumentSnapshot;
}

export type RejectFlowProposalResult =
  | {
      readonly ok: true;
      readonly proposalUri: string;
    }
  | FlowProposalLifecycleFailure;

export interface FlowProposalLifecycleFailure {
  readonly ok: false;
  readonly code: FlowProposalLifecycleFailureCode;
  readonly message: string;
  readonly issues?: readonly SemanticIssue[];
}

export type FlowProposalLifecycleFailureCode =
  | 'FLOW_NOT_FOUND'
  | 'READ_FAILED'
  | 'PROPOSAL_INVALID'
  | 'FLOW_INVALID'
  | 'PROPOSAL_CHANGED'
  | 'APPLICATION_REJECTED'
  | 'FLOW_EDIT_FAILED'
  | 'PROPOSAL_DELETE_FAILED';

export const discoverPendingFlowProposals = (
  snapshot: FlowguardWorkspaceSnapshot,
): Promise<readonly PendingFlowProposal[]> => {
  const pending = snapshot.repositories.flatMap((repository) =>
    repository.proposals.map((proposal) => validatePendingProposal(repository, proposal)),
  );

  return Promise.all(pending);
};

export const acceptFlowProposal = async (
  options: AcceptFlowProposalOptions,
): Promise<AcceptFlowProposalResult> => {
  const flow = options.flow ?? resolveApprovedFlow(options.repository, options.proposal.document);
  if (flow === undefined) {
    return {
      ok: false,
      code: 'FLOW_NOT_FOUND',
      message: `No approved Flowguard contract was found for proposal "${options.proposal.document.id}".`,
      issues: [missingFlowIssue(options.proposal.document.flowId)],
    };
  }

  const currentProposal = await readCurrentProposal(options.host, options.proposal);
  if (!currentProposal.ok) return currentProposal;

  const currentFlow = await readCurrentFlow(options.host, flow);
  if (!currentFlow.ok) return currentFlow;

  const applied = await applyFlowProposal(currentFlow.flow, currentProposal.proposal);
  if (!applied.ok) {
    return applicationRejected(applied);
  }

  const edit = createAcceptedFlowWorkspaceEdit(flow.uri, applied.flow);
  const editApplied = await applyHostEdit(options.host, edit);
  if (!editApplied.ok) return editApplied;

  const deleted = await deleteProposalFile(options.host, options.proposal.uri);
  if (!deleted.ok) return deleted;

  return {
    ok: true,
    proposalUri: options.proposal.uri,
    flowUri: flow.uri,
    digest: applied.digest,
    issues: applied.issues,
  };
};

export const rejectFlowProposal = async (
  options: RejectFlowProposalOptions,
): Promise<RejectFlowProposalResult> => {
  const currentProposal = await readCurrentProposal(options.host, options.proposal);
  if (!currentProposal.ok) return currentProposal;

  const deleted = await deleteProposalFile(options.host, options.proposal.uri);
  if (!deleted.ok) return deleted;

  return {
    ok: true,
    proposalUri: options.proposal.uri,
  };
};

export const createAcceptedFlowWorkspaceEdit = (
  uri: string,
  flow: ApplyFlowProposalSuccess['flow'],
): FlowProposalWorkspaceEdit => {
  return {
    documentChanges: [
      {
        kind: 'replace-document',
        uri,
        text: `${serializeCanonicalJson(flow)}\n`,
      },
    ],
  };
};

const validatePendingProposal = async (
  repository: FlowguardRepositorySnapshot,
  proposal: FlowProposalDocumentSnapshot,
): Promise<PendingFlowProposal> => {
  const flow = resolveApprovedFlow(repository, proposal.document);
  if (flow === undefined) {
    return {
      repository,
      proposal,
      status: 'missing-flow',
      issues: [missingFlowIssue(proposal.document.flowId)],
    };
  }

  const applied = await applyFlowProposal(flow.document, proposal.document);
  if (applied.ok) {
    return {
      repository,
      proposal,
      flow,
      status: 'ready',
      issues: applied.issues,
      digest: applied.digest,
    };
  }

  return {
    repository,
    proposal,
    flow,
    status: statusFromApplicationIssues(applied.issues),
    issues: applied.issues,
  };
};

const resolveApprovedFlow = (
  repository: FlowguardRepositorySnapshot,
  proposal: FlowProposal,
): FlowguardFlowDocumentSnapshot | undefined => {
  return repository.flows.find((flow) => flow.document.id === proposal.flowId);
};

const readCurrentProposal = async (
  host: Pick<FlowProposalLifecycleHost, 'readFile'>,
  proposal: FlowProposalDocumentSnapshot,
): Promise<
  | {
      readonly ok: true;
      readonly proposal: FlowProposal;
      readonly issues: readonly SemanticIssue[];
    }
  | FlowProposalLifecycleFailure
> => {
  const text = await readFile(host, proposal.uri);
  if (!text.ok) return text;

  const parsed = parseFlowProposalJson(text.text);
  if (!parsed.ok || hasIssueErrors(parsed.issues)) {
    return {
      ok: false,
      code: 'PROPOSAL_INVALID',
      message: `Proposal "${proposal.relativePath}" is no longer valid.`,
      issues: parsed.issues,
    };
  }

  if (parsed.value.id !== proposal.document.id) {
    return {
      ok: false,
      code: 'PROPOSAL_CHANGED',
      message: `Proposal "${proposal.relativePath}" changed identity before the decision could be applied.`,
      issues: [
        errorIssue('INVALID_VALUE', '$.id', 'Proposal id changed before decision.', {
          expected: proposal.document.id,
          actual: parsed.value.id,
        }),
      ],
    };
  }

  return { ok: true, proposal: parsed.value, issues: parsed.issues };
};

const readCurrentFlow = async (
  host: Pick<FlowProposalLifecycleHost, 'readFile'>,
  flow: FlowguardFlowDocumentSnapshot,
): Promise<
  | {
      readonly ok: true;
      readonly flow: FlowguardFlowDocumentSnapshot['document'];
      readonly issues: readonly SemanticIssue[];
    }
  | FlowProposalLifecycleFailure
> => {
  const text = await readFile(host, flow.uri);
  if (!text.ok) return text;

  const parsed = parseFlowguardFlowJson(text.text);
  if (!parsed.ok || hasIssueErrors(parsed.issues)) {
    return {
      ok: false,
      code: 'FLOW_INVALID',
      message: `Approved Flowguard contract "${flow.relativePath}" is no longer valid.`,
      issues: parsed.issues,
    };
  }

  if (parsed.value.id !== flow.document.id) {
    return {
      ok: false,
      code: 'FLOW_INVALID',
      message: `Approved Flowguard contract "${flow.relativePath}" changed identity before the proposal could be applied.`,
      issues: [
        errorIssue(
          'INVALID_VALUE',
          '$.id',
          'Approved Flowguard contract id changed before proposal application.',
          {
            expected: flow.document.id,
            actual: parsed.value.id,
          },
        ),
      ],
    };
  }

  return { ok: true, flow: parsed.value, issues: parsed.issues };
};

const readFile = async (
  host: Pick<FlowProposalLifecycleHost, 'readFile'>,
  uri: string,
): Promise<{ readonly ok: true; readonly text: string } | FlowProposalLifecycleFailure> => {
  try {
    return { ok: true, text: await host.readFile(uri) };
  } catch (caught) {
    return {
      ok: false,
      code: 'READ_FAILED',
      message: `Could not read Flowguard contract "${uri}": ${errorText(caught)}`,
    };
  }
};

const applyHostEdit = async (
  host: Pick<FlowProposalLifecycleHost, 'applyEdit'>,
  edit: FlowProposalWorkspaceEdit,
): Promise<{ readonly ok: true } | FlowProposalLifecycleFailure> => {
  try {
    const applied = await host.applyEdit(edit);
    if (applied) return { ok: true };
  } catch (caught) {
    return {
      ok: false,
      code: 'FLOW_EDIT_FAILED',
      message: `Could not write accepted Flowguard flow changes: ${errorText(caught)}`,
    };
  }

  return {
    ok: false,
    code: 'FLOW_EDIT_FAILED',
    message: 'The host rejected the accepted Flowguard flow edit.',
  };
};

const deleteProposalFile = async (
  host: Pick<FlowProposalLifecycleHost, 'deleteFile'>,
  uri: string,
): Promise<{ readonly ok: true } | FlowProposalLifecycleFailure> => {
  try {
    await host.deleteFile(uri);
    return { ok: true };
  } catch (caught) {
    return {
      ok: false,
      code: 'PROPOSAL_DELETE_FAILED',
      message: `Could not delete proposal "${uri}": ${errorText(caught)}`,
    };
  }
};

const applicationRejected = (result: ApplyFlowProposalFailure): FlowProposalLifecycleFailure => {
  return {
    ok: false,
    code: 'APPLICATION_REJECTED',
    message: 'The proposal does not apply to the current approved Flowguard contract.',
    issues: result.issues,
  };
};

const statusFromApplicationIssues = (
  issues: readonly SemanticIssue[],
): PendingFlowProposalStatus => {
  if (issues.some((issue) => issue.code === 'STALE_DIGEST')) return 'stale';
  return 'conflict';
};

const missingFlowIssue = (flowId: string): SemanticIssue => {
  return errorIssue(
    'BROKEN_REFERENCE',
    '$.flowId',
    `Approved Flowguard contract "${flowId}" was not found.`,
    {
      flowId,
    },
  );
};

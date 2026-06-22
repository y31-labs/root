import type {
  FlowguardCommandEnvironment,
  FlowguardCommandSelection,
} from '#/extension/commands/types';
import { FLOWGUARD_COMMANDS } from '#/extension/services/constants';
import type { FlowguardCommandId } from '#/extension/services/constants';
import { errorText } from '#/extension/services/errors';
import type { FlowguardTreeItem } from '#/extension/tree';
import type {
  FlowguardFlowDocumentSnapshot,
  FlowguardWorkspaceSnapshot,
  FlowProposalDocumentSnapshot,
  WorkspaceRoot,
} from '#/extension/workspace';

export type FlowguardCommandHandler = (selection?: FlowguardCommandSelection) => Promise<void>;

export type FlowguardCommandHandlers = Pick<
  Record<FlowguardCommandId, FlowguardCommandHandler>,
  | typeof FLOWGUARD_COMMANDS.initializeRepository
  | typeof FLOWGUARD_COMMANDS.refresh
  | typeof FLOWGUARD_COMMANDS.openFlow
  | typeof FLOWGUARD_COMMANDS.reviewProposal
>;

export const createFlowguardCommandHandlers = (
  environment: FlowguardCommandEnvironment,
): FlowguardCommandHandlers => {
  return {
    [FLOWGUARD_COMMANDS.initializeRepository]: (selection) =>
      initializeRepository(environment, selection),
    [FLOWGUARD_COMMANDS.refresh]: () => refreshWorkspace(environment),
    [FLOWGUARD_COMMANDS.openFlow]: (selection) => openFlow(environment, selection),
    [FLOWGUARD_COMMANDS.reviewProposal]: (selection) => reviewProposal(environment, selection),
  };
};

export const initializeRepository = async (
  environment: FlowguardCommandEnvironment,
  selection?: FlowguardCommandSelection,
): Promise<void> => {
  const root = resolveRepositoryRoot(environment, selection);

  if (!root.ok) {
    await showError(environment, root.message);
    return;
  }

  if (environment.initializer === undefined) {
    await showError(
      environment,
      'Repository initialization is not wired in this host. Create .flowguard/config.json, .flowguard/flows, and .flowguard/proposals manually, then run Flowguard: Refresh.',
    );
    return;
  }

  try {
    const result = await environment.initializer.initializeRepository(root.value);
    await environment.workspace.refresh();
    await environment.presenter.showInformationMessage(
      result.message ?? `Initialized Flowguard in ${root.value.name}.`,
    );
  } catch (caught) {
    await showError(
      environment,
      `Could not initialize Flowguard in ${root.value.name}: ${errorText(caught)}`,
    );
  }
};

export const refreshWorkspace = async (environment: FlowguardCommandEnvironment): Promise<void> => {
  try {
    const snapshot = await environment.workspace.refresh();
    await environment.presenter.showInformationMessage(formatRefreshMessage(snapshot));
  } catch (caught) {
    await showError(environment, `Could not refresh Flowguard: ${errorText(caught)}`);
  }
};

export const openFlow = async (
  environment: FlowguardCommandEnvironment,
  selection?: FlowguardCommandSelection,
): Promise<void> => {
  const snapshot = await snapshotForCommand(environment, 'opening a flow');
  if (snapshot === undefined) return;

  const resolved = resolveFlow(snapshot, selection);
  if (!resolved.ok) {
    await showError(environment, resolved.message);
    return;
  }

  if (environment.opener === undefined) {
    await showError(
      environment,
      'Open Flow is not wired to an editor in this host. Open the flow JSON file from .flowguard/flows manually.',
    );
    return;
  }

  await environment.opener.openDocument(resolved.value.uri);
};

export const reviewProposal = async (
  environment: FlowguardCommandEnvironment,
  selection?: FlowguardCommandSelection,
): Promise<void> => {
  const snapshot = await snapshotForCommand(environment, 'reviewing a proposal');
  if (snapshot === undefined) return;

  const resolved = resolveProposal(snapshot, selection);
  if (!resolved.ok) {
    await showError(environment, resolved.message);
    return;
  }

  if (environment.opener === undefined) {
    await showError(
      environment,
      'Review Proposal is not wired to an editor in this host. Open the proposal JSON file from .flowguard/proposals manually.',
    );
    return;
  }

  await environment.opener.openDocument(resolved.value.uri);
};

const snapshotForCommand = async (
  environment: FlowguardCommandEnvironment,
  action: string,
): Promise<FlowguardWorkspaceSnapshot | undefined> => {
  const snapshot = environment.workspace.getSnapshot();
  if (snapshot !== undefined) return snapshot;

  try {
    return await environment.workspace.refresh();
  } catch (caught) {
    await showError(
      environment,
      `Could not refresh Flowguard before ${action}: ${errorText(caught)}`,
    );
    return undefined;
  }
};

const resolveRepositoryRoot = (
  environment: FlowguardCommandEnvironment,
  selection: FlowguardCommandSelection | undefined,
): Result<WorkspaceRoot> => {
  const selectedRootUri = selectionRootUri(selection);
  const snapshot = environment.workspace.getSnapshot();
  const roots =
    snapshot?.repositories.map((repository) => repository.root) ??
    environment.workspace.getWorkspaceRoots() ??
    [];

  if (roots.length === 0) {
    return {
      ok: false,
      message: 'Open a workspace before initializing Flowguard.',
    };
  }

  if (selectedRootUri !== undefined) {
    const selectedRoot = roots.find((root) => root.uri === selectedRootUri);
    if (selectedRoot !== undefined) return { ok: true, value: selectedRoot };

    return {
      ok: false,
      message: `The selected repository is not available: ${selectedRootUri}. Refresh Flowguard and try again.`,
    };
  }

  if (roots.length === 1) return { ok: true, value: roots[0] };

  return {
    ok: false,
    message:
      'Select a repository in the Flowguard view before initializing Flowguard in a multi-root workspace.',
  };
};

const resolveFlow = (
  snapshot: FlowguardWorkspaceSnapshot,
  selection: FlowguardCommandSelection | undefined,
): Result<FlowguardFlowDocumentSnapshot> => {
  const invalidSelection = invalidDocumentSelection(selection);
  if (invalidSelection !== undefined) {
    return {
      ok: false,
      message: `Cannot open invalid Flowguard contract ${invalidSelection}. Fix the diagnostics first.`,
    };
  }

  const flows = snapshot.repositories.flatMap((repository) => repository.flows);
  if (flows.length === 0) {
    return {
      ok: false,
      message:
        'No valid Flowguard contract files were found. Add a JSON file under .flowguard/flows or run Flowguard: Initialize Repository.',
    };
  }

  const selectedUri = selectionUri(selection);
  const selectedFlowId = selectionFlowId(selection);
  const selectedRootUri = selectionRootUri(selection);
  const exactMatch = flows.find((flow) =>
    matchesFlowSelection(flow, selectedUri, selectedFlowId, selectedRootUri),
  );
  if (exactMatch !== undefined) return { ok: true, value: exactMatch };

  if (selectedUri !== undefined || selectedFlowId !== undefined) {
    return {
      ok: false,
      message:
        'The selected flow is not available in the current Flowguard snapshot. Refresh Flowguard and select a valid flow.',
    };
  }

  if (flows.length === 1) return { ok: true, value: flows[0] };

  return {
    ok: false,
    message: 'Select a flow in the Flowguard view before running Flowguard: Open Flow.',
  };
};

const resolveProposal = (
  snapshot: FlowguardWorkspaceSnapshot,
  selection: FlowguardCommandSelection | undefined,
): Result<FlowProposalDocumentSnapshot> => {
  const invalidSelection = invalidDocumentSelection(selection);
  if (invalidSelection !== undefined) {
    return {
      ok: false,
      message: `Cannot review invalid Flowguard proposal ${invalidSelection}. Fix the diagnostics first.`,
    };
  }

  const proposals = snapshot.repositories.flatMap((repository) => repository.proposals);
  if (proposals.length === 0) {
    return {
      ok: false,
      message: 'No pending Flowguard proposals were found under .flowguard/proposals.',
    };
  }

  const selectedUri = selectionUri(selection);
  const selectedProposalId = selectionProposalId(selection);
  const selectedRootUri = selectionRootUri(selection);
  const proposalMatch = proposals.find((proposal) =>
    matchesProposalSelection(proposal, selectedUri, selectedProposalId, selectedRootUri),
  );
  if (proposalMatch !== undefined) return { ok: true, value: proposalMatch };

  const selectedFlowId = selectionFlowId(selection);
  if (selectedFlowId !== undefined) {
    const flowProposals = proposals.filter(
      (proposal) =>
        proposal.document.flowId === selectedFlowId &&
        (selectedRootUri === undefined || proposal.root.uri === selectedRootUri),
    );

    if (flowProposals.length === 1) return { ok: true, value: flowProposals[0] };

    if (flowProposals.length > 1) {
      return {
        ok: false,
        message: `Select a proposal in the Flowguard Proposals view. ${flowProposals.length} proposals target flow "${selectedFlowId}".`,
      };
    }

    return {
      ok: false,
      message: `No pending proposal targets flow "${selectedFlowId}".`,
    };
  }

  if (selectedUri !== undefined || selectedProposalId !== undefined) {
    return {
      ok: false,
      message:
        'The selected proposal is not available in the current Flowguard snapshot. Refresh Flowguard and select a pending proposal.',
    };
  }

  if (proposals.length === 1) return { ok: true, value: proposals[0] };

  return {
    ok: false,
    message:
      'Select a proposal in the Flowguard Proposals view before running Flowguard: Review Proposal.',
  };
};

const matchesFlowSelection = (
  flow: FlowguardFlowDocumentSnapshot,
  uri: string | undefined,
  flowId: string | undefined,
  rootUri: string | undefined,
): boolean => {
  if (uri !== undefined) return flow.uri === uri;
  if (flowId === undefined) return false;
  return flow.document.id === flowId && (rootUri === undefined || flow.root.uri === rootUri);
};

const matchesProposalSelection = (
  proposal: FlowProposalDocumentSnapshot,
  uri: string | undefined,
  proposalId: string | undefined,
  rootUri: string | undefined,
): boolean => {
  if (uri !== undefined) return proposal.uri === uri;
  if (proposalId === undefined) return false;
  return (
    proposal.document.id === proposalId && (rootUri === undefined || proposal.root.uri === rootUri)
  );
};

const formatRefreshMessage = (snapshot: FlowguardWorkspaceSnapshot): string => {
  const counts = snapshot.repositories.reduce(
    (total, repository) => ({
      flows: total.flows + repository.flows.length,
      proposals: total.proposals + repository.proposals.length,
      invalidDocuments: total.invalidDocuments + repository.invalidDocuments.length,
    }),
    { flows: 0, proposals: 0, invalidDocuments: 0 },
  );

  if (snapshot.repositories.length === 0) {
    return 'Flowguard refreshed. Open a workspace to discover flows.';
  }

  return `Flowguard refreshed: ${formatCount(counts.flows, 'flow')}, ${formatCount(
    counts.proposals,
    'proposal',
  )}, ${formatCount(counts.invalidDocuments, 'invalid document')}.`;
};

const formatCount = (count: number, singular: string): string => {
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
};

const selectionRootUri = (selection: FlowguardCommandSelection | undefined): string | undefined => {
  if (selection === undefined) return undefined;
  if (isTreeItem(selection)) return selection.root?.uri;
  return selection.rootUri;
};

const selectionUri = (selection: FlowguardCommandSelection | undefined): string | undefined => {
  if (selection === undefined) return undefined;
  return selection.uri;
};

const selectionFlowId = (selection: FlowguardCommandSelection | undefined): string | undefined => {
  if (selection === undefined) return undefined;
  return selection.flowId;
};

const selectionProposalId = (
  selection: FlowguardCommandSelection | undefined,
): string | undefined => {
  if (selection === undefined) return undefined;
  if (isTreeItem(selection) && selection.kind !== 'proposal') return undefined;
  return selection.proposalId;
};

const invalidDocumentSelection = (
  selection: FlowguardCommandSelection | undefined,
): string | undefined => {
  if (!isTreeItem(selection)) return undefined;
  if (selection.kind !== 'invalid-document') return undefined;
  return selection.relativePath ?? selection.label;
};

const isTreeItem = (
  selection: FlowguardCommandSelection | undefined,
): selection is FlowguardTreeItem => {
  if (selection === undefined) return false;
  return 'kind' in selection && 'contextValue' in selection && 'label' in selection;
};

const showError = async (
  environment: FlowguardCommandEnvironment,
  message: string,
): Promise<void> => {
  if (environment.presenter.showErrorMessage !== undefined) {
    await environment.presenter.showErrorMessage(message);
    return;
  }

  await environment.presenter.showInformationMessage(message);
};

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

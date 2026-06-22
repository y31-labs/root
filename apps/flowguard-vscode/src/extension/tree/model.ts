import { calculateFlowImpact } from '@workspace/flowguard-engine';

import { FLOWGUARD_TREE_CONTEXT_VALUES } from '#/extension/tree/context-values';
import type { FlowguardTreeContextValue } from '#/extension/tree/context-values';
import type {
  FlowguardFlowDocumentSnapshot,
  FlowguardRepositorySnapshot,
  FlowguardWorkspaceSnapshot,
  FlowProposalDocumentSnapshot,
  InvalidFlowguardDocumentSnapshot,
  WorkspaceRoot,
} from '#/extension/workspace';

export type FlowguardTreeItemKind = 'empty' | 'flow' | 'invalid-document' | 'proposal';

export interface FlowguardTreeItem {
  readonly id: string;
  readonly kind: FlowguardTreeItemKind;
  readonly label: string;
  readonly description?: string;
  readonly contextValue: FlowguardTreeContextValue;
  readonly root?: WorkspaceRoot;
  readonly uri?: string;
  readonly relativePath?: string;
  readonly flowId?: string;
  readonly proposalId?: string;
  readonly issueCount?: number;
}

export interface FlowTreeOptions {
  readonly changedPaths?: readonly string[];
}

export const createFlowTreeItems = (
  snapshot: FlowguardWorkspaceSnapshot | undefined,
  options: FlowTreeOptions = {},
): readonly FlowguardTreeItem[] => {
  if (snapshot === undefined) {
    return [
      emptyItem(
        'flowguard:flows:not-loaded',
        'Refresh Flowguard to discover repository flow files',
      ),
    ];
  }

  if (snapshot.repositories.length === 0) {
    return [
      {
        ...emptyItem('flowguard:flows:no-workspace', 'Open a workspace to use Flowguard'),
        contextValue: FLOWGUARD_TREE_CONTEXT_VALUES.workspaceMissing,
      },
    ];
  }

  const flowItems = snapshot.repositories.flatMap((repository) =>
    repository.flows.map((flow) => createFlowTreeItem(repository, flow, snapshot, options)),
  );
  const invalidItems = snapshot.repositories.flatMap((repository) =>
    repository.invalidDocuments
      .filter((document) => document.kind !== 'proposal')
      .map((document) => createInvalidDocumentItem(repository, document, 'flow')),
  );
  const items = [...flowItems, ...invalidItems].sort(compareTreeItems);

  if (items.length === 0) {
    return [
      emptyItem(
        'flowguard:flows:empty',
        'No Flowguard contract files found under .flowguard/flows',
      ),
    ];
  }

  return items;
};

export const createProposalTreeItems = (
  snapshot: FlowguardWorkspaceSnapshot | undefined,
): readonly FlowguardTreeItem[] => {
  if (snapshot === undefined) {
    return [
      emptyItem(
        'flowguard:proposals:not-loaded',
        'Refresh Flowguard to discover pending proposals',
      ),
    ];
  }

  if (snapshot.repositories.length === 0) {
    return [
      {
        ...emptyItem('flowguard:proposals:no-workspace', 'Open a workspace to use Flowguard'),
        contextValue: FLOWGUARD_TREE_CONTEXT_VALUES.workspaceMissing,
      },
    ];
  }

  const proposalItems = snapshot.repositories.flatMap((repository) =>
    repository.proposals.map((proposal) => createProposalTreeItem(repository, proposal, snapshot)),
  );
  const invalidItems = snapshot.repositories.flatMap((repository) =>
    repository.invalidDocuments
      .filter((document) => document.kind === 'proposal')
      .map((document) => createInvalidDocumentItem(repository, document, 'proposal')),
  );
  const items = [...proposalItems, ...invalidItems].sort(compareTreeItems);

  if (items.length === 0) {
    return [emptyItem('flowguard:proposals:empty', 'No pending Flowguard proposals found')];
  }

  return items;
};

const createFlowTreeItem = (
  repository: FlowguardRepositorySnapshot,
  flow: FlowguardFlowDocumentSnapshot,
  snapshot: FlowguardWorkspaceSnapshot,
  options: FlowTreeOptions,
): FlowguardTreeItem => {
  const proposalCount = proposalCountForFlow(repository, flow.document.id);
  const affected = isAffectedFlow(flow, options.changedPaths ?? []);

  return {
    id: `${repository.root.uri}:flow:${flow.document.id}:${flow.relativePath}`,
    kind: 'flow',
    label: flow.document.name,
    description: formatFlowDescription(repository, flow, snapshot, proposalCount),
    contextValue: flowContextValue(affected, proposalCount > 0),
    root: repository.root,
    uri: flow.uri,
    relativePath: flow.relativePath,
    flowId: flow.document.id,
  };
};

const createProposalTreeItem = (
  repository: FlowguardRepositorySnapshot,
  proposal: FlowProposalDocumentSnapshot,
  snapshot: FlowguardWorkspaceSnapshot,
): FlowguardTreeItem => {
  return {
    id: `${repository.root.uri}:proposal:${proposal.document.id}:${proposal.relativePath}`,
    kind: 'proposal',
    label: proposal.document.summary,
    description: formatProposalDescription(repository, proposal, snapshot),
    contextValue: FLOWGUARD_TREE_CONTEXT_VALUES.proposalProposed,
    root: repository.root,
    uri: proposal.uri,
    relativePath: proposal.relativePath,
    flowId: proposal.document.flowId,
    proposalId: proposal.document.id,
  };
};

const createInvalidDocumentItem = (
  repository: FlowguardRepositorySnapshot,
  document: InvalidFlowguardDocumentSnapshot,
  view: 'flow' | 'proposal',
): FlowguardTreeItem => {
  return {
    id: `${repository.root.uri}:invalid:${document.kind}:${document.relativePath}`,
    kind: 'invalid-document',
    label: `Invalid ${document.kind}: ${lastPathSegment(document.relativePath)}`,
    description: `${repository.root.name} - ${formatIssueCount(document.issues.length)}`,
    contextValue:
      view === 'proposal'
        ? FLOWGUARD_TREE_CONTEXT_VALUES.proposalInvalid
        : FLOWGUARD_TREE_CONTEXT_VALUES.flowInvalid,
    root: repository.root,
    uri: document.uri,
    relativePath: document.relativePath,
    issueCount: document.issues.length,
  };
};

const emptyItem = (id: string, label: string): FlowguardTreeItem => {
  return {
    id,
    kind: 'empty',
    label,
    contextValue: FLOWGUARD_TREE_CONTEXT_VALUES.empty,
  };
};

const flowContextValue = (affected: boolean, proposed: boolean): FlowguardTreeContextValue => {
  if (affected && proposed) return FLOWGUARD_TREE_CONTEXT_VALUES.flowAffectedProposed;
  if (affected) return FLOWGUARD_TREE_CONTEXT_VALUES.flowAffected;
  if (proposed) return FLOWGUARD_TREE_CONTEXT_VALUES.flowProposed;
  return FLOWGUARD_TREE_CONTEXT_VALUES.flowValid;
};

const isAffectedFlow = (
  flow: FlowguardFlowDocumentSnapshot,
  changedPaths: readonly string[],
): boolean => {
  if (changedPaths.length === 0) return false;
  return calculateFlowImpact(flow.document, changedPaths).level !== 'none';
};

const proposalCountForFlow = (repository: FlowguardRepositorySnapshot, flowId: string): number => {
  return repository.proposals.filter((proposal) => proposal.document.flowId === flowId).length;
};

const formatFlowDescription = (
  repository: FlowguardRepositorySnapshot,
  flow: FlowguardFlowDocumentSnapshot,
  snapshot: FlowguardWorkspaceSnapshot,
  proposalCount: number,
): string => {
  const parts = [locationDescription(repository, flow.relativePath, snapshot)];
  if (proposalCount > 0) parts.push(formatProposalCount(proposalCount));
  return parts.join(' - ');
};

const formatProposalDescription = (
  repository: FlowguardRepositorySnapshot,
  proposal: FlowProposalDocumentSnapshot,
  snapshot: FlowguardWorkspaceSnapshot,
): string => {
  const flow = repository.flows.find((item) => item.document.id === proposal.document.flowId);
  const flowLabel = flow?.document.name ?? proposal.document.flowId;

  return [
    flowLabel,
    proposal.document.confidence,
    locationDescription(repository, proposal.relativePath, snapshot),
  ].join(' - ');
};

const locationDescription = (
  repository: FlowguardRepositorySnapshot,
  relativePath: string,
  snapshot: FlowguardWorkspaceSnapshot,
): string => {
  if (snapshot.repositories.length === 1) return relativePath;
  return `${repository.root.name}/${relativePath}`;
};

const formatProposalCount = (count: number): string => {
  return count === 1 ? '1 proposal' : `${count} proposals`;
};

const formatIssueCount = (count: number): string => {
  return count === 1 ? '1 issue' : `${count} issues`;
};

const lastPathSegment = (path: string): string => {
  return path.split('/').at(-1) ?? path;
};

const compareTreeItems = (left: FlowguardTreeItem, right: FlowguardTreeItem): number => {
  const root = (left.root?.index ?? 0) - (right.root?.index ?? 0);
  if (root !== 0) return root;
  const kind = kindRank(left.kind) - kindRank(right.kind);
  if (kind !== 0) return kind;
  return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
};

const kindRank = (kind: FlowguardTreeItemKind): number => {
  switch (kind) {
    case 'flow':
      return 0;
    case 'proposal':
      return 1;
    case 'invalid-document':
      return 2;
    case 'empty':
      return 3;
  }
};

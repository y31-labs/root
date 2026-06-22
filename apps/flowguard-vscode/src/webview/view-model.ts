import type {
  FlowguardGraph,
  FlowguardGraphEdge,
  FlowguardGraphNode,
  FlowguardGraphStatus,
  GraphIssue,
} from '@workspace/flowguard-contracts';

import type {
  FlowguardOpenIntent,
  FlowguardRevealSourceIntent,
  FlowguardRevealSourceTarget,
  FlowguardWebviewFlowSnapshot,
  FlowguardWebviewProposalSnapshot,
  FlowguardWebviewSnapshot,
  FlowguardWebviewSourceReference,
} from '#/shared/messages';
import {
  createDefaultGraphViewport,
  layoutFlowguardGraph,
  type GraphPoint,
  type GraphViewport,
  type LaidOutGraph,
  type LaidOutGraphEdge,
  type LaidOutGraphNode,
} from '#/webview/layout';
import { round } from '#/webview/math';

export type GraphViewItemKind = 'node' | 'edge';
export type GraphViewItemKey = `node:${string}` | `edge:${string}`;
export type GraphValidationTreatment = 'none' | 'warning' | 'invalid';

export interface GraphWebviewState {
  readonly snapshot?: FlowguardWebviewSnapshot;
  readonly open?: FlowguardOpenIntent;
  readonly selectedItemKey?: GraphViewItemKey;
  readonly searchQuery?: string;
  readonly viewport?: GraphViewport;
  readonly hostError?: string;
}

export interface GraphDocumentModel {
  readonly rootUri: string;
  readonly rootName: string;
  readonly flowId: string;
  readonly title: string;
  readonly goal: string;
  readonly relativePath: string;
  readonly graph: FlowguardGraph;
  readonly sourceReferences: readonly FlowguardWebviewSourceReference[];
  readonly proposal?: GraphProposalModel;
  readonly warnings: readonly string[];
}

export interface GraphProposalModel {
  readonly proposalId: string;
  readonly summary: string;
  readonly confidence: string;
  readonly relativePath: string;
}

export interface GraphStatusPresentation {
  readonly label: string;
  readonly marker: string;
  readonly className: string;
  readonly lineClassName: string;
  readonly isDimmed: boolean;
}

export interface GraphSourceLink {
  readonly label: string;
  readonly sourcePath: string;
  readonly target: FlowguardRevealSourceTarget;
}

export interface GraphViewItemBase {
  readonly key: GraphViewItemKey;
  readonly itemKind: GraphViewItemKind;
  readonly graphId: string;
  readonly semanticId: string;
  readonly label: string;
  readonly status: FlowguardGraphStatus;
  readonly statusPresentation: GraphStatusPresentation;
  readonly validationTreatment: GraphValidationTreatment;
  readonly sources: readonly GraphSourceLink[];
  readonly issues: readonly GraphIssue[];
  readonly matchesSearch: boolean;
  readonly ariaLabel: string;
}

export interface GraphNodeViewItem extends GraphViewItemBase {
  readonly itemKind: 'node';
  readonly nodeKind: FlowguardGraphNode['kind'];
  readonly route?: string;
  readonly layout: LaidOutGraphNode;
}

export interface GraphEdgeViewItem extends GraphViewItemBase {
  readonly itemKind: 'edge';
  readonly actor: FlowguardGraphEdge['actor'];
  readonly source: string;
  readonly target: string;
  readonly displayLabel: string;
  readonly layout: LaidOutGraphEdge;
}

export type GraphViewItem = GraphNodeViewItem | GraphEdgeViewItem;
type GraphViewItemForSummary =
  | Omit<GraphNodeViewItem, 'matchesSearch' | 'ariaLabel'>
  | Omit<GraphEdgeViewItem, 'matchesSearch' | 'ariaLabel'>;

export interface GraphAccessibleListItem {
  readonly key: GraphViewItemKey;
  readonly kindLabel: string;
  readonly label: string;
  readonly statusLabel: string;
  readonly statusMarker: string;
  readonly selected: boolean;
  readonly matchesSearch: boolean;
  readonly summary: string;
}

export interface GraphInspectorModel {
  readonly heading: string;
  readonly fields: readonly GraphInspectorField[];
  readonly sourceLinks: readonly GraphSourceLink[];
  readonly issues: readonly GraphIssue[];
}

export interface GraphInspectorField {
  readonly label: string;
  readonly value: string;
}

export interface GraphSearchModel {
  readonly query: string;
  readonly matchCount: number;
  readonly selectedMatchIndex?: number;
}

export interface FlowguardGraphViewModel {
  readonly document?: GraphDocumentModel;
  readonly layout?: LaidOutGraph;
  readonly nodes: readonly GraphNodeViewItem[];
  readonly edges: readonly GraphEdgeViewItem[];
  readonly items: readonly GraphViewItem[];
  readonly listItems: readonly GraphAccessibleListItem[];
  readonly selectedItem?: GraphViewItem;
  readonly inspector?: GraphInspectorModel;
  readonly search: GraphSearchModel;
  readonly globalIssues: readonly GraphIssue[];
  readonly emptyMessage?: string;
  readonly hostError?: string;
}

const actorLabels: Record<FlowguardGraphEdge['actor'], string> = {
  user: 'User',
  system: 'System',
  external: 'External',
};

const nodeKindLabels: Record<FlowguardGraphNode['kind'], string> = {
  page: 'Page',
  dialog: 'Dialog',
  panel: 'Panel',
  system: 'System',
  terminal: 'Terminal',
};

const statusPresentations: Record<FlowguardGraphStatus, GraphStatusPresentation> = {
  unchanged: {
    label: 'Unchanged',
    marker: '=',
    className: 'bf-status-unchanged',
    lineClassName: 'bf-line-solid',
    isDimmed: false,
  },
  added: {
    label: 'Added',
    marker: '+',
    className: 'bf-status-added',
    lineClassName: 'bf-line-solid',
    isDimmed: false,
  },
  modified: {
    label: 'Modified',
    marker: '~',
    className: 'bf-status-modified',
    lineClassName: 'bf-line-solid',
    isDimmed: false,
  },
  removed: {
    label: 'Removed',
    marker: '-',
    className: 'bf-status-removed',
    lineClassName: 'bf-line-solid',
    isDimmed: true,
  },
  uncertain: {
    label: 'Uncertain',
    marker: '?',
    className: 'bf-status-uncertain',
    lineClassName: 'bf-line-dashed',
    isDimmed: false,
  },
};

export const createFlowguardGraphViewModel = (
  state: GraphWebviewState,
): FlowguardGraphViewModel => {
  const viewport = state.viewport ?? createDefaultGraphViewport();
  const resolution = resolveGraphDocument(state.snapshot, state.open);
  const searchQuery = normalizeSearchQuery(state.searchQuery);

  if (resolution.document === undefined) {
    return {
      nodes: [],
      edges: [],
      items: [],
      listItems: [],
      search: {
        query: searchQuery,
        matchCount: 0,
      },
      globalIssues: [],
      emptyMessage: resolution.message,
      hostError: state.hostError,
    };
  }

  const document = resolution.document;
  const layout = layoutFlowguardGraph(document.graph, viewport);
  const layoutNodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const layoutEdges = new Map(layout.edges.map((edge) => [edge.id, edge]));
  const actorAmbiguity = hasActorAmbiguity(document.graph.edges);
  const nodes = document.graph.nodes.flatMap((node): readonly GraphNodeViewItem[] => {
    const nodeLayout = layoutNodes.get(node.id);
    if (nodeLayout === undefined) return [];

    return [
      createNodeItem(
        node,
        nodeLayout,
        itemIssues(document.graph.issues, 'node', node.stateId),
        sourceLinksForTarget(document.sourceReferences, {
          kind: 'state',
          stateId: node.stateId,
        }),
        searchQuery,
      ),
    ];
  });
  const edges = document.graph.edges.flatMap((edge): readonly GraphEdgeViewItem[] => {
    const edgeLayout = layoutEdges.get(edge.id);
    if (edgeLayout === undefined) return [];

    return [
      createEdgeItem(
        edge,
        edgeLayout,
        actorAmbiguity,
        itemIssues(document.graph.issues, 'edge', edge.transitionId),
        sourceLinksForTarget(document.sourceReferences, {
          kind: 'transition',
          transitionId: edge.transitionId,
        }),
        searchQuery,
      ),
    ];
  });
  const items = [...nodes, ...edges];
  const matches = items.filter((item) => item.matchesSearch);
  const selectedItem = selectedItemFromItems(items, state.selectedItemKey, searchQuery);
  const selectedMatchIndex =
    selectedItem === undefined || matches.length === 0
      ? undefined
      : matches.findIndex((item) => item.key === selectedItem.key);
  const attachedIssues = new Set(items.flatMap((item) => item.issues));

  return {
    document,
    layout,
    nodes,
    edges,
    items,
    listItems: items.map((item) => createListItem(item, selectedItem?.key)),
    selectedItem,
    inspector: selectedItem === undefined ? undefined : createInspector(document, selectedItem),
    search: {
      query: searchQuery,
      matchCount: matches.length,
      selectedMatchIndex: selectedMatchIndex === -1 ? undefined : selectedMatchIndex,
    },
    globalIssues: document.graph.issues.filter((issue) => !attachedIssues.has(issue)),
    hostError: state.hostError,
  };
};

export const graphViewItemKey = (kind: GraphViewItemKind, graphId: string): GraphViewItemKey => {
  return `${kind}:${graphId}` as GraphViewItemKey;
};

export const createRevealSourceIntent = (
  document: GraphDocumentModel,
  item: GraphViewItem,
  sourcePath: string,
): FlowguardRevealSourceIntent => {
  return {
    rootUri: document.rootUri,
    flowId: document.flowId,
    proposalId: document.proposal?.proposalId,
    sourcePath,
    target:
      item.itemKind === 'node'
        ? {
            kind: 'state',
            stateId: item.semanticId,
          }
        : {
            kind: 'transition',
            transitionId: item.semanticId,
          },
  };
};

export const nextSearchSelection = (
  model: FlowguardGraphViewModel,
  currentKey: GraphViewItemKey | undefined,
  direction: 1 | -1,
): GraphViewItemKey | undefined => {
  const matches = model.items.filter((item) => item.matchesSearch);
  if (matches.length === 0) return currentKey;

  const currentIndex = matches.findIndex((item) => item.key === currentKey);
  const nextIndex =
    currentIndex === -1 ? 0 : (currentIndex + direction + matches.length) % matches.length;
  return matches[nextIndex]?.key;
};

export const statusPresentation = (status: FlowguardGraphStatus): GraphStatusPresentation => {
  return statusPresentations[status];
};

export const itemPolyline = (points: readonly GraphPoint[]): string => {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ');
};

const resolveGraphDocument = (
  snapshot: FlowguardWebviewSnapshot | undefined,
  open: FlowguardOpenIntent | undefined,
): { readonly document?: GraphDocumentModel; readonly message?: string } => {
  if (snapshot === undefined) {
    return { message: 'Waiting for Flowguard data.' };
  }

  if (snapshot.repositories.length === 0) {
    return { message: 'No Flowguard repositories are open.' };
  }

  const repository =
    open === undefined
      ? snapshot.repositories.find((candidate) => candidate.flows.length > 0)
      : snapshot.repositories.find((candidate) => candidate.root.uri === open.rootUri);
  if (repository === undefined) {
    return { message: 'The selected repository is not available in the current snapshot.' };
  }

  const flow =
    open === undefined
      ? repository.flows[0]
      : repository.flows.find((candidate) => candidate.flowId === open.flowId);
  if (flow === undefined) {
    return { message: 'The selected Flowguard contract is not available in the current snapshot.' };
  }

  const proposal =
    open?.proposalId === undefined
      ? undefined
      : repository.proposals.find(
          (candidate) =>
            candidate.proposalId === open.proposalId && candidate.flowId === flow.flowId,
        );
  if (open?.proposalId !== undefined && proposal === undefined) {
    return { message: 'The selected proposal is not available in the current snapshot.' };
  }

  return {
    document: documentFromSnapshot(repository.root, flow, proposal),
  };
};

const documentFromSnapshot = (
  root: FlowguardWebviewSnapshot['repositories'][number]['root'],
  flow: FlowguardWebviewFlowSnapshot,
  proposal: FlowguardWebviewProposalSnapshot | undefined,
): GraphDocumentModel => {
  const warnings =
    proposal !== undefined && proposal.graph === undefined
      ? ['Proposal graph is unavailable, so the approved Flowguard contract is shown.']
      : [];

  return {
    rootUri: root.uri,
    rootName: root.name,
    flowId: flow.flowId,
    title: flow.name,
    goal: flow.goal,
    relativePath: flow.relativePath,
    graph: proposal?.graph ?? flow.graph,
    sourceReferences: mergeSourceReferences(
      proposal === undefined
        ? flow.sourceReferences
        : [...flow.sourceReferences, ...proposal.sourceReferences],
    ),
    proposal:
      proposal === undefined
        ? undefined
        : {
            proposalId: proposal.proposalId,
            summary: proposal.summary,
            confidence: proposal.confidence,
            relativePath: proposal.relativePath,
          },
    warnings,
  };
};

const createNodeItem = (
  node: FlowguardGraphNode,
  layout: LaidOutGraphNode,
  issues: readonly GraphIssue[],
  sources: readonly GraphSourceLink[],
  searchQuery: string,
): GraphNodeViewItem => {
  const presentation = statusPresentation(node.status);
  const validationTreatment = validationTreatmentFromIssues(issues);
  const searchText = [
    'state',
    node.label,
    node.stateId,
    node.kind,
    node.route,
    node.status,
    ...sources.map((source) => source.sourcePath),
    ...issues.map((issue) => issue.message),
  ];
  const item: Omit<GraphNodeViewItem, 'matchesSearch' | 'ariaLabel'> = {
    key: graphViewItemKey('node', node.id),
    itemKind: 'node',
    graphId: node.id,
    semanticId: node.stateId,
    label: node.label,
    status: node.status,
    statusPresentation: presentation,
    validationTreatment,
    sources,
    issues,
    nodeKind: node.kind,
    route: node.route,
    layout,
  };

  return {
    ...item,
    matchesSearch: matchesSearch(searchText, searchQuery),
    ariaLabel: accessibleSummary(item),
  };
};

const createEdgeItem = (
  edge: FlowguardGraphEdge,
  layout: LaidOutGraphEdge,
  actorAmbiguity: boolean,
  issues: readonly GraphIssue[],
  sources: readonly GraphSourceLink[],
  searchQuery: string,
): GraphEdgeViewItem => {
  const presentation = statusPresentation(edge.status);
  const validationTreatment = validationTreatmentFromIssues(issues);
  const displayLabel = actorAmbiguity ? `${actorLabels[edge.actor]}: ${edge.label}` : edge.label;
  const searchText = [
    'transition',
    edge.label,
    displayLabel,
    edge.transitionId,
    edge.actor,
    edge.source,
    edge.target,
    edge.status,
    ...sources.map((source) => source.sourcePath),
    ...issues.map((issue) => issue.message),
  ];
  const item: Omit<GraphEdgeViewItem, 'matchesSearch' | 'ariaLabel'> = {
    key: graphViewItemKey('edge', edge.id),
    itemKind: 'edge',
    graphId: edge.id,
    semanticId: edge.transitionId,
    label: edge.label,
    status: edge.status,
    statusPresentation: presentation,
    validationTreatment,
    sources,
    issues,
    actor: edge.actor,
    source: edge.source,
    target: edge.target,
    displayLabel,
    layout,
  };

  return {
    ...item,
    matchesSearch: matchesSearch(searchText, searchQuery),
    ariaLabel: accessibleSummary(item),
  };
};

const selectedItemFromItems = (
  items: readonly GraphViewItem[],
  selectedKey: GraphViewItemKey | undefined,
  searchQuery: string,
): GraphViewItem | undefined => {
  const exactMatch = items.find((item) => item.key === selectedKey);
  if (exactMatch !== undefined) return exactMatch;

  if (searchQuery.length > 0) {
    const searchMatch = items.find((item) => item.matchesSearch);
    if (searchMatch !== undefined) return searchMatch;
  }

  return items[0];
};

const createListItem = (
  item: GraphViewItem,
  selectedKey: GraphViewItemKey | undefined,
): GraphAccessibleListItem => {
  return {
    key: item.key,
    kindLabel: item.itemKind === 'node' ? nodeKindLabels[item.nodeKind] : 'Transition',
    label: item.itemKind === 'edge' ? item.displayLabel : item.label,
    statusLabel: item.statusPresentation.label,
    statusMarker: item.statusPresentation.marker,
    selected: item.key === selectedKey,
    matchesSearch: item.matchesSearch,
    summary: item.ariaLabel,
  };
};

const createInspector = (
  document: GraphDocumentModel,
  item: GraphViewItem,
): GraphInspectorModel => {
  const fields: GraphInspectorField[] = [
    {
      label: 'Semantic ID',
      value: item.semanticId,
    },
    {
      label: 'Status',
      value: item.statusPresentation.label,
    },
  ];

  if (item.itemKind === 'node') {
    fields.push({
      label: 'Kind',
      value: nodeKindLabels[item.nodeKind],
    });
    if (item.route !== undefined) {
      fields.push({
        label: 'Route',
        value: item.route,
      });
    }
  } else {
    fields.push(
      {
        label: 'Actor',
        value: actorLabels[item.actor],
      },
      {
        label: 'Action',
        value: item.label,
      },
      {
        label: 'Source node',
        value: item.source,
      },
      {
        label: 'Target node',
        value: item.target,
      },
    );
  }

  if (document.proposal !== undefined) {
    fields.push(
      {
        label: 'Proposal',
        value: document.proposal.summary,
      },
      {
        label: 'Confidence',
        value: document.proposal.confidence,
      },
    );
  }

  return {
    heading: item.itemKind === 'edge' ? item.displayLabel : item.label,
    fields,
    sourceLinks: item.sources,
    issues: item.issues,
  };
};

const accessibleSummary = (item: GraphViewItemForSummary): string => {
  const pieces = [
    item.itemKind === 'node' ? `State ${item.label}` : `Transition ${item.label}`,
    `semantic ID ${item.semanticId}`,
    `status ${item.statusPresentation.label}`,
  ];

  if (item.itemKind === 'node') {
    pieces.push(`kind ${nodeKindLabels[item.nodeKind]}`);
    if (item.route !== undefined) pieces.push(`route ${item.route}`);
  } else {
    pieces.push(`actor ${actorLabels[item.actor]}`);
  }

  if (item.sources.length > 0) {
    pieces.push(`sources ${item.sources.map((source) => source.sourcePath).join(', ')}`);
  }

  if (item.issues.length > 0) {
    pieces.push(`${item.issues.length} validation issue${item.issues.length === 1 ? '' : 's'}`);
  }

  return pieces.join('. ');
};

const sourceLinksForTarget = (
  sourceReferences: readonly FlowguardWebviewSourceReference[],
  target: FlowguardRevealSourceTarget,
): readonly GraphSourceLink[] => {
  return sourceReferences
    .filter((reference) => sameRevealTarget(reference.target, target))
    .flatMap((reference) =>
      reference.sources.map((sourcePath) => ({
        label: reference.label,
        sourcePath,
        target: reference.target,
      })),
    );
};

const itemIssues = (
  issues: readonly GraphIssue[],
  itemKind: GraphViewItemKind,
  semanticId: string,
): readonly GraphIssue[] => {
  return issues.filter((issue) =>
    itemKind === 'node' ? issue.stateId === semanticId : issue.transitionId === semanticId,
  );
};

const validationTreatmentFromIssues = (issues: readonly GraphIssue[]): GraphValidationTreatment => {
  if (issues.some((issue) => issue.severity === 'error')) return 'invalid';
  if (issues.length > 0) return 'warning';
  return 'none';
};

const hasActorAmbiguity = (edges: readonly FlowguardGraphEdge[]): boolean => {
  return new Set(edges.map((edge) => edge.actor)).size > 1;
};

const mergeSourceReferences = (
  sourceReferences: readonly FlowguardWebviewSourceReference[],
): readonly FlowguardWebviewSourceReference[] => {
  const seen = new Set<string>();
  const merged: FlowguardWebviewSourceReference[] = [];

  for (const reference of sourceReferences) {
    const sources = reference.sources.filter((source) => {
      const key = `${targetKey(reference.target)}:${source}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (sources.length > 0) {
      merged.push({
        target: reference.target,
        label: reference.label,
        sources,
      });
    }
  }

  return merged;
};

const sameRevealTarget = (
  left: FlowguardRevealSourceTarget,
  right: FlowguardRevealSourceTarget,
): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'state' && right.kind === 'state') return left.stateId === right.stateId;
  if (left.kind === 'transition' && right.kind === 'transition') {
    return left.transitionId === right.transitionId;
  }
  return false;
};

const targetKey = (target: FlowguardRevealSourceTarget): string => {
  return target.kind === 'state' ? `state:${target.stateId}` : `transition:${target.transitionId}`;
};

const normalizeSearchQuery = (query: string | undefined): string => {
  return (query ?? '').trim().toLocaleLowerCase();
};

const matchesSearch = (values: readonly (string | undefined)[], query: string): boolean => {
  if (query.length === 0) return false;
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
};

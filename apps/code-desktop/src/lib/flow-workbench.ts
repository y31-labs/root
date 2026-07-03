import type {
  TargetFlow,
  TargetFlowCoverageEvidence,
  TargetFlowCoverageSummary,
  TargetFlowEdge,
  TargetFlowNode,
} from '@workspace/code-agent-contracts/sessions';

export type FlowCoverageKind = 'e2e' | 'unit' | 'integration';
export type FlowCoverageKindStatus = TargetFlowCoverageSummary['status'] | 'unmapped';

export interface FlowCoverageKindSummary {
  kind: FlowCoverageKind;
  label: string;
  status: FlowCoverageKindStatus;
  evidenceCount: number;
}

export interface FlowCanvasNode {
  id: string;
  type: 'workflow';
  ariaRole: 'button';
  className: string;
  position: {
    x: number;
    y: number;
  };
  data: {
    flow: TargetFlow;
    node: TargetFlowNode;
    evidence: TargetFlowCoverageEvidence[];
    coverageKinds: FlowCoverageKindSummary[];
  };
}

export interface FlowCanvasEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: 'animated' | 'temporary';
  ariaRole: 'button';
  className: string;
  data: {
    flow: TargetFlow;
    edge: TargetFlowEdge;
    evidence: TargetFlowCoverageEvidence[];
    coverageKinds: FlowCoverageKindSummary[];
  };
}

export interface FlowCanvasGraph {
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
}

export const flowToCanvas = (flow: TargetFlow): FlowCanvasGraph => {
  const rows = new Map<string, number>();
  flow.graph.edges.forEach((edge, index) => {
    if (!rows.has(edge.source)) rows.set(edge.source, index % 2);
    if (!rows.has(edge.target)) rows.set(edge.target, index % 2);
  });

  return {
    nodes: flow.graph.nodes.map((node, index) => ({
      id: node.id,
      type: 'workflow',
      ariaRole: 'button',
      className: workflowClassName('node', node.id),
      position: {
        x: index * 300,
        y: (rows.get(node.id) ?? 0) * 130,
      },
      data: {
        flow,
        node,
        evidence: evidenceForSummary(flow, node.coverage),
        coverageKinds: coverageKindsForSummary(flow, node.coverage),
      },
    })),
    edges: flow.graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: edge.coverage.status === 'covered' ? 'animated' : 'temporary',
      ariaRole: 'button',
      className: workflowClassName('edge', edge.id),
      data: {
        flow,
        edge,
        evidence: evidenceForSummary(flow, edge.coverage),
        coverageKinds: coverageKindsForSummary(flow, edge.coverage),
      },
    })),
  };
};

export const flowsToCanvas = (flows: TargetFlow[]): FlowCanvasGraph => {
  const nodes: FlowCanvasNode[] = [];
  const edges: FlowCanvasEdge[] = [];

  flows.forEach((flow, flowIndex) => {
    const graph = flowToCanvas(flow);
    const prefix = `${flow.flowId}:`;
    const yOffset = flowIndex * 260;

    nodes.push(
      ...graph.nodes.map((node) => ({
        ...node,
        id: `${prefix}${node.id}`,
        position: {
          x: node.position.x,
          y: node.position.y + yOffset,
        },
        className: workflowClassName('node', `${flow.flowId}-${node.id}`),
      })),
    );
    edges.push(
      ...graph.edges.map((edge) => ({
        ...edge,
        id: `${prefix}${edge.id}`,
        source: `${prefix}${edge.source}`,
        target: `${prefix}${edge.target}`,
        className: workflowClassName('edge', `${flow.flowId}-${edge.id}`),
      })),
    );
  });

  return { nodes, edges };
};

const workflowClassName = (kind: 'node' | 'edge', id: string) =>
  `flow-${kind}-${id.replace(/[^a-z0-9]+/gi, '-')}`;

const evidenceForSummary = (
  flow: TargetFlow,
  summary: TargetFlowCoverageSummary,
): TargetFlowCoverageEvidence[] => {
  const scenarioIds = new Set(summary.scenarios.map((scenario) => scenario.scenarioId));
  const evidence = flow.coverageScenarios
    .filter((scenario) => scenarioIds.has(scenario.scenarioId))
    .flatMap((scenario) => scenario.evidence);
  const seen = new Set<string>();
  return evidence.filter((artifact) => {
    if (seen.has(artifact.artifactId)) return false;
    seen.add(artifact.artifactId);
    return true;
  });
};

const coverageKindsForSummary = (
  flow: TargetFlow,
  summary: TargetFlowCoverageSummary,
): FlowCoverageKindSummary[] => {
  const evidenceCount = evidenceForSummary(flow, summary).length;
  return [
    {
      kind: 'e2e',
      label: 'E2E',
      status: summary.status,
      evidenceCount,
    },
    {
      kind: 'unit',
      label: 'Unit',
      status: 'unmapped',
      evidenceCount: 0,
    },
    {
      kind: 'integration',
      label: 'Integration',
      status: 'unmapped',
      evidenceCount: 0,
    },
  ];
};

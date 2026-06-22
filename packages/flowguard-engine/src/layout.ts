import type {
  FlowguardGraph,
  FlowguardGraphEdge,
  FlowguardGraphNode,
} from '@workspace/flowguard-contracts';

export type FlowguardGraphLayoutDirection = 'LR' | 'TB';

export interface FlowguardGraphLayoutNode {
  id: string;
  label: string;
  kind: FlowguardGraphNode['kind'];
  status: FlowguardGraphNode['status'];
  width: number;
  height: number;
}

export interface FlowguardGraphLayoutEdge {
  id: string;
  source: FlowguardGraphEdge['source'];
  target: FlowguardGraphEdge['target'];
  label: string;
  status: FlowguardGraphEdge['status'];
}

export interface FlowguardGraphLayoutInput {
  flowId: string;
  direction: FlowguardGraphLayoutDirection;
  nodes: FlowguardGraphLayoutNode[];
  edges: FlowguardGraphLayoutEdge[];
}

export interface FlowguardGraphLayoutPoint {
  x: number;
  y: number;
}

export interface FlowguardGraphLayoutNodeResult extends FlowguardGraphLayoutNode {
  x: number;
  y: number;
}

export interface FlowguardGraphLayoutEdgeResult extends FlowguardGraphLayoutEdge {
  points: FlowguardGraphLayoutPoint[];
}

export interface FlowguardGraphLayoutResult {
  flowId: string;
  direction: FlowguardGraphLayoutDirection;
  nodes: FlowguardGraphLayoutNodeResult[];
  edges: FlowguardGraphLayoutEdgeResult[];
}

export interface FlowguardGraphLayoutAdapter {
  layout(
    input: FlowguardGraphLayoutInput,
  ): FlowguardGraphLayoutResult | Promise<FlowguardGraphLayoutResult>;
}

export interface CreateLayoutInputOptions {
  direction?: FlowguardGraphLayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
}

const defaultNodeWidth = 220;
const defaultNodeHeight = 96;

export const createFlowguardGraphLayoutInput = (
  graph: FlowguardGraph,
  options: CreateLayoutInputOptions = {},
): FlowguardGraphLayoutInput => {
  const nodeWidth = options.nodeWidth ?? defaultNodeWidth;
  const nodeHeight = options.nodeHeight ?? defaultNodeHeight;

  return {
    flowId: graph.flowId,
    direction: options.direction ?? 'LR',
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      status: node.status,
      width: nodeWidth,
      height: nodeHeight,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      status: edge.status,
    })),
  };
};

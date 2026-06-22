import type { FlowguardGraph } from '@workspace/flowguard-contracts';
import { createFlowguardGraphLayoutInput } from '@workspace/flowguard-engine';

import { clamp, round } from '#/webview/math';

export const graphNodeWidth = 220;
export const graphNodeHeight = 96;
export const graphColumnGap = 120;
export const graphRowGap = 56;
export const graphCanvasPadding = 48;

export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

export interface GraphBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LaidOutGraphNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LaidOutGraphEdge {
  readonly id: string;
  readonly points: readonly GraphPoint[];
  readonly labelPoint: GraphPoint;
}

export interface LaidOutGraph {
  readonly flowId: string;
  readonly nodes: readonly LaidOutGraphNode[];
  readonly edges: readonly LaidOutGraphEdge[];
  readonly bounds: GraphBounds;
  readonly viewBox: string;
}

export interface GraphViewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const createDefaultGraphViewport = (): GraphViewport => {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
  };
};

export const layoutFlowguardGraph = (
  graph: FlowguardGraph,
  viewport: GraphViewport = createDefaultGraphViewport(),
): LaidOutGraph => {
  const input = createFlowguardGraphLayoutInput(graph, {
    direction: 'LR',
    nodeWidth: graphNodeWidth,
    nodeHeight: graphNodeHeight,
  });
  const originalNodeOrder = new Map(input.nodes.map((node, index) => [node.id, index]));
  const ranks = rankNodes(
    input.nodes.map((node) => node.id),
    input.edges,
  );
  const nodesByRank = new Map<number, string[]>();

  for (const node of input.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const bucket = nodesByRank.get(rank) ?? [];
    bucket.push(node.id);
    nodesByRank.set(rank, bucket);
  }

  for (const bucket of nodesByRank.values()) {
    bucket.sort((left, right) => compareOriginalOrder(left, right, originalNodeOrder));
  }

  const rowByNode = new Map<string, number>();
  for (const [rank, nodeIds] of [...nodesByRank.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    nodeIds.forEach((nodeId, row) => {
      rowByNode.set(nodeId, row);
    });
    nodesByRank.set(rank, nodeIds);
  }

  const laidOutNodes = input.nodes.map((node): LaidOutGraphNode => {
    const rank = ranks.get(node.id) ?? 0;
    const row = rowByNode.get(node.id) ?? 0;

    return {
      id: node.id,
      x: graphCanvasPadding + rank * (graphNodeWidth + graphColumnGap),
      y: graphCanvasPadding + row * (graphNodeHeight + graphRowGap),
      width: node.width,
      height: node.height,
    };
  });
  const laidOutNodeById = new Map(laidOutNodes.map((node) => [node.id, node]));
  const laidOutEdges = input.edges.flatMap((edge): readonly LaidOutGraphEdge[] => {
    const source = laidOutNodeById.get(edge.source);
    const target = laidOutNodeById.get(edge.target);
    if (source === undefined || target === undefined) return [];

    const points = routeEdge(source, target);
    return [
      {
        id: edge.id,
        points,
        labelPoint: midpoint(points),
      },
    ];
  });
  const bounds = calculateGraphBounds(laidOutNodes, laidOutEdges);

  return {
    flowId: graph.flowId,
    nodes: laidOutNodes,
    edges: laidOutEdges,
    bounds,
    viewBox: viewBoxFromBounds(bounds, viewport),
  };
};

const rankNodes = (
  nodeIds: readonly string[],
  edges: readonly { readonly source: string; readonly target: string; readonly id: string }[],
): Map<string, number> => {
  const outgoing = new Map<string, typeof edges>();
  const incomingCount = new Map(nodeIds.map((id) => [id, 0]));
  const nodeIdSet = new Set(nodeIds);

  for (const edge of edges) {
    if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) continue;

    const bucket = outgoing.get(edge.source) ?? [];
    outgoing.set(edge.source, [...bucket, edge]);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  for (const [source, bucket] of outgoing) {
    outgoing.set(
      source,
      [...bucket].sort((left, right) => {
        const target = left.target.localeCompare(right.target);
        return target !== 0 ? target : left.id.localeCompare(right.id);
      }),
    );
  }

  const roots = uniqueStrings([
    ...nodeIds.slice(0, 1),
    ...nodeIds.filter((id) => incomingCount.get(id) === 0),
  ]);
  const ranks = new Map<string, number>();

  const assignRank = (nodeId: string, rank: number, path: Set<string>): void => {
    if (!nodeIdSet.has(nodeId) || path.has(nodeId)) return;

    const existingRank = ranks.get(nodeId);
    if (existingRank !== undefined && existingRank <= rank) return;
    ranks.set(nodeId, rank);

    const nextPath = new Set(path);
    nextPath.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (edge.target === nodeId) continue;
      assignRank(edge.target, rank + 1, nextPath);
    }
  };

  for (const root of roots) {
    assignRank(root, 0, new Set());
  }
  for (const nodeId of nodeIds) {
    if (!ranks.has(nodeId)) assignRank(nodeId, 0, new Set());
  }

  return ranks;
};

const routeEdge = (source: LaidOutGraphNode, target: LaidOutGraphNode): readonly GraphPoint[] => {
  if (source.id === target.id) {
    const right = source.x + source.width;
    const top = source.y;
    const centerY = source.y + source.height / 2;

    return [
      { x: right, y: centerY },
      { x: right + graphColumnGap / 3, y: centerY },
      { x: right + graphColumnGap / 3, y: top - graphRowGap / 2 },
      { x: source.x + source.width / 2, y: top - graphRowGap / 2 },
    ];
  }

  const forward = target.x >= source.x;
  const start: GraphPoint = {
    x: forward ? source.x + source.width : source.x,
    y: source.y + source.height / 2,
  };
  const end: GraphPoint = {
    x: forward ? target.x : target.x + target.width,
    y: target.y + target.height / 2,
  };
  const midX = start.x + (end.x - start.x) / 2;

  if (Math.abs(start.y - end.y) < 1) {
    return [start, end];
  }

  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
};

const midpoint = (points: readonly GraphPoint[]): GraphPoint => {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0] ?? { x: 0, y: 0 };

  const centerIndex = Math.floor((points.length - 1) / 2);
  const left = points[centerIndex] ?? points[0];
  const right = points[centerIndex + 1] ?? left;

  return {
    x: left.x + (right.x - left.x) / 2,
    y: left.y + (right.y - left.y) / 2,
  };
};

const calculateGraphBounds = (
  nodes: readonly LaidOutGraphNode[],
  edges: readonly LaidOutGraphEdge[],
): GraphBounds => {
  const points = [
    ...nodes.flatMap((node) => [
      { x: node.x, y: node.y },
      { x: node.x + node.width, y: node.y + node.height },
    ]),
    ...edges.flatMap((edge) => edge.points),
  ];

  if (points.length === 0) {
    return {
      x: 0,
      y: 0,
      width: graphCanvasPadding * 2,
      height: graphCanvasPadding * 2,
    };
  }

  const minX = Math.min(...points.map((point) => point.x)) - graphCanvasPadding;
  const minY = Math.min(...points.map((point) => point.y)) - graphCanvasPadding;
  const maxX = Math.max(...points.map((point) => point.x)) + graphCanvasPadding;
  const maxY = Math.max(...points.map((point) => point.y)) + graphCanvasPadding;

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, graphCanvasPadding * 2),
    height: Math.max(maxY - minY, graphCanvasPadding * 2),
  };
};

const viewBoxFromBounds = (bounds: GraphBounds, viewport: GraphViewport): string => {
  const zoom = clamp(viewport.zoom, 0.25, 3);
  const width = bounds.width / zoom;
  const height = bounds.height / zoom;
  const centerX = bounds.x + bounds.width / 2 + viewport.panX;
  const centerY = bounds.y + bounds.height / 2 + viewport.panY;

  return [
    round(centerX - width / 2),
    round(centerY - height / 2),
    round(width),
    round(height),
  ].join(' ');
};

const compareOriginalOrder = (
  left: string,
  right: string,
  originalNodeOrder: ReadonlyMap<string, number>,
): number => {
  return (
    (originalNodeOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (originalNodeOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
};

const uniqueStrings = (values: readonly string[]): readonly string[] => {
  return [...new Set(values)];
};

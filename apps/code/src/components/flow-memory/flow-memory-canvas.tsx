import { useSuspenseQuery } from '@tanstack/react-query';
import { Canvas } from '@workspace/ui/components/ai-elements/canvas';
import { Edge } from '@workspace/ui/components/ai-elements/edge';
import { type ComponentProps, useMemo } from 'react';

import { flowMemoryQueries } from '#/queries';
import type { Doc } from '#convex/_generated/dataModel';

import { ActionNodeCard, StartNodeCard } from './flow-memory-node-card';

type Canvas = ComponentProps<typeof Canvas>;
type GetCanvasProps<T> = T extends keyof Canvas ? NonNullable<Canvas[T]>[number] : never;
type CanvasNode = GetCanvasProps<'nodes'>;
type CanvasEdge = GetCanvasProps<'edges'>;

interface FlowGraph {
  nodes: Doc<'flowNode'>[];
  edges: Doc<'flowEdge'>[];
}

const nodeTypes = {
  start: StartNodeCard,
  action: ActionNodeCard,
};

const edgeTypes = {
  animated: Edge.Animated,
  temporary: Edge.Temporary,
};

export function FlowMemoryCanvas() {
  const { data: graph } = useSuspenseQuery(flowMemoryQueries.graph);
  if (!graph) return null;
  return <WithGraph graph={graph} />;
}

interface WithGraphProps {
  graph: FlowGraph;
}

export function WithGraph({ graph }: WithGraphProps) {
  const { edges, nodes } = useMemo(() => buildWorkflow(graph), [graph]);

  return (
    <Canvas
      className='h-auto min-h-[34rem] flex-1'
      fitView
      edgeTypes={edgeTypes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodes={nodes}
    />
  );
}

const buildWorkflow = ({
  nodes,
  edges,
}: FlowGraph): { nodes: CanvasNode[]; edges: CanvasEdge[] } => {
  const { incomingEdges, outgoingEdges } = edges.reduce<{
    incomingEdges: Set<string>;
    outgoingEdges: Set<string>;
  }>(
    (acc, { targetNodeId, sourceNodeId }) => {
      acc.incomingEdges.add(targetNodeId);
      acc.outgoingEdges.add(sourceNodeId);
      return acc;
    },
    { incomingEdges: new Set(), outgoingEdges: new Set() },
  );

  return {
    nodes: nodes.map((node) => ({
      id: node._id,
      type: node.kind,
      position: getPosition(node),
      data: {
        externalId: node.externalId,
        kind: node.kind,
        title: node.title,
        handles: { source: outgoingEdges.has(node._id), target: incomingEdges.has(node._id) },
      },
    })),
    edges: edges.map(({ _id: id, sourceNodeId: source, targetNodeId: target }) => ({
      id,
      source,
      target,
    })),
  };
};

const getPosition = (node: Doc<'flowNode'>) => ({
  x: node.kind === 'start' ? 0 : node.order * 320,
  y: 0,
});

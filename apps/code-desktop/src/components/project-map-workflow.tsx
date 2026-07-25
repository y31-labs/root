import type { Repository, RepositoryTarget } from '@workspace/code-agent-contracts/sessions';
import { Badge } from '@workspace/ui/components/ui/badge';
import { Canvas } from '@workspace/ui/components/ai-elements/canvas';
import { Edge as WorkflowEdge } from '@workspace/ui/components/ai-elements/edge';
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@workspace/ui/components/ai-elements/node';
import { Panel as CanvasPanel } from '@workspace/ui/components/ai-elements/panel';
import { useMemo } from 'react';

interface ProjectMapWorkflowProps {
  repository: Repository;
  targets: RepositoryTarget[];
  activeTargetId?: string;
  onSelectTarget: (targetId: string) => void;
}

interface ProjectMapNodeData {
  label: string;
  description: string;
  footer: string;
  selected: boolean;
  handles: {
    source: boolean;
    target: boolean;
  };
}

const nodeTypes = {
  project: ({ data }: { data: ProjectMapNodeData }) => (
    <Node aria-label={data.label} handles={data.handles}>
      <NodeHeader>
        <NodeTitle>{data.label}</NodeTitle>
        <NodeDescription>{data.description}</NodeDescription>
      </NodeHeader>
      <NodeContent>
        <Badge variant={data.selected ? 'default' : 'outline'}>
          {data.selected ? 'Selected' : 'Available'}
        </Badge>
      </NodeContent>
      <NodeFooter>{data.footer}</NodeFooter>
    </Node>
  ),
};

const edgeTypes = {
  animated: WorkflowEdge.Animated,
  temporary: WorkflowEdge.Temporary,
};

export function ProjectMapWorkflow({
  repository,
  targets,
  activeTargetId,
  onSelectTarget,
}: ProjectMapWorkflowProps) {
  const graph = useMemo(
    () => projectMapGraph(repository, targets, activeTargetId),
    [activeTargetId, repository, targets],
  );

  return (
    <Canvas
      className='h-[32rem]'
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_, node) => {
        if (node.id.startsWith('target:')) onSelectTarget(node.id.slice('target:'.length));
      }}
    >
      <CanvasPanel position='top-left'>
        {targets.length} targets mapped from {repository.name}
      </CanvasPanel>
    </Canvas>
  );
}

const projectMapGraph = (
  repository: Repository,
  targets: RepositoryTarget[],
  activeTargetId?: string,
) => {
  const selectedTargets = targets.filter((target) => target.selected);
  const rootId = `repository:${repository.id}`;
  const groupedTargets = targetGroups.flatMap((group, groupIndex) =>
    selectedTargets
      .filter((target) => target.kind === group.kind)
      .map((target, targetIndex) => ({
        target,
        position: {
          x: 340 + groupIndex * 320,
          y: (targetIndex - 0.5) * 150,
        },
      })),
  );

  return {
    nodes: [
      {
        id: rootId,
        type: 'project',
        position: { x: 0, y: 0 },
        data: {
          label: repository.name,
          description: repository.branch ?? 'Detached',
          footer: repository.dirty ? 'Local edits excluded' : 'Working tree clean',
          selected: true,
          handles: { source: true, target: false },
        },
      },
      ...groupedTargets.map(({ target, position }) => ({
        id: `target:${target.id}`,
        type: 'project',
        position,
        data: {
          label: target.name,
          description: target.path,
          footer: targetKindLabel(target.kind),
          selected: target.id === activeTargetId,
          handles: { source: true, target: true },
        },
      })),
    ],
    edges: groupedTargets.map(({ target }) => ({
      id: `repository:${repository.id}:target:${target.id}`,
      source: rootId,
      target: `target:${target.id}`,
      type: target.id === activeTargetId ? 'animated' : 'temporary',
    })),
  };
};

const targetGroups = [
  { kind: 'app', label: 'App' },
  { kind: 'package', label: 'Package' },
  { kind: 'other', label: 'Scope' },
] as const;

const targetKindLabel = (kind: RepositoryTarget['kind']) =>
  targetGroups.find((group) => group.kind === kind)?.label ?? 'Target';

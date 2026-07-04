import {
  Node,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@workspace/ui/components/ai-elements/node';
import { cn } from '@workspace/ui/lib/utils';

import type { Doc } from '#convex/_generated/dataModel';

interface FlowNodeData extends Doc<'flowNode'> {
  handles: Record<'source' | 'target', boolean>;
}

export function StartNodeCard(props: { data: FlowNodeData }) {
  return (
    <WorkflowNodeCard
      {...props}
      className='border-success bg-success/10 shadow-sm ring-1 ring-success/20'
    />
  );
}

export function ActionNodeCard(props: { data: FlowNodeData }) {
  return <WorkflowNodeCard {...props} />;
}

function WorkflowNodeCard({
  className,
  data: { handles, title, description, kind, order, externalId },
}: {
  className?: string;
  data: FlowNodeData;
}) {
  return (
    <Node handles={handles} className={cn('w-72', className)}>
      <NodeHeader>
        <NodeTitle>{title}</NodeTitle>
        <NodeDescription>{description}</NodeDescription>
      </NodeHeader>
      <NodeContent>
        <span className='capitalize'>{kind}</span>
      </NodeContent>
      <NodeFooter>
        <span className='truncate'>{externalId}</span>
      </NodeFooter>
    </Node>
  );
}

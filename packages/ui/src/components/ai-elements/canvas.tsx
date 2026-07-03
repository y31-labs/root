import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  type ReactFlowProps,
  type PanelProps,
} from '@xyflow/react';
import { cn } from '@workspace/ui/lib/utils';

import '@xyflow/react/dist/style.css';

export function Canvas({ className, children, fitView = true, ...props }: ReactFlowProps) {
  return (
    <div className={cn('h-[28rem] min-h-0 overflow-hidden border-y', className)}>
      <ReactFlow
        fitView={fitView}
        proOptions={{ hideAttribution: true }}
        className='bg-background text-foreground'
        {...props}
      >
        <Background color='var(--border)' gap={24} size={1} />
        <Controls
          showInteractive={false}
          className='!border-border !bg-popover !text-popover-foreground [&_button]:!border-border [&_button]:!bg-popover [&_button]:!text-popover-foreground'
        />
        {children}
      </ReactFlow>
    </div>
  );
}

export function CanvasPanel({ className, ...props }: PanelProps) {
  return (
    <Panel
      className={cn(
        'border-border bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

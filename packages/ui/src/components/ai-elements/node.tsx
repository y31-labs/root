import { Handle, Position } from '@xyflow/react';
import { cn } from '@workspace/ui/lib/utils';
import type { ComponentProps } from 'react';

export interface NodeProps extends ComponentProps<'div'> {
  handles?: {
    source?: boolean;
    target?: boolean;
  };
}

export function Node({
  handles = { source: true, target: true },
  className,
  children,
  ...props
}: NodeProps) {
  return (
    <div
      className={cn(
        'border-border bg-background text-foreground min-w-56 rounded-md border px-3 py-3 text-sm shadow-sm',
        className,
      )}
      {...props}
    >
      {handles.target ? (
        <Handle
          type='target'
          position={Position.Left}
          className='!border-background !bg-muted-foreground'
        />
      ) : null}
      {children}
      {handles.source ? (
        <Handle
          type='source'
          position={Position.Right}
          className='!border-background !bg-muted-foreground'
        />
      ) : null}
    </div>
  );
}

export function NodeHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('space-y-1', className)} {...props} />;
}

export function NodeTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('truncate font-medium leading-5', className)} {...props} />;
}

export function NodeDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('text-muted-foreground line-clamp-2 text-xs leading-5', className)}
      {...props}
    />
  );
}

export function NodeContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-3 text-xs', className)} {...props} />;
}

export function NodeFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-muted-foreground mt-3 flex items-center gap-2 text-xs', className)}
      {...props}
    />
  );
}

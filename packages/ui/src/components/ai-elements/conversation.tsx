import { cn } from '@workspace/ui/lib/utils';
import { useEffect, useRef, type ComponentProps } from 'react';

export function Conversation({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('relative min-h-0 flex-1 overflow-y-auto', className)} {...props} />;
}

export function ConversationContent({ className, ...props }: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'end' });
  });

  return (
    <div
      className={cn('mx-auto flex w-full max-w-3xl flex-col px-5 py-6 md:px-8', className)}
      {...props}
    >
      {props.children}
      <div ref={ref} />
    </div>
  );
}

export function ConversationEmptyState({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'text-muted-foreground flex min-h-72 flex-1 items-center justify-center px-6 text-center text-sm',
        className,
      )}
      {...props}
    />
  );
}

import { cn } from '@workspace/ui/lib/utils';
import type { ComponentProps } from 'react';
import { Streamdown } from 'streamdown';

export function Message({
  from,
  className,
  ...props
}: ComponentProps<'article'> & { from: 'user' | 'assistant' }) {
  return (
    <article
      data-role={from}
      className={cn('group/message flex py-3 data-[role=user]:justify-end', className)}
      {...props}
    />
  );
}

export function MessageContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'max-w-[88%] whitespace-pre-wrap text-sm leading-6 group-data-[role=assistant]/message:max-w-full group-data-[role=user]/message:rounded-xl group-data-[role=user]/message:border group-data-[role=user]/message:bg-muted group-data-[role=user]/message:px-3.5 group-data-[role=user]/message:py-2.5',
        className,
      )}
      {...props}
    />
  );
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export function MessageResponse({ className, ...props }: MessageResponseProps) {
  return (
    <Streamdown
      className={cn(
        'size-full whitespace-normal [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      {...props}
    />
  );
}

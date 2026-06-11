import { Button } from '@workspace/ui/components/ui/button';
import { Textarea } from '@workspace/ui/components/ui/textarea';
import { cn } from '@workspace/ui/lib/utils';
import { ArrowUp, Square } from 'lucide-react';
import type { ComponentProps, FormEvent } from 'react';

export function PromptInput({
  onSubmit,
  className,
  ...props
}: Omit<ComponentProps<'form'>, 'onSubmit'> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'border-input bg-background border shadow-lg shadow-background/30 transition-colors focus-within:border-ring',
        className,
      )}
      {...props}
    />
  );
}

export function PromptInputTextarea({ className, ...props }: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn(
        'max-h-48 min-h-20 resize-none border-0 bg-transparent px-4 py-3 shadow-none focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  );
}

export function PromptInputFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center justify-between gap-2 p-2 pt-0', className)} {...props} />
  );
}

export function PromptInputTools({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 items-center gap-1', className)} {...props} />;
}

export function PromptInputSubmit({
  status = 'ready',
  ...props
}: ComponentProps<typeof Button> & {
  status?: 'ready' | 'submitted' | 'streaming' | 'error';
}) {
  const active = status === 'submitted' || status === 'streaming';
  return (
    <Button
      type='submit'
      size='icon-sm'
      aria-label={active ? 'Stop response' : 'Send message'}
      {...props}
    >
      {active ? <Square /> : <ArrowUp />}
    </Button>
  );
}

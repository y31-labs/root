import { MessageResponse } from '@workspace/ui/components/ai-elements/message';
import { Brain } from 'lucide-react';

interface ReasoningTaskProps {
  summaries: string[];
  active?: boolean;
}

export function ReasoningTask({ summaries, active = false }: ReasoningTaskProps) {
  const content = summaries.filter(Boolean).join('\n\n');

  if (!content) return null;

  return (
    <section className='space-y-1 py-0.5'>
      <div className='flex min-w-0 items-center gap-2 text-sm text-muted-foreground'>
        <Brain aria-hidden='true' className='size-4 shrink-0' />
        <span className='min-w-0 flex-1'>Thinking</span>
      </div>
      <MessageResponse
        className='h-auto pl-6 font-normal text-muted-foreground [&_[data-streamdown=strong]]:font-normal'
        isAnimating={active}
      >
        {content}
      </MessageResponse>
    </section>
  );
}

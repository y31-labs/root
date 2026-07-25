import { MessageResponse } from '@workspace/ui/components/ai-elements/message';
import { Task, TaskContent, TaskTrigger } from '@workspace/ui/components/ai-elements/task';
import { Brain, ChevronDown } from 'lucide-react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

interface ReasoningTaskProps {
  summaries: string[];
  active?: boolean;
}

export function ReasoningTask({ summaries, active = false }: ReasoningTaskProps) {
  const { stopScroll } = useStickToBottomContext();
  const content = summaries.filter(Boolean).join('\n\n');

  if (!content) return null;

  return (
    <Task
      className='my-3'
      defaultOpen
      onOpenChange={() => {
        if (!active) stopScroll();
      }}
    >
      <TaskTrigger
        className='w-full rounded-sm py-0.5 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
        title='Thinking'
      >
        <span className='flex w-full min-w-0 items-center gap-2 text-sm text-muted-foreground'>
          <Brain aria-hidden='true' className='size-4 shrink-0' />
          <span className='min-w-0 flex-1'>Thinking</span>
          <ChevronDown
            aria-hidden='true'
            className='size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180'
          />
        </span>
      </TaskTrigger>
      <TaskContent className='[&>div]:mt-2 [&>div]:border-0 [&>div]:pl-6'>
        <MessageResponse
          className='h-auto font-normal text-muted-foreground [&_[data-streamdown=strong]]:font-normal'
          isAnimating={active}
        >
          {content}
        </MessageResponse>
      </TaskContent>
    </Task>
  );
}

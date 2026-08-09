import { MessageResponse } from '@workspace/ui/components/ai-elements/message';

interface ReasoningTaskProps {
  summaries: string[];
  active?: boolean;
}

export function ReasoningTask({ summaries, active = false }: ReasoningTaskProps) {
  const content = summaries.filter(Boolean).join('\n\n');

  if (!content) return null;

  return (
    <MessageResponse
      className='h-auto text-xs leading-relaxed font-normal text-muted-foreground [&_[data-streamdown=strong]]:font-normal'
      isAnimating={active}
    >
      {content}
    </MessageResponse>
  );
}

import { TaskContent, type TaskContentProps } from '@workspace/ui/components/ai-elements/task';
import { cn } from '@workspace/ui/lib/utils';

export function AnimatedTaskContent({ className, ...props }: TaskContentProps) {
  return (
    <TaskContent
      className={cn(
        'h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  );
}

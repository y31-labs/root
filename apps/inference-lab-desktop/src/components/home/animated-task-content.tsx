import { TaskContent, type TaskContentProps } from '@workspace/ui/components/ai-elements/task';
import { cn } from '@workspace/ui/lib/utils';

export function AnimatedTaskContent({ className, ...props }: TaskContentProps) {
  return (
    <TaskContent
      className={cn(
        'origin-top overflow-hidden data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-2 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

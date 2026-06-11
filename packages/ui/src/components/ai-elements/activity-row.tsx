import { cn } from '@workspace/ui/lib/utils';
import {
  Check,
  ChevronDown,
  CircleEllipsis,
  FilePenLine,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export type ActivityKind = 'command' | 'file' | 'error' | 'status';

const icons: Record<ActivityKind, ReactNode> = {
  command: <Terminal />,
  file: <FilePenLine />,
  error: <TriangleAlert />,
  status: <CircleEllipsis />,
};

export function ActivityRow({
  kind,
  label,
  detail,
  complete = true,
  className,
  ...props
}: ComponentProps<'div'> & {
  kind: ActivityKind;
  label: string;
  detail?: string;
  complete?: boolean;
}) {
  const tone =
    kind === 'error'
      ? 'border-danger/30 bg-danger/5 text-danger'
      : 'border-border bg-muted/30 text-muted-foreground';

  return (
    <div className={cn('my-1 rounded-lg border px-3 py-2.5 text-xs', tone, className)} {...props}>
      <div className='flex min-w-0 gap-2.5'>
        <span className='mt-0.5 shrink-0 [&>svg]:size-3.5'>
          {complete ? <Check /> : icons[kind]}
        </span>
        <div className='min-w-0 flex-1'>
          {detail ? (
            <details className='group/activity'>
              <summary className='text-foreground flex cursor-pointer list-none items-center gap-2'>
                <span className='min-w-0 flex-1 truncate'>{label}</span>
                <ChevronDown className='size-3.5 shrink-0 transition-transform group-open/activity:rotate-180' />
              </summary>
              <pre className='text-muted-foreground mt-2 max-h-56 overflow-auto whitespace-pre-wrap border-t pt-2 font-mono text-[11px] leading-5'>
                {detail}
              </pre>
            </details>
          ) : (
            <p className='text-foreground truncate'>{label}</p>
          )}
        </div>
      </div>
    </div>
  );
}

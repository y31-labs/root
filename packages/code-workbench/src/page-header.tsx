import { cn } from '@workspace/ui/lib/utils';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-2xl font-semibold'>{title}</h1>
          {meta}
        </div>
        {description ? <p className='text-muted-foreground mt-1 text-sm'>{description}</p> : null}
      </div>
      {actions ? <div className='flex shrink-0 items-center gap-2'>{actions}</div> : null}
    </header>
  );
}

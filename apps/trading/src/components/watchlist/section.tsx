import { cn } from '#/lib/utils';
import type { ReactNode } from 'react';

type SectionProps = {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: SectionProps) {
  const hasHeader = !!(eyebrow || title || description || action);

  return (
    <section className={cn('space-y-4', className)}>
      {hasHeader ? (
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

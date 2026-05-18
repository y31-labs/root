import { HoverCard, HoverCardContent, HoverCardTrigger } from '@workspace/ui/components/ui/hover-card';
import { cn } from '#/lib/utils';
import { IconInfoCircle } from '@tabler/icons-react';

export type TermInfo = {
  title: string;
  description: string;
  interpretation?: string;
};

type TermHoverCardProps = {
  term: string;
  info: TermInfo;
  children: React.ReactNode;
  className?: string;
  iconClassName?: string;
};

export function TermHoverCard({
  term,
  info,
  children,
  className,
  iconClassName,
}: TermHoverCardProps) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {children}
      <HoverCard>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label={`About ${term}`}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              iconClassName,
            )}
          >
            <IconInfoCircle className="size-3" aria-hidden />
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-72 space-y-1.5">
          <p className="text-sm font-semibold leading-none">{info.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{info.description}</p>
          {info.interpretation ? (
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              {info.interpretation}
            </p>
          ) : null}
        </HoverCardContent>
      </HoverCard>
    </span>
  );
}

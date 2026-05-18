import { Spinner } from '@workspace/ui/components/ui/spinner';
import { cn } from '#/lib/utils';

interface LoadingViewProps {
  label?: string;
  fullHeight?: boolean;
}

export function LoadingView({ label, fullHeight = false }: LoadingViewProps) {
  return (
    <div
      className={cn(
        'p-6 flex flex-1 items-center justify-center w-full',
        fullHeight && 'h-full min-h-screen',
      )}
    >
      <div className="flex items-center gap-3">
        <Spinner className="size-5" />
        {label && <span className="text-base text-muted-foreground ">{label}</span>}
      </div>
    </div>
  );
}

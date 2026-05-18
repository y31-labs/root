import { Button } from '@workspace/ui/components/ui/button';
import { useNavigate } from '@tanstack/react-router';

export function ErrorView({
  title,
  message,
  error,
  onRetry,
}: {
  title: string;
  message?: string;
  error?: Error;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const detail = message ?? error?.message;

  return (
    <div className="flex flex-1 w-full items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight break-words sm:text-5xl">{title}</h1>
        {detail ? <p className="text-base text-muted-foreground break-words">{detail}</p> : null}
        <div className="flex justify-center gap-2">
          <Button onClick={() => onRetry?.() ?? globalThis.location?.reload()}>Try again</Button>
          <Button variant="outline" onClick={() => navigate({ to: '/' })}>
            Go back
          </Button>
        </div>
      </div>
    </div>
  );
}

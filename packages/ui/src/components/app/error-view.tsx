import { useNavigate } from '@tanstack/react-router';
import { Button } from '@workspace/ui/components/ui/button';
import { thru } from 'lodash-es';

interface ErrorViewProps {
  title: string;
  message?: string;
  error?: Error;
  onRetry?: () => void;
  backPath?: string;
}

export function ErrorView({ title, message, error, onRetry, backPath = '/' }: ErrorViewProps) {
  const navigate = useNavigate();

  return (
    <div className='p-6 flex flex-1 items-center justify-center w-full'>
      <div className='w-full max-w-lg text-center space-y-6'>
        <h1 className='text-4xl sm:text-5xl font-bold tracking-tight break-words'>{title}</h1>
        {thru(
          message ?? error?.message,
          (message) =>
            message && <p className='text-base text-muted-foreground break-words'>{message}</p>,
        )}
        <div className='flex justify-center gap-2'>
          <Button onClick={() => onRetry?.() ?? location.reload()}>Try again</Button>
          <Button variant='outline' onClick={() => navigate({ to: backPath })}>
            Go back
          </Button>
        </div>
      </div>
    </div>
  );
}

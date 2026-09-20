import { Button } from '@workspace/ui/components/ui/button';
import { ShieldCheck } from 'lucide-react';

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline';

export function ApprovalRow({
  title,
  detail,
  disabled,
  onDecision,
}: {
  title: string;
  detail?: string;
  disabled?: boolean;
  onDecision: (decision: ApprovalDecision) => void;
}) {
  return (
    <div className='border-warning/30 bg-warning/5 my-2 rounded-xl border p-4 text-sm'>
      <div className='flex gap-3'>
        <ShieldCheck className='text-warning mt-0.5 size-4 shrink-0' />
        <div className='min-w-0 flex-1'>
          <p className='font-medium'>{title}</p>
          {detail ? (
            <pre className='text-muted-foreground mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border bg-background/50 p-2 font-mono text-[11px] leading-5'>
              {detail}
            </pre>
          ) : null}
          {!disabled ? (
            <div className='mt-3 flex flex-wrap gap-2'>
              <Button size='sm' onClick={() => onDecision('accept')}>
                Allow once
              </Button>
              <Button size='sm' variant='outline' onClick={() => onDecision('acceptForSession')}>
                Allow for session
              </Button>
              <Button size='sm' variant='ghost' onClick={() => onDecision('decline')}>
                Deny
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

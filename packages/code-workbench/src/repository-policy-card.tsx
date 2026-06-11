import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import { Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function RepositoryPolicyCard({
  fullName,
  approved,
  disabled,
  children,
  onPropose,
}: {
  fullName: string;
  approved: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onPropose: () => void;
}) {
  return (
    <section className='min-w-0 space-y-4'>
      <div>
        <h2 className='font-medium'>Repository policy</h2>
        <p className='text-muted-foreground text-sm'>
          Required verification policy for the selected repository.
        </p>
      </div>

      <div className='divide-y border-y'>
        <div className='flex min-w-0 items-center justify-between gap-4 py-3'>
          <div className='flex min-w-0 items-center gap-2'>
            <span className='truncate text-sm font-medium'>{fullName}</span>
            <Badge variant={approved ? 'default' : 'secondary'}>
              {approved ? 'Approved' : 'Approval required'}
            </Badge>
          </div>
          {!children ? (
            <Button
              variant={approved ? 'outline' : 'default'}
              disabled={disabled}
              onClick={onPropose}
            >
              <Settings2 data-icon='inline-start' />
              {approved ? 'Review new base commit' : 'Generate manifest proposal'}
            </Button>
          ) : null}
        </div>
        {children ? <div className='py-4'>{children}</div> : null}
      </div>
    </section>
  );
}

import { Badge } from '@workspace/ui/components/ui/badge';
import { Button } from '@workspace/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/ui/card';
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
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <CardTitle>{fullName}</CardTitle>
            <CardDescription>Required verification policy for this repository.</CardDescription>
          </div>
          <Badge variant={approved ? 'default' : 'secondary'}>
            {approved ? 'Approved' : 'Approval required'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {children ?? (
          <Button variant={approved ? 'outline' : 'default'} disabled={disabled} onClick={onPropose}>
            <Settings2 data-icon='inline-start' />
            {approved ? 'Review new base commit' : 'Generate manifest proposal'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

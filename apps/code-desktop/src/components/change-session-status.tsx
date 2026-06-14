import type { ChangeSessionStatus } from '@workspace/code-agent-contracts/sessions';
import { Badge } from '@workspace/ui/components/ui/badge';

export function ChangeSessionStatusBadge({ status }: { status: ChangeSessionStatus }) {
  const variant =
    status === 'verified' || status === 'accepted'
      ? 'default'
      : status === 'failed' || status === 'cancelled' || status === 'discarded'
        ? 'destructive'
        : 'secondary';
  return <Badge variant={variant}>{status.replace('_', ' ')}</Badge>;
}

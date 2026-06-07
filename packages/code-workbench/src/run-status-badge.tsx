import type { RunStatus } from '@workspace/code-agent-contracts/runs';
import { Badge } from '@workspace/ui/components/ui/badge';

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge variant={status === 'verified' ? 'default' : 'secondary'}>{status}</Badge>;
}

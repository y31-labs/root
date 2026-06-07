import type {
  GateResultStatus,
  VerificationSummary,
} from '@workspace/code-agent-contracts/runs';
import type { VerificationGateKind } from '@workspace/code-agent-contracts/manifest';
import { Badge } from '@workspace/ui/components/ui/badge';

export interface GateTimelineItem {
  id: string;
  kind: VerificationGateKind;
  status: GateResultStatus;
  attempt: number;
  durationMs: number;
}

export function GateTimeline({
  items,
  summary,
}: {
  items: GateTimelineItem[];
  summary?: VerificationSummary;
}) {
  return (
    <div className='space-y-2'>
      {summary ? (
        <p className='text-muted-foreground text-sm'>
          {summary.passed}/{summary.required} required gates passed
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className='text-muted-foreground text-sm'>Waiting for verification.</p>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className='flex items-center justify-between rounded-lg border p-3'
          >
            <span>
              <strong>{item.kind}</strong>
              <span className='text-muted-foreground ml-2 text-xs'>
                attempt {item.attempt} · {(item.durationMs / 1000).toFixed(1)}s
              </span>
            </span>
            <Badge variant={item.status === 'passed' ? 'default' : 'secondary'}>
              {item.status}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}

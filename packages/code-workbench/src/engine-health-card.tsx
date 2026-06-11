import type { EngineHealth } from '@workspace/code-agent-contracts/engine';
import { Badge } from '@workspace/ui/components/ui/badge';
import type { ReactNode } from 'react';

export function EngineHealthCard({
  health,
  actions,
}: {
  health: EngineHealth;
  actions?: ReactNode;
}) {
  return (
    <section className='min-w-0 space-y-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h2 className='font-medium'>Local Codex</h2>
          <p className='text-muted-foreground text-sm'>
            {health.version ?? 'Codex CLI not detected'}
          </p>
        </div>
        <Badge variant={health.available ? 'default' : 'secondary'}>
          {health.available ? 'Ready' : 'Setup required'}
        </Badge>
      </div>

      <div className='divide-y border-y text-sm'>
        <Status label='ChatGPT login' ready={health.authenticated} />
        <Status label='Docker Desktop' ready={health.dockerAvailable} />
        {health.detail ? <p className='text-muted-foreground py-3'>{health.detail}</p> : null}
        {actions ? <div className='py-3'>{actions}</div> : null}
      </div>
    </section>
  );
}

function Status({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className='flex items-center justify-between gap-3 py-3'>
      <span className='font-medium'>{label}</span>
      <span className={ready ? 'text-success' : 'text-warning'}>
        {ready ? 'Ready' : 'Unavailable'}
      </span>
    </div>
  );
}

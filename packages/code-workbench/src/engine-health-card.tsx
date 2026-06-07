import type { EngineHealth } from '@workspace/code-agent-contracts/engine';
import { Badge } from '@workspace/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/ui/card';
import type { ReactNode } from 'react';

export function EngineHealthCard({
  health,
  actions,
}: {
  health: EngineHealth;
  actions?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>Local Codex</CardTitle>
            <CardDescription>{health.version ?? 'Codex CLI not detected'}</CardDescription>
          </div>
          <Badge variant={health.available ? 'default' : 'secondary'}>
            {health.available ? 'Ready' : 'Setup required'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='grid gap-2 text-sm'>
        <Status label='ChatGPT login' ready={health.authenticated} />
        <Status label='Docker Desktop' ready={health.dockerAvailable} />
        {health.detail ? <p className='text-muted-foreground'>{health.detail}</p> : null}
        {actions}
      </CardContent>
    </Card>
  );
}

function Status({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className='flex items-center justify-between'>
      <span>{label}</span>
      <span className={ready ? 'text-success' : 'text-warning'}>
        {ready ? 'Ready' : 'Unavailable'}
      </span>
    </div>
  );
}

import { Button } from '@workspace/ui/components/ui/button';

import { useGeneratedAppIntegrations } from '#/features/apps/use-generated-app-integrations';
import type { GeneratedAppRecord, LocalApi } from '#/lib/local-api';

export function GeneratedAppIntegrations({ api, app }: { api: LocalApi; app: GeneratedAppRecord }) {
  const { connectedServers, connectingServer, connectServer, error, requirements, servers } =
    useGeneratedAppIntegrations(api, app.permissions);

  if (requirements.length === 0) return null;

  return (
    <section aria-label='Required integrations' className='border-b px-6 py-4 md:px-10'>
      <div className='flex flex-wrap items-center gap-x-5 gap-y-2'>
        <p className='text-sm font-medium'>Integrations</p>
        {requirements.map((serverName) => {
          const server = servers.find((candidate) => candidate.name === serverName);
          const connected = connectedServers.has(serverName);
          return (
            <div className='flex items-center gap-2 text-sm' key={serverName}>
              <span className='text-muted-foreground'>{serverName}</span>
              {connected || server?.authentication === 'none' ? (
                <span className='text-success'>Available</span>
              ) : server?.enabled && server.authentication === 'oauth' ? (
                <Button
                  disabled={connectingServer !== undefined}
                  size='xs'
                  variant='outline'
                  onClick={() => void connectServer(serverName)}
                >
                  {connectingServer === serverName ? 'Connecting…' : 'Connect'}
                </Button>
              ) : (
                <span className='text-warning'>Configure in Codex</span>
              )}
            </div>
          );
        })}
      </div>
      {error ? (
        <p className='mt-2 text-sm text-danger' role='alert'>
          {error}
        </p>
      ) : null}
    </section>
  );
}

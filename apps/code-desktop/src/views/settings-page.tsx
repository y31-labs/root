import type { EngineHealth } from '@workspace/code-agent-contracts/engine';
import { EngineHealthCard } from '@workspace/code-workbench/engine-health-card';
import { PageHeader } from '@workspace/code-workbench/page-header';
import { Button } from '@workspace/ui/components/ui/button';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useLocalApi } from '#/providers/local-api-provider';

const unavailableHealth: EngineHealth = {
  available: false,
  authenticated: false,
  gitAvailable: false,
  dockerAvailable: false,
  appServerAvailable: false,
  browserToolsAvailable: false,
};

export function SettingsPage() {
  const api = useLocalApi();
  const [health, setHealth] = useState<EngineHealth>(unavailableHealth);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setHealth(await api.engineHealth());
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-8 p-4 md:p-6'>
      <PageHeader
        title='Setup'
        description='Local prerequisites for isolated Codex change sessions.'
        actions={
          <Button variant='outline' onClick={refresh}>
            <RefreshCw data-icon='inline-start' />
            Check again
          </Button>
        }
      />

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      <EngineHealthCard
        health={health}
        actions={
          <>
            {!health.authenticated ? (
              <Button variant='outline' onClick={() => api.startCodexLogin()}>
                <ExternalLink data-icon='inline-start' />
                Open Codex login
              </Button>
            ) : null}
            {!health.dockerAvailable ? (
              <Button
                variant='outline'
                onClick={async () => {
                  try {
                    await api.installVerifierRuntime();
                    await refresh();
                  } catch (nextError) {
                    setError(nextError instanceof Error ? nextError.message : String(nextError));
                  }
                }}
              >
                <Download data-icon='inline-start' />
                Build verifier
              </Button>
            ) : null}
          </>
        }
      />

      <section className='space-y-2 text-sm'>
        <h2 className='font-medium'>Verification boundary</h2>
        <p className='text-muted-foreground max-w-2xl'>
          Code permits network access only for the approved frozen Bun install. Implementation,
          tests, application servers, and browser interaction otherwise run without container
          network access.
        </p>
      </section>
    </div>
  );
}

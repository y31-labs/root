import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@workspace/ui/components/ui/button';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { CodexIntegrationStatus } from '#/lib/types';
import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/settings')({ component: SettingsRoute });

const unavailableStatus: CodexIntegrationStatus = {
  installed: false,
  authenticated: false,
  appServerAvailable: false,
  connected: false,
  version: null,
  accountEmail: null,
  planType: null,
  detail: null,
};

function SettingsRoute() {
  const api = useLocalApi();
  const [status, setStatus] = useState<CodexIntegrationStatus>(unavailableStatus);
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const nextStatus = await api.codexIntegrationStatus();
      setStatus(nextStatus);
      setError('');
      return nextStatus;
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setChecking(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!connecting) return;
    const interval = window.setInterval(() => {
      void refresh().then((nextStatus) => {
        if (nextStatus?.connected) setConnecting(false);
      });
    }, 2_000);
    const stopPolling = window.setTimeout(() => setConnecting(false), 120_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopPolling);
    };
  }, [connecting, refresh]);

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      await api.connectCodex();
    } catch (nextError) {
      setConnecting(false);
      setError(errorMessage(nextError));
    }
  };

  const accountDetail = status.accountEmail
    ? `${status.accountEmail}${status.planType ? ` · ${formatPlan(status.planType)}` : ''}`
    : status.version;

  return (
    <main className='min-h-0 flex-1 overflow-y-auto bg-background p-8 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>Settings</h1>
        </header>

        <section className='mt-10 space-y-2'>
          <div className='flex items-start justify-between gap-4'>
            <div>
              <h2 className='font-medium text-muted-foreground'>Integrations</h2>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => void refresh()}
              disabled={checking}
            >
              <RefreshCw className={checking ? 'animate-spin' : undefined} />
              Check again
            </Button>
          </div>

          <div className='grid gap-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <h3 className='text-sm font-medium'>Codex</h3>
              </div>
              <p className='mt-1.5 text-sm text-muted-foreground'>
                {accountDetail ?? status.detail ?? 'Checking the local Codex installation…'}
              </p>
              {status.detail && accountDetail && (
                <p className='mt-1 text-xs text-muted-foreground'>{status.detail}</p>
              )}
            </div>
            {status.connected ? (
              <p className='text-sm text-success' role='status'>
                Connected
              </p>
            ) : (
              <Button
                type='button'
                variant='outline'
                disabled={
                  !status.installed || !status.appServerAvailable || connecting || checking
                }
                onClick={() => void connect()}
              >
                {connecting ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <ExternalLink />
                )}
                {connecting ? 'Waiting for sign-in' : 'Connect Codex'}
              </Button>
            )}
          </div>

          {error && (
            <p className='text-sm text-danger' role='alert'>
              {error}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

const formatPlan = (plan: string) =>
  plan
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

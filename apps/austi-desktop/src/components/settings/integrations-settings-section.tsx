import { Button } from '@workspace/ui/components/ui/button';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { SettingsRow, SettingsSection } from '#/components/settings/settings-section';
import type { CodexIntegrationStatus } from '#/lib/types';
import { useLocalApi } from '#/providers/local-api-provider';

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

export function IntegrationsSettingsSection() {
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
    <SettingsSection
      title='Integrations'
      action={
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='text-muted-foreground hover:text-foreground'
          onClick={() => void refresh()}
          disabled={checking}
        >
          <RefreshCw className={checking ? 'animate-spin' : undefined} />
          Check again
        </Button>
      }
    >
      <SettingsRow
        title='Codex'
        description={accountDetail ?? status.detail ?? 'Checking the local Codex installation…'}
        detail={status.detail && accountDetail ? status.detail : undefined}
        trailing={
          status.connected ? (
            <p className='text-sm font-medium text-success' role='status'>
              Connected
            </p>
          ) : (
            <Button
              type='button'
              variant='outline'
              disabled={!status.installed || !status.appServerAvailable || connecting || checking}
              onClick={() => void connect()}
            >
              {connecting ? <LoaderCircle className='animate-spin' /> : <ExternalLink />}
              {connecting ? 'Waiting for sign-in' : 'Connect Codex'}
            </Button>
          )
        }
      />

      {error && (
        <p className='mt-6 text-sm text-danger' role='alert'>
          {error}
        </p>
      )}
    </SettingsSection>
  );
}

const formatPlan = (plan: string) =>
  plan
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

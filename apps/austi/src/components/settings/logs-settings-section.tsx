import { Button } from '@workspace/ui/components/ui/button';
import { FolderOpen, LoaderCircle } from 'lucide-react';
import { useState, useTransition } from 'react';

import { SettingsRow, SettingsSection } from '#/components/settings/settings-section';
import { useLocalApi } from '#/providers/local-api-provider';

export function LogsSettingsSection() {
  const api = useLocalApi();
  const [opening, startTransition] = useTransition();
  const [error, setError] = useState('');

  const openLogsFolder = () =>
    startTransition(async () => {
      setError('');
      try {
        await api.openLogsFolder();
      } catch (nextError) {
        setError(errorMessage(nextError));
      }
    });

  return (
    <SettingsSection title='Logs'>
      <SettingsRow
        title='Application logs'
        trailing={
          <Button type='button' variant='outline' disabled={opening} onClick={openLogsFolder}>
            {opening ? <LoaderCircle className='animate-spin' /> : <FolderOpen />}
            Open folder
          </Button>
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

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not open the logs folder.';

import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@workspace/ui/components/ui/button';
import { Input } from '@workspace/ui/components/ui/input';
import { Label } from '@workspace/ui/components/ui/label';
import { Check, LoaderCircle } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { useLocalApi } from '#/providers/local-api-provider';

export const Route = createFileRoute('/settings')({ component: SettingsRoute });

function SettingsRoute() {
  const api = useLocalApi();
  const [serviceUrl, setServiceUrl] = useState('');
  const [pending, setPending] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api
      .getSettings()
      .then((settings) => {
        if (!cancelled) setServiceUrl(settings.inferenceServiceUrl);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError('');
    try {
      const settings = await api.saveSettings({ inferenceServiceUrl: serviceUrl });
      setServiceUrl(settings.inferenceServiceUrl);
      setSaved(true);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className='min-h-0 flex-1 overflow-y-auto bg-background p-8 text-foreground'>
      <div className='mx-auto max-w-3xl'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>Settings</h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            Configure the inference service used to generate tools and run their capabilities.
          </p>
        </header>

        <form className='mt-10 space-y-4' onSubmit={save}>
          <div>
            <Label htmlFor='service-url'>Inference service URL</Label>
            <Input
              id='service-url'
              type='url'
              className='mt-2'
              value={serviceUrl}
              onChange={(event) => {
                setServiceUrl(event.target.value);
                setSaved(false);
              }}
              placeholder='http://localhost:3010'
              disabled={pending}
            />
            <p className='mt-2 text-sm leading-6 text-muted-foreground'>
              Use the root URL of an Interface Lab-compatible service. y31 calls its
              <code className='mx-1 font-mono text-xs'>/api/generate</code>
              and
              <code className='mx-1 font-mono text-xs'>/api/plugins</code>
              endpoints through the native runtime.
            </p>
          </div>

          {error ? (
            <p className='text-sm text-danger' role='alert'>
              {error}
            </p>
          ) : null}

          <div className='flex items-center gap-3 border-t pt-4'>
            <Button type='submit' disabled={pending || !serviceUrl.trim()}>
              {pending ? <LoaderCircle className='animate-spin' /> : null}
              Save settings
            </Button>
            {saved ? (
              <span className='flex items-center gap-1.5 text-sm text-success'>
                <Check className='size-4' /> Saved locally
              </span>
            ) : null}
          </div>
        </form>

        <section className='mt-12 border-y py-5'>
          <h2 className='font-medium'>Local data</h2>
          <p className='mt-2 text-sm leading-6 text-muted-foreground'>
            Project briefs, generated interfaces, and revision history stay in the y31 desktop
            application data directory. Briefs and current interface code are sent only to the
            inference service you configure.
          </p>
        </section>
      </div>
    </main>
  );
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';

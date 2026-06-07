import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '@workspace/ui/components/ui/button';
import { useConvexAuth } from 'convex/react';
import { ArrowRight } from 'lucide-react';
import { useState, useTransition, type ReactNode } from 'react';

import { localApi, type DeviceAuthorization } from '#/lib/local-api';

export function DesktopAuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthorization>();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const signIn = () =>
    startTransition(async () => {
      setError(undefined);
      setDeviceAuth(undefined);

      try {
        const authorization = await localApi.beginAuth();
        setDeviceAuth(authorization);
        await openUrl(authorization.verificationUriComplete);
        await localApi.pollAuth(
          authorization.deviceCode,
          authorization.interval,
          authorization.expiresIn,
        );
        setDeviceAuth(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });

  if (isLoading) {
    return (
      <main className='flex min-h-svh items-center justify-center p-6'>
        <p className='text-muted-foreground text-sm'>Checking authentication...</p>
      </main>
    );
  }

  if (isAuthenticated) return children;

  return (
    <main className='grid min-h-svh overflow-hidden bg-background md:grid-cols-2'>
      <section className='flex items-center px-10 py-20 sm:px-16 lg:px-24'>
        <div className='w-full max-w-lg'>
          <p className='mb-5 text-sm font-medium text-muted-foreground'>Code Desktop</p>
          <h1 className='text-4xl font-medium tracking-tight text-balance sm:text-5xl'>
            Build with agents, locally.
          </h1>
          <p className='mt-5 max-w-md text-base leading-7 text-muted-foreground'>
            Your focused workspace for setting up, running, and reviewing agent work.
          </p>

          <div className='mt-10 space-y-4'>
            {deviceAuth ? (
              <p className='text-sm text-muted-foreground'>
                Confirm code <strong className='text-foreground'>{deviceAuth.userCode}</strong> in
                your browser.
              </p>
            ) : null}
            {error ? (
              <p className='text-danger text-sm' role='alert'>
                {error}
              </p>
            ) : null}
            <Button size='lg' disabled={isPending} onClick={signIn}>
              {isPending ? 'Waiting for browser...' : error ? 'Try again' : 'Sign in'}
              <ArrowRight data-icon='inline-end' />
            </Button>
          </div>
        </div>
      </section>

      <section className='relative hidden min-h-svh overflow-hidden md:block' aria-hidden='true'>
        <img
          src='/welcome-orbit.png'
          alt=''
          className='absolute inset-0 size-full object-cover object-center'
        />
        <div className='absolute inset-0 bg-linear-to-r from-background via-background/20 to-transparent' />
      </section>
    </main>
  );
}

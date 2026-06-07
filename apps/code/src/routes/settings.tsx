import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { LoadingView } from '@workspace/ui/components/app/loading-view';
import { Button } from '@workspace/ui/components/ui/button';
import { ExternalLink } from 'lucide-react';

import { githubInstallationsQueries } from '#/queries';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(githubInstallationsQueries.list),
  pendingComponent: LoadingView,
});

function SettingsPage() {
  const { data: installations } = useSuspenseQuery(githubInstallationsQueries.list);

  return (
    <div className='flex flex-1 flex-col gap-6 p-4 md:p-6'>
      <header>
        <h1 className='text-2xl font-semibold'>Settings</h1>
      </header>

      <section>
        {installations.length ? (
          <div className='divide-y'>
            {installations.map((installation) => (
              <div key={installation._id} className='flex items-center gap-2 py-3'>
                <span className='text-sm font-medium'>GitHub Installation</span>
                <Button
                  variant='outline'
                  nativeButton={false}
                  render={
                    <a
                      href={`https://github.com/settings/installations/${installation.installationId}`}
                      target='_blank'
                      title='Manage GitHub installation'
                      rel='noreferrer'
                    />
                  }
                >
                  Manage
                  <ExternalLink />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>No GitHub installations connected.</p>
        )}
      </section>
    </div>
  );
}

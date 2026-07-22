import { createFileRoute } from '@tanstack/react-router';

import { IntegrationsSettingsSection } from '#/components/settings/integrations-settings-section';

export const Route = createFileRoute('/settings')({ component: SettingsRoute });

function SettingsRoute() {
  return (
    <main className='min-h-0 flex-1 overflow-y-auto bg-background p-8 text-foreground'>
      <div className='mx-auto max-w-2xl'>
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>Settings</h1>
        </header>

        <div className='mt-12 space-y-12'>
          <IntegrationsSettingsSection />
        </div>
      </div>
    </main>
  );
}

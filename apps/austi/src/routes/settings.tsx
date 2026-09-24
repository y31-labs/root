import { createFileRoute } from '@tanstack/react-router';
import { Label } from '@workspace/ui/components/ui/label';
import { type ReactNode } from 'react';

import { ThemeSelect } from '#/components/settings/theme-select';
import { Page, Section } from '#/features/maintenance/components';

export const Route = createFileRoute('/settings')({
  staticData: { breadcrumb: 'Settings' },
  head: () => ({ meta: [{ title: 'Settings · Austi' }] }),
  component: Settings,
});

function Settings() {
  return (
    <Page title='Settings'>
      <Section title='Appearance'>
        <SettingRow label='Theme' htmlFor='appearance-theme'>
          <ThemeSelect id='appearance-theme' />
        </SettingRow>
      </Section>
    </Page>
  );
}

function SettingRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className='flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-3 py-1'>
      <Label htmlFor={htmlFor} className='font-normal'>
        {label}
      </Label>
      {children}
    </div>
  );
}

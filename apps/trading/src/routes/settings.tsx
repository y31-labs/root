import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  beforeLoad: () => ({ title: 'Settings' }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className='p-4 flex flex-col gap-6'>
      <p className='text-muted-foreground'>No settings available yet.</p>
    </div>
  );
}

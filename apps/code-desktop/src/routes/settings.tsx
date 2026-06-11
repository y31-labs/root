import { createFileRoute } from '@tanstack/react-router';

import { SettingsPage } from '#/views/settings-page';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

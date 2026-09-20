// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogsSettingsSection } from '#/components/settings/logs-settings-section';
import { createLocalApi } from '#/lib/local-api';
import { LocalApiProvider } from '#/providers/local-api-provider';

afterEach(cleanup);

describe('LogsSettingsSection', () => {
  it('opens the native logs folder from settings', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = createLocalApi(invoke);

    render(
      <LocalApiProvider api={api}>
        <LogsSettingsSection />
      </LocalApiProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('open_logs_folder', undefined));
  });
});

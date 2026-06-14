// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createLocalApi } from '#/lib/local-api';
import { LocalApiProvider } from '#/providers/local-api-provider';
import { SettingsPage } from '#/views/settings-page';

describe('settings page', () => {
  it('renders local readiness from an injected native API', async () => {
    const api = createLocalApi(async <T,>(command: string) => {
      if (command !== 'engine_health') throw new Error(`Unexpected command: ${command}`);
      return {
        available: true,
        version: 'codex-cli 1.0.0',
        authenticated: true,
        gitAvailable: true,
        dockerAvailable: true,
        appServerAvailable: true,
        browserToolsAvailable: true,
      } as T;
    });

    render(
      <LocalApiProvider api={api}>
        <SettingsPage />
      </LocalApiProvider>,
    );

    await waitFor(() => expect(screen.getByText('codex-cli 1.0.0')).toBeTruthy());
    expect(screen.getByText('Agent browser tools')).toBeTruthy();
    expect(screen.queryByText('GitHub repositories')).toBeNull();
  });
});

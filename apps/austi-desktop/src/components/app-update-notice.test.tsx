// @vitest-environment jsdom

import type { DownloadEvent } from '@tauri-apps/plugin-updater';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateNotice } from '#/components/app-update-notice';
import type { LocalApi } from '#/lib/local-api';
import { LocalApiProvider } from '#/providers/local-api-provider';

afterEach(cleanup);

const createUpdate = () => ({
  version: '0.2.0',
  close: vi.fn(async () => undefined),
  downloadAndInstall: vi.fn(async (onEvent?: (event: DownloadEvent) => void) => {
    onEvent?.({ event: 'Started', data: { contentLength: 100 } });
    onEvent?.({ event: 'Progress', data: { chunkLength: 100 } });
    onEvent?.({ event: 'Finished' });
  }),
});

const renderNotice = ({
  activeTaskCount,
  stopActiveCodexTasks = vi.fn(async () => undefined),
}: {
  activeTaskCount: () => Promise<number>;
  stopActiveCodexTasks?: () => Promise<void>;
}) => {
  const update = createUpdate();
  const relaunchApp = vi.fn(async () => undefined);
  const api = { activeCodexTaskCount: activeTaskCount, stopActiveCodexTasks } as LocalApi;

  render(
    <LocalApiProvider api={api}>
      <AppUpdateNotice
        enabled
        checkForUpdate={vi.fn(async () => update)}
        relaunchApp={relaunchApp}
      />
    </LocalApiProvider>,
  );

  return { relaunchApp, stopActiveCodexTasks, update };
};

describe('AppUpdateNotice', () => {
  it('installs and restarts when no Codex tasks are running', async () => {
    const activeTaskCount = vi.fn(async () => 0);
    const { relaunchApp, update } = renderNotice({ activeTaskCount });

    fireEvent.click(await screen.findByRole('button', { name: 'Update' }));

    await waitFor(() => expect(update.downloadAndInstall).toHaveBeenCalledOnce());
    await waitFor(() => expect(relaunchApp).toHaveBeenCalledOnce());
    expect(activeTaskCount).toHaveBeenCalledTimes(2);
  });

  it('lets the user wait or stop active tasks before updating', async () => {
    const activeTaskCount = vi
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValue(0);
    const stopActiveCodexTasks = vi.fn(async () => undefined);
    const { relaunchApp, update } = renderNotice({
      activeTaskCount,
      stopActiveCodexTasks,
    });

    const updateButton = await screen.findByRole('button', { name: 'Update' });
    fireEvent.click(updateButton);
    expect(await screen.findByText('Codex tasks are running')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Wait' }));
    await waitFor(() => expect(screen.queryByText('Codex tasks are running')).toBeNull());
    expect(update.downloadAndInstall).not.toHaveBeenCalled();

    fireEvent.click(updateButton);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop tasks and update' }));

    await waitFor(() => expect(stopActiveCodexTasks).toHaveBeenCalledOnce());
    await waitFor(() => expect(update.downloadAndInstall).toHaveBeenCalledOnce());
    await waitFor(() => expect(relaunchApp).toHaveBeenCalledOnce());
  });
});

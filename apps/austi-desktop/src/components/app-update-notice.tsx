import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useCallback, useEffect, useState } from 'react';

import { AppUpdateNoticeView, type AppUpdatePhase } from '#/components/app-update-notice-view';
import { useLocalApi } from '#/providers/local-api-provider';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1_000;
const UPDATE_CHECK_COOLDOWN_MS = 5 * 60 * 1_000;
const UPDATE_CHECK_TIMEOUT_MS = 15_000;

interface AvailableUpdate {
  close: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
}

interface AppUpdateNoticeProps {
  enabled?: boolean;
  checkForUpdate?: () => Promise<AvailableUpdate | null>;
  relaunchApp?: () => Promise<void>;
}

const checkForAustiUpdate = () => check({ timeout: UPDATE_CHECK_TIMEOUT_MS });

export function AppUpdateNotice({
  enabled = import.meta.env.PROD,
  checkForUpdate = checkForAustiUpdate,
  relaunchApp = relaunch,
}: AppUpdateNoticeProps) {
  const api = useLocalApi();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [phase, setPhase] = useState<AppUpdatePhase>('available');
  const [activeTaskCount, setActiveTaskCount] = useState<number | null>(null);
  const [stoppingTasks, setStoppingTasks] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let availableUpdate: AvailableUpdate | null = null;
    let checking = false;
    let lastCheckAt = 0;

    const checkNow = async () => {
      const now = Date.now();
      if (checking || availableUpdate || now - lastCheckAt < UPDATE_CHECK_COOLDOWN_MS) {
        return;
      }

      checking = true;
      lastCheckAt = now;
      try {
        const nextUpdate = await checkForUpdate();
        if (!active) {
          await nextUpdate?.close();
          return;
        }
        if (nextUpdate) {
          availableUpdate = nextUpdate;
          setUpdate(nextUpdate);
        }
      } catch (nextError) {
        console.error('Could not check for an Austi update.', nextError);
      } finally {
        checking = false;
      }
    };

    void checkNow();
    const interval = window.setInterval(() => void checkNow(), UPDATE_CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void availableUpdate?.close().catch(() => undefined);
      availableUpdate = null;
    };
  }, [checkForUpdate, enabled]);

  const promptForRunningTasks = useCallback(
    async (continueWhenIdle: () => Promise<void>) => {
      const taskCount = await api.activeCodexTaskCount();
      if (taskCount > 0) {
        setActiveTaskCount(taskCount);
        return;
      }
      await continueWhenIdle();
    },
    [api],
  );

  const restart = useCallback(async () => {
    setError('');
    try {
      await relaunchApp();
    } catch (nextError) {
      setError(errorMessage(nextError, 'Austi could not restart.'));
    }
  }, [relaunchApp]);

  const downloadAndRestart = useCallback(async () => {
    if (!update) return;
    setError('');
    setPhase('downloading');
    try {
      await update.downloadAndInstall();
      setPhase('ready');
      await promptForRunningTasks(restart);
    } catch (nextError) {
      setPhase('available');
      setError(errorMessage(nextError, 'Austi could not install the update.'));
    }
  }, [promptForRunningTasks, restart, update]);

  const beginUpdate = async () => {
    if (phase === 'downloading') return;
    setError('');
    try {
      await promptForRunningTasks(phase === 'ready' ? restart : downloadAndRestart);
    } catch (nextError) {
      setError(errorMessage(nextError, 'Austi could not check active Codex tasks.'));
    }
  };

  const stopTasksAndUpdate = async () => {
    setStoppingTasks(true);
    setError('');
    try {
      await api.stopActiveCodexTasks();
      setActiveTaskCount(null);
      if (phase === 'ready') await restart();
      else await downloadAndRestart();
    } catch (nextError) {
      setActiveTaskCount(null);
      setError(errorMessage(nextError, 'Codex tasks could not be stopped.'));
    } finally {
      setStoppingTasks(false);
    }
  };

  if (!update) return null;

  return (
    <AppUpdateNoticeView
      activeTaskCount={activeTaskCount}
      error={error}
      onBeginUpdate={() => void beginUpdate()}
      onDismissRunningTasks={() => setActiveTaskCount(null)}
      onStopTasksAndUpdate={() => void stopTasksAndUpdate()}
      phase={phase}
      stoppingTasks={stoppingTasks}
    />
  );
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

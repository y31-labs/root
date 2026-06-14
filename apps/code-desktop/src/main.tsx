import { RouterProvider } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initializeLogging, registerGlobalLogging } from '#/lib/logging';
import { createLocalApi, localApi } from '#/lib/local-api';
import { LocalApiProvider } from '#/providers/local-api-provider';
import { router } from '#/router';

import '@workspace/ui/globals.css';
import '#/theme-overrides.css';

initializeLogging();
registerGlobalLogging();

const api = window.__CODE_TEST_INVOKE__
  ? createLocalApi((command, args) => window.__CODE_TEST_INVOKE__!(command, args))
  : localApi;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div
      data-tauri-drag-region
      className='fixed inset-x-0 top-0 z-50 h-10'
      aria-hidden='true'
      onMouseDown={() => void getCurrentWindow().startDragging()}
    />
    <LocalApiProvider api={api}>
      <RouterProvider router={router} />
    </LocalApiProvider>
  </StrictMode>,
);

declare global {
  interface Window {
    __CODE_TEST_INVOKE__?: (
      command: string,
      args?: Record<string, unknown>,
    ) => Promise<unknown>;
    __CODE_TEST_SELECT_DIRECTORY__?: () => Promise<string | null>;
  }
}

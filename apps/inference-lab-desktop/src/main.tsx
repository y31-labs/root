import { RouterProvider } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { LocalApiProvider } from '#/providers/local-api-provider';
import { router } from '#/router';

import '@workspace/ui/globals.css';
import '#/theme-overrides.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div
      data-tauri-drag-region
      className='fixed inset-x-0 top-0 z-50 h-10'
      aria-hidden='true'
      onMouseDown={() => void getCurrentWindow().startDragging()}
    />
    <LocalApiProvider>
      <RouterProvider router={router} />
    </LocalApiProvider>
  </StrictMode>,
);

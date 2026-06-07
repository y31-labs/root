import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createConvexReactQueryStack } from '@workspace/web-foundation/convex-react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DesktopConvexProvider } from '#/providers/desktop-convex-provider';
import { router } from '#/router';

import '@workspace/ui/globals.css';
import '#/theme-overrides.css';

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) throw new Error('VITE_CONVEX_URL is not configured');
const { queryClient, convexQueryClient } = createConvexReactQueryStack(() => convexUrl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div
      data-tauri-drag-region
      className='fixed inset-x-0 top-0 z-50 h-10'
      aria-hidden='true'
      onMouseDown={() => void getCurrentWindow().startDragging()}
    />
    <DesktopConvexProvider convexQueryClient={convexQueryClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
      </QueryClientProvider>
    </DesktopConvexProvider>
  </StrictMode>,
);

import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

const config = defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '#': resolve(__dirname, 'src'),
      '#convex': resolve(__dirname, 'convex'),
      '@workspace/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  optimizeDeps: {
    include: [
      '@workos/authkit-tanstack-react-start > @workos/authkit-session > @workos-inc/node > eventemitter3',
    ],
  },
});

export default config;


import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const generatedAppDevCsp = (): Plugin => ({
  name: 'generated-app-dev-csp',
  apply: 'serve',
  transformIndexHtml: {
    order: 'pre',
    handler: (html, context) =>
      context.path === '/generated-app-frame.html'
        ? html.replace("connect-src 'none'", 'connect-src ws://localhost:1421')
        : html,
  },
});

export default defineConfig({
  envDir: '../..',
  clearScreen: false,
  server: {
    cors: {
      origin: 'null',
    },
    port: 1421,
    strictPort: true,
  },
  plugins: [tailwindcss(), tanstackRouter(), react(), generatedAppDevCsp()],
  resolve: {
    alias: {
      '#': resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    rolldownOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        generatedAppFrame: resolve(import.meta.dirname, 'generated-app-frame.html'),
      },
    },
  },
});

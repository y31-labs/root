import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  envDir: '../..',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  plugins: [tailwindcss(), tanstackRouter(), react()],
  resolve: {
    alias: {
      '#': resolve(import.meta.dirname, 'src'),
    },
  },
});

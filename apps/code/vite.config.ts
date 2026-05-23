import { devtools } from '@tanstack/devtools-vite';
import { defineWebFoundationViteConfig } from '@workspace/web-foundation/vite';
import { defineConfig, mergeConfig } from 'vite';

export default defineConfig(
  mergeConfig(
    defineWebFoundationViteConfig({
      rootDir: import.meta.dirname,
      port: 3000,
      convexAlias: { name: '#convex', path: 'convex' },
      extraPlugins: [devtools()],
    }),
    {},
  ),
);

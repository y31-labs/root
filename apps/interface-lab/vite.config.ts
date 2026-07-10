import { defineWebFoundationViteConfig } from '@workspace/web-foundation/vite';
import { defineConfig, mergeConfig } from 'vite';

export default defineConfig(
  mergeConfig(
    defineWebFoundationViteConfig({
      rootDir: import.meta.dirname,
      port: 3010,
      spa: false,
    }),
    { envDir: '../..' },
  ),
);

import { resolve } from 'node:path';

import { defineWebFoundationViteConfig } from '@workspace/web-foundation/vite';
import { defineConfig, loadEnv, mergeConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const envDir = resolve(import.meta.dirname, '../..');

  // AuthKit reads process.env; Vite's envDir alone only loads import.meta.env.
  // Keep private WorkOS values server-side and preserve deployment overrides.
  for (const [key, value] of Object.entries(loadEnv(mode, envDir, 'WORKOS_'))) {
    process.env[key] ??= value;
  }

  return mergeConfig(
    defineWebFoundationViteConfig({
      rootDir: import.meta.dirname,
      port: 3000,
      convexAlias: { name: '#convex', path: '../../convex' },
      spa: false,
    }),
    { envDir, server: { strictPort: true } },
  );
});

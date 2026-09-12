import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '#convex': fileURLToPath(new URL('./convex', import.meta.url)) } },
  test: { include: ['tests/convex/**/*.test.ts'], environment: 'node' },
});

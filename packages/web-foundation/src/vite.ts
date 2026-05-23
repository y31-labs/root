import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { PluginOption, UserConfig } from 'vite';

const requireFromPkg = createRequire(import.meta.url);
const eventemitter3PkgDir = dirname(
  requireFromPkg.resolve('eventemitter3/package.json'),
);
const eventemitter3Esm = resolve(eventemitter3PkgDir, 'dist/eventemitter3.esm.js');

export interface WebFoundationViteOptions {
  /** `import.meta.dirname` or `__dirname` of the app's `vite.config.ts`. */
  rootDir: string;
  port: number;
  /** App source alias, e.g. `{ name: '#', path: 'src' }`. */
  appSrcAlias?: { name: string; path: string };
  /** Optional Convex folder alias, e.g. `{ name: '#convex', path: 'convex' }`. */
  convexAlias?: { name: string; path: string };
  /** Extra Vite plugins (e.g. TanStack Devtools) inserted after shared plugins. */
  extraPlugins?: PluginOption[];
}

export function defineWebFoundationViteConfig(
  options: WebFoundationViteOptions,
): UserConfig {
  const {
    rootDir,
    port,
    appSrcAlias = { name: '#', path: 'src' },
    convexAlias,
    extraPlugins = [],
  } = options;

  const alias: Record<string, string> = {
    [appSrcAlias.name]: resolve(rootDir, appSrcAlias.path),
    eventemitter3: eventemitter3Esm,
  };

  if (convexAlias) {
    alias[convexAlias.name] = resolve(rootDir, convexAlias.path);
  }

  return {
    server: { port },
    plugins: [
      tailwindcss(),
      tanstackStart({ spa: { enabled: true } }),
      viteReact(),
      ...extraPlugins,
    ],
    resolve: {
      tsconfigPaths: true,
      alias,
    },
  };
}


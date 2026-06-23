import { defineConfig } from 'oxfmt';

export default defineConfig({
  semi: true,
  singleQuote: true,
  jsxSingleQuote: true,
  sortImports: true,
  ignorePatterns: [
    '**/.artifacts/**',
    '**/.astro/**',
    '**/.convex/**',
    '**/.tanstack/**',
    '**/convex/_generated/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/playwright-report/**',
    '**/routeTree.gen.ts',
    '**/src-tauri/gen/**',
    '**/target/**',
    '**/test-results/**',
    '**/*.gen.ts',
  ],
});

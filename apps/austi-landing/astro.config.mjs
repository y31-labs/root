import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Astro 6 uses Vite 7, so keep the React integration on its Vite 7-compatible v5 major.
export default defineConfig({
  integrations: [react()],
  output: 'static',
  site: 'https://austi.works',
});

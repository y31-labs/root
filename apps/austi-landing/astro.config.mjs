import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Astro 6 uses Vite 7, so keep the React integration on its Vite 7-compatible v5 major.
export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwindcss()], resolve: { dedupe: ['react', 'react-dom'] } },
  output: 'static',
  site: 'https://austi.works',
});

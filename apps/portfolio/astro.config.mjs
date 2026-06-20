import { fileURLToPath } from 'node:url';

import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));
const isProductionBuild = process.argv.includes('build');
const mode = isProductionBuild ? 'production' : 'development';
const loadedEnvironment = loadEnv(mode, projectDirectory, '');
const siteUrl = process.env.SITE_URL || loadedEnvironment.SITE_URL;

if (isProductionBuild && !siteUrl) {
  throw new Error('SITE_URL is required for production builds (for example, https://example.com).');
}

const site = new URL(siteUrl || 'http://localhost:4321');

if (!['http:', 'https:'].includes(site.protocol)) {
  throw new Error('SITE_URL must use the http or https protocol.');
}

export default defineConfig({
  site: site.origin,
  integrations: [sitemap()],
});

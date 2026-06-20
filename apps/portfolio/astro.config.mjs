import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const isProductionBuild = process.argv.includes('build');
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const vercelUrl = vercelHost ? `https://${vercelHost}` : undefined;
const siteUrl = process.env.SITE_URL || vercelUrl;

if (isProductionBuild && !siteUrl) {
  throw new Error(
    'SITE_URL is required for production builds unless Vercel system environment variables are exposed.',
  );
}

const site = new URL(siteUrl || 'http://localhost:4321');

if (!['http:', 'https:'].includes(site.protocol)) {
  throw new Error('SITE_URL must use the http or https protocol.');
}

export default defineConfig({
  site: site.origin,
  integrations: [sitemap()],
});

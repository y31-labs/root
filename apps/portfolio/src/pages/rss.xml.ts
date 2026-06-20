import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { getPublishedPosts } from '../lib/posts';
import { AUTHOR, SITE_DESCRIPTION, SITE_TITLE } from '../lib/site';

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error('SITE_URL is required to generate the RSS feed.');
  }

  const posts = await getPublishedPosts();

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: `/writing/${post.id}/`,
      author: AUTHOR.name,
    })),
    customData: '<language>en</language>',
  });
};

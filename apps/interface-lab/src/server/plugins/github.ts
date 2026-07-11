import { z } from 'zod';

import {
  githubPluginCallSchema,
  githubRepositoryListPrimitiveSchema,
  type RepositoryRanking,
} from '#/lib/plugin-contract';
import { fetchPluginJson } from '#/server/plugins/http';
import { definePlugin } from '#/server/plugins/plugin';

const repositoryResponseSchema = z.object({
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string().url(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  open_issues_count: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  language: z.string().nullable(),
  updated_at: z.string(),
});

const repositorySearchResponseSchema = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(repositoryResponseSchema),
});

const sortRepositories = (
  repositories: z.infer<typeof repositoryResponseSchema>[],
  ranking: RepositoryRanking,
) =>
  [...repositories].sort((left, right) => {
    if (ranking === 'stars') return right.stargazers_count - left.stargazers_count;
    if (ranking === 'forks') return right.forks_count - left.forks_count;
    if (ranking === 'size') return right.size - left.size;
    return Date.parse(right.updated_at) - Date.parse(left.updated_at);
  });

export const githubPlugin = definePlugin({
  id: 'github',
  name: 'GitHub repository explorer',
  description:
    'Searches real public repositories and ranks them by stars, forks, recent updates, or repository size.',
  inputDescription:
    '{ query: "react", ranking: "stars", limit: 10 } where query may be "" for a broad ranking, ranking is "stars" | "forks" | "updated" | "size", and limit is an integer from 5 to 20',
  resultDescription:
    '{ plugin: "github", kind: "repository-list", query, ranking, totalCount, scope, repositories: [{ fullName, description, url, stars, forks, openIssues, sizeKb, language, updatedAt }] }',
  inputSchema: githubPluginCallSchema.shape.input,
  execute: async ({ query, ranking, limit }) => {
    const terms = [query];
    if (!query) terms.push(ranking === 'size' ? 'size:>1000000' : 'stars:>0');
    terms.push('is:public');

    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', terms.filter(Boolean).join(' '));
    url.searchParams.set('per_page', String(ranking === 'size' ? 100 : limit));
    if (ranking !== 'size') url.searchParams.set('sort', ranking);
    url.searchParams.set('order', 'desc');

    const result = repositorySearchResponseSchema.parse(await fetchPluginJson(url, 'GitHub'));
    const repositories = sortRepositories(result.items, ranking).slice(0, limit);
    const scope =
      ranking === 'size'
        ? `Largest by repository size among ${result.items.length} GitHub matches${
            query ? ` for “${query}”` : ' over 1 GB'
          }. GitHub supports size filtering but not global size sorting.`
        : `${result.total_count.toLocaleString('en')} public repositories match${
            query ? ` “${query}”` : ' this ranking'
          }.`;

    return githubRepositoryListPrimitiveSchema.parse({
      plugin: 'github',
      kind: 'repository-list',
      query,
      ranking,
      totalCount: result.total_count,
      scope,
      repositories: repositories.map((repository) => ({
        fullName: repository.full_name,
        description: repository.description,
        url: repository.html_url,
        stars: repository.stargazers_count,
        forks: repository.forks_count,
        openIssues: repository.open_issues_count,
        sizeKb: repository.size,
        language: repository.language,
        updatedAt: repository.updated_at,
      })),
    });
  },
});

import { v } from 'convex/values';
import { action } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

const MIN_QUERY_LENGTH = 2;
const PER_PAGE = 10;

// Unauthenticated GitHub API: ~60 requests/hour per IP.
type GitHubSearchItem = {
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  stargazers_count: number;
  default_branch: string;
  owner: { login: string };
};

type GitHubSearchResponse = {
  items: GitHubSearchItem[];
};

export type PublicRepoSearchResult = {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  description: string | null;
  stars: number;
};

export const searchPublicRepos = action({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<PublicRepoSearchResult[]> => {
    await verifyIdentity(ctx);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return [];
    }

    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', trimmed);
    url.searchParams.set('sort', 'stars');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(PER_PAGE));

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 403) {
      throw new Error('GitHub rate limit reached. Try again in a few minutes.');
    }

    if (!response.ok) {
      throw new Error(`GitHub search failed (${response.status})`);
    }

    const data = (await response.json()) as GitHubSearchResponse;

    return data.items
      .filter((item) => !item.private)
      .map((item) => ({
        owner: item.owner.login,
        name: item.name,
        fullName: item.full_name,
        defaultBranch: item.default_branch,
        description: item.description,
        stars: item.stargazers_count,
      }));
  },
});


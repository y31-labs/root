'use node';

import { defaultManifest } from '@workspace/code-agent-contracts/manifest';
import { v } from 'convex/values';

import { internal } from '#convex/_generated/api';
import type { Doc } from '#convex/_generated/dataModel';
import { action, type ActionCtx } from '#convex/_generated/server';
import {
  createAppJwt,
  fetchInstallation,
  getGitHubAppConfig,
  getInstallationAccessToken,
  githubAppHeaders,
  githubInstallationHeaders,
  isGitHubAppConfigured,
} from '#convex/githubAuth';
import { verifyIdentity } from '#convex/utils';

const PER_PAGE = 10;
const MAX_INSTALLATION_PAGES = 3;

type GitHubSearchItem = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  stargazers_count: number;
  default_branch: string;
  owner: { login: string };
};

type GitHubSearchResponse = {
  items: GitHubSearchItem[];
};

type GitHubInstallationRepoItem = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  stargazers_count: number;
  default_branch: string;
  owner: { login: string };
};

type GitHubInstallationReposResponse = {
  repositories: GitHubInstallationRepoItem[];
  total_count: number;
};

export type RepoSearchResult = {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  stars: number;
  private: boolean;
  publicId: string;
  installationId?: number;
};

export type RepoSearchResponse = RepoSearchResult[];

export type VerificationManifestProposal = {
  baseCommitSha: string;
  manifest: ReturnType<typeof defaultManifest>;
  detectedScripts: string[];
};

type CloneSource = {
  owner: string;
  name: string;
  cloneUrl: string;
  token?: string;
};

export const completeInstallationSetup = action({
  args: { installationId: v.number() },
  handler: async (ctx, { installationId }) => {
    const identity = await verifyIdentity(ctx);

    if (!isGitHubAppConfigured()) {
      throw new Error('GitHub App is not configured');
    }

    const installation = await fetchInstallation(installationId);

    await ctx.runMutation(internal.githubInstallations.upsertInternal, {
      userId: identity.subject,
      installationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    });

    return { installationId: installation.id };
  },
});

export const searchRepos = action({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<RepoSearchResponse> => {
    const identity = await verifyIdentity(ctx);
    const trimmed = query.trim();

    const [installation, publicRepos, syncedFullNamesList] = await Promise.all([
      searchInstallationRepos(ctx, identity.subject, trimmed),
      searchPublicReposInternal(trimmed),
      ctx.runQuery(internal.repos.listFullNamesByUserIdInternal, {
        userId: identity.subject,
      }),
    ]);

    const syncedFullNames = new Set(syncedFullNamesList);
    const uniqueRepos = new Map(
      [...installation, ...publicRepos].map((repo) => [repo.publicId, repo]),
    );

    return [...uniqueRepos.values()].filter((repo) => !syncedFullNames.has(repo.fullName));
  },
});

export const proposeVerificationManifest = action({
  args: { repoId: v.id('repos') },
  handler: async (ctx, { repoId }): Promise<VerificationManifestProposal> => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.runQuery(internal.repos.getForUserInternal, {
      id: repoId,
      userId: identity.subject,
    });
    if (!repo) throw new Error('Repository not found');

    const token = await tokenForRepo(ctx, repo);
    const headers = token ? githubInstallationHeaders(token) : githubAppOrPublicHeaders();
    const branchResponse = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.name}/branches/${encodeURIComponent(repo.defaultBranch)}`,
      { headers },
    );
    if (!branchResponse.ok) {
      throw new Error(`Failed to resolve default branch (${branchResponse.status})`);
    }
    const branch = (await branchResponse.json()) as { commit: { sha: string } };

    const packageResponse = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/package.json?ref=${branch.commit.sha}`,
      { headers },
    );
    if (!packageResponse.ok) {
      throw new Error(
        'MVP supports Bun JavaScript/TypeScript repositories with a root package.json',
      );
    }
    const packageFile = (await packageResponse.json()) as { content: string; encoding: string };
    if (packageFile.encoding !== 'base64') throw new Error('Unexpected package.json encoding');
    const packageJson = JSON.parse(Buffer.from(packageFile.content, 'base64').toString('utf8')) as {
      scripts?: Record<string, string>;
    };
    const scripts = packageJson.scripts ?? {};

    return {
      baseCommitSha: branch.commit.sha,
      manifest: defaultManifest(process.env.CODE_AGENT_BUN_VERSION ?? '1.3.5', scripts),
      detectedScripts: Object.keys(scripts).sort(),
    };
  },
});

export const getCloneSource = action({
  args: { repoId: v.id('repos') },
  handler: async (ctx, { repoId }): Promise<CloneSource> => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.runQuery(internal.repos.getForUserInternal, {
      id: repoId,
      userId: identity.subject,
    });
    if (!repo) throw new Error('Repository not found');
    return {
      owner: repo.owner,
      name: repo.name,
      cloneUrl: `https://github.com/${repo.owner}/${repo.name}.git`,
      token: await tokenForRepo(ctx, repo),
    };
  },
});

async function searchInstallationRepos(ctx: ActionCtx, userId: string, query: string) {
  const installations = await ctx.runQuery(internal.githubInstallations.listByUserIdInternal, {
    userId,
  });

  if (installations.length === 0) return [];

  const normalizedQuery = query.toLowerCase();
  const results: RepoSearchResult[] = [];

  for (const installation of installations) {
    const token = await getInstallationAccessToken(installation.installationId);
    const repos = await listInstallationRepos(token);

    for (const repo of repos) {
      if (!repo.full_name.toLowerCase().includes(normalizedQuery)) continue;

      results.push(mapInstallationRepo(repo, installation.installationId));
    }
  }

  return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function tokenForRepo(ctx: ActionCtx, repo: Doc<'repos'>): Promise<string | undefined> {
  if (repo.visibility.type === 'public') return undefined;
  const installation: Doc<'githubInstallations'> | null = await ctx.runQuery(
    internal.githubInstallations.getByIdInternal,
    {
      id: repo.visibility.githubInstallationId,
    },
  );
  if (!installation) throw new Error('GitHub installation not found');
  return getInstallationAccessToken(installation.installationId);
}

function githubAppOrPublicHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (isGitHubAppConfigured()) {
    const { appId, privateKey } = getGitHubAppConfig();
    Object.assign(headers, githubAppHeaders(createAppJwt(appId, privateKey)));
  }
  return headers;
}

async function listInstallationRepos(token: string) {
  const repos: GitHubInstallationRepoItem[] = [];

  for (let page = 1; page <= MAX_INSTALLATION_PAGES; page += 1) {
    const url = new URL('https://api.github.com/installation/repositories');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      headers: githubInstallationHeaders(token),
    });

    if (!response.ok) {
      throw new Error(`Failed to list installation repositories (${response.status})`);
    }

    const data = (await response.json()) as GitHubInstallationReposResponse;
    repos.push(...data.repositories);

    if (repos.length >= data.total_count || data.repositories.length < 100) break;
  }

  return repos;
}

async function searchPublicReposInternal(query: string): Promise<RepoSearchResult[]> {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(PER_PAGE));

  const headers = githubAppOrPublicHeaders();

  const response = await fetch(url.toString(), { headers });

  if (response.status === 403) {
    throw new Error('GitHub rate limit reached. Try again in a few minutes.');
  }

  if (!response.ok) {
    throw new Error(`GitHub search failed (${response.status})`);
  }

  const data = (await response.json()) as GitHubSearchResponse;

  return data.items.filter((item) => !item.private).map(mapInstallationRepo);
}

function mapInstallationRepo(
  repo: GitHubInstallationRepoItem,
  installationId?: number,
): RepoSearchResult {
  return {
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    stars: repo.stargazers_count,
    private: repo.private,
    publicId: repo.id.toString(),
    installationId: repo.private ? installationId : undefined,
  };
}

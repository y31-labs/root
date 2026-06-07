import { parseVerificationManifest } from '@workspace/code-agent-contracts/manifest';
import { v } from 'convex/values';

import type { Id } from '#convex/_generated/dataModel';
import { internalQuery, mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const list = query({
  args: {},
  handler: (ctx) =>
    verifyIdentity(ctx).then((identity) =>
      ctx.db
        .query('repos')
        .withIndex('by_user_owner_name', (q) => q.eq('userId', identity.subject))
        .collect(),
    ),
});

export const listFullNamesByUserIdInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const repos = await ctx.db
      .query('repos')
      .withIndex('by_user_owner_name', (q) => q.eq('userId', userId))
      .collect();

    return repos.map((repo) => `${repo.owner}/${repo.name}`);
  },
});

export const getForUserInternal = internalQuery({
  args: { id: v.id('repos'), userId: v.string() },
  handler: async (ctx, { id, userId }) => {
    const repo = await ctx.db.get(id);
    return repo?.userId === userId ? repo : null;
  },
});

export const getByIdInternal = internalQuery({
  args: { id: v.id('repos') },
  handler: (ctx, { id }) => ctx.db.get(id),
});

export const create = mutation({
  args: {
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    selected: v.boolean(),
    publicId: v.string(),
    private: v.boolean(),
    installationId: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { owner, name, defaultBranch, selected, publicId, private: isPrivate, installationId },
  ) => {
    const identity = await verifyIdentity(ctx);

    const repos = await ctx.db
      .query('repos')
      .withIndex('by_user_owner_name', (q) => q.eq('userId', identity.subject))
      .collect();
    const existing = repos.find((r) => r.owner === owner && r.name === name);

    if (existing) return existing._id;

    let visibility:
      | { type: 'public' }
      | { type: 'private'; githubInstallationId: Id<'githubInstallations'> };

    if (isPrivate) {
      if (installationId === undefined) {
        throw new Error('GitHub installation not found');
      }

      const installation = await ctx.db
        .query('githubInstallations')
        .withIndex('by_user_installationId', (q) =>
          q.eq('userId', identity.subject).eq('installationId', installationId),
        )
        .first();

      if (!installation) {
        throw new Error('GitHub installation not found');
      }

      visibility = {
        type: 'private',
        githubInstallationId: installation._id,
      };
    } else {
      visibility = { type: 'public' };
    }

    const id = await ctx.db.insert('repos', {
      owner,
      name,
      defaultBranch,
      selected,
      publicId,
      userId: identity.subject,
      visibility,
    });

    if (selected)
      await Promise.all(
        repos
          .filter((r) => r._id !== id && r.selected)
          .map((r) => ctx.db.patch('repos', r._id, { selected: false })),
      );

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id('repos') },
  handler: async (ctx, { id }) => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.db.get(id);
    if (repo?.userId !== identity.subject) {
      return { removed: false };
    }
    await ctx.db.delete(id);
    return { removed: true };
  },
});

export const select = mutation({
  args: { id: v.id('repos'), selected: v.boolean() },
  handler: async (ctx, { id, selected }) => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.db.get(id);
    if (repo?.userId !== identity.subject) return { updated: false };

    await ctx.db.patch(id, { selected });
    return { updated: true };
  },
});

export const approveManifest = mutation({
  args: {
    id: v.id('repos'),
    baseCommitSha: v.string(),
    manifest: v.any(),
  },
  handler: async (ctx, { id, baseCommitSha, manifest }) => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.db.get(id);
    if (repo?.userId !== identity.subject) throw new Error('Repository not found');

    const parsed = parseVerificationManifest(manifest);
    await ctx.db.patch(id, {
      manifest: parsed,
      manifestBaseSha: baseCommitSha,
      manifestApprovedAt: Date.now(),
    });
    return parsed;
  },
});

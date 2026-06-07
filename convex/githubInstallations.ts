import { v } from 'convex/values';

import { internalMutation, internalQuery, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const count = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    const installations = await ctx.db
      .query('githubInstallations')
      .withIndex('by_user_installationId', (q) => q.eq('userId', identity.subject))
      .collect();

    return installations.length;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    return ctx.db
      .query('githubInstallations')
      .withIndex('by_user_installationId', (q) => q.eq('userId', identity.subject))
      .collect();
  },
});

export const listByUserIdInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query('githubInstallations')
      .withIndex('by_user_installationId', (q) => q.eq('userId', userId))
      .collect(),
});

export const getByIdInternal = internalQuery({
  args: { id: v.id('githubInstallations') },
  handler: (ctx, { id }) => ctx.db.get(id),
});

export const upsertInternal = internalMutation({
  args: {
    userId: v.string(),
    installationId: v.number(),
    accountLogin: v.string(),
    accountType: v.union(v.literal('User'), v.literal('Organization')),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('githubInstallations')
      .withIndex('by_user_installationId', (q) =>
        q.eq('userId', args.userId).eq('installationId', args.installationId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accountLogin: args.accountLogin,
        accountType: args.accountType,
      });
      return existing._id;
    }

    return ctx.db.insert('githubInstallations', args);
  },
});

export const removeByInstallationIdInternal = internalMutation({
  args: { installationId: v.number() },
  handler: async (ctx, { installationId }) => {
    const installations = await ctx.db
      .query('githubInstallations')
      .withIndex('by_installationId', (q) => q.eq('installationId', installationId))
      .collect();

    const installationIds = new Set(installations.map((i) => i._id));

    await Promise.all(installations.map((installation) => ctx.db.delete(installation._id)));

    const repos = await ctx.db.query('repos').collect();
    await Promise.all(
      repos
        .filter(
          (repo) =>
            repo.visibility.type === 'private' &&
            installationIds.has(repo.visibility.githubInstallationId),
        )
        .map((repo) => ctx.db.delete(repo._id)),
    );
  },
});

export const removeRepoByPublicIdInternal = internalMutation({
  args: {
    publicId: v.string(),
    owner: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { publicId, owner, name }) => {
    const repos = await ctx.db.query('repos').collect();
    const matches = repos.filter(
      (repo) => repo.publicId === publicId || (repo.owner === owner && repo.name === name),
    );

    await Promise.all(matches.map((repo) => ctx.db.delete(repo._id)));
  },
});

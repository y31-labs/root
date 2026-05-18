import { v } from 'convex/values';
import { mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const list = query({
  args: {},
  handler: async (ctx) => {
    await verifyIdentity(ctx);
    return await ctx.db.query('repos').order('desc').collect();
  },
});

export const create = mutation({
  args: {
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    installationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await verifyIdentity(ctx);
    const now = Date.now();
    return await ctx.db.insert('repos', {
      owner: args.owner,
      name: args.name,
      defaultBranch: args.defaultBranch,
      installationId: args.installationId,
      createdBy: identity.subject,
      createdAt: now,
    });
  },
});

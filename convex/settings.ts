import { v } from 'convex/values';

import { mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    return ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first();
  },
});

export const setDefaultEngine = mutation({
  args: { engine: v.literal('codex-local') },
  handler: async (ctx, { engine }) => {
    const identity = await verifyIdentity(ctx);
    const existing = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first();
    const value = { userId: identity.subject, defaultEngine: engine, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return ctx.db.insert('userSettings', value);
  },
});

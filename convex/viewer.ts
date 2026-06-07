import { v } from 'convex/values';

import { mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .unique();

    return {
      firstName: profile?.firstName ?? identity.givenName ?? null,
      lastName: profile?.lastName ?? identity.familyName ?? null,
      email: profile?.email ?? identity.email ?? null,
      profilePictureUrl: profile?.profilePictureUrl ?? identity.pictureUrl ?? null,
    };
  },
});

export const syncProfile = mutation({
  args: {
    firstName: v.union(v.string(), v.null()),
    lastName: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    profilePictureUrl: v.union(v.string(), v.null()),
  },
  handler: async (ctx, profile) => {
    const identity = await verifyIdentity(ctx);
    const existing = await ctx.db
      .query('userProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .unique();
    const value = { ...profile, userId: identity.subject, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }

    return ctx.db.insert('userProfiles', value);
  },
});

import { v } from 'convex/values';

import { mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    return ctx.db
      .query('desktopRegistrations')
      .withIndex('by_user_lastSeenAt', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .collect();
  },
});

export const heartbeat = mutation({
  args: {
    installationId: v.string(),
    name: v.string(),
    appVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyIdentity(ctx);
    const existing = await ctx.db
      .query('desktopRegistrations')
      .withIndex('by_user_installationId', (q) =>
        q.eq('userId', identity.subject).eq('installationId', args.installationId),
      )
      .first();
    const value = {
      userId: identity.subject,
      installationId: args.installationId,
      name: args.name,
      platform: 'macos' as const,
      appVersion: args.appVersion,
      lastSeenAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return ctx.db.insert('desktopRegistrations', value);
  },
});

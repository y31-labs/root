import { components } from '#convex/_generated/api';
import { query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';
import { paginationOptsValidator } from 'convex/server';

export const listThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await verifyIdentity(ctx);
    return await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId: identity.subject,
      paginationOpts,
    });
  },
});

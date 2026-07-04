import { query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const graph = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    const repos = await ctx.db
      .query('repos')
      .withIndex('by_user_owner_name', (q) => q.eq('userId', identity.subject))
      .collect();
    const repo = repos.find((repo) => repo.selected);

    if (!repo) return null;

    const [nodes, edges] = await Promise.all([
      ctx.db
        .query('flowNode')
        .withIndex('by_repository', (q) => q.eq('repositoryId', repo._id))
        .collect(),
      ctx.db
        .query('flowEdge')
        .withIndex('by_repository', (q) => q.eq('repositoryId', repo._id))
        .collect(),
    ]);

    return { nodes, edges };
  },
});

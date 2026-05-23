import type {
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from '#convex/_generated/server';

export const verifyIdentity = async (
  ctx: QueryCtx | MutationCtx | ActionCtx,
) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');
  return identity;
};

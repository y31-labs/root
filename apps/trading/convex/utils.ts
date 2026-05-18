import type { ActionCtx, MutationCtx, QueryCtx } from '#convex/_generated/server';

export const verifyIdentity = async (ctx: QueryCtx | MutationCtx | ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');

  return identity;
};

export namespace Time {
  export const SECOND = 1000;
  export const MINUTE = 60 * SECOND;
  export const HOUR = 60 * MINUTE;
  export const DAY = 24 * HOUR;
  export const WEEK = 7 * DAY;
}

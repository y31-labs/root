import { v } from 'convex/values';
import { action } from '#convex/_generated/server';
import { internal } from '#convex/_generated/api';

export const executeStub = action({
  args: { runId: v.id('runs') },
  handler: async (ctx, { runId }) => {
    await ctx.runMutation(internal.runs.executeStubWork, { runId });
  },
});

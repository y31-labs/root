import { v } from 'convex/values';
import { mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const listForRepo = query({
  args: { repoId: v.id('repos') },
  handler: async (ctx, { repoId }) => {
    await verifyIdentity(ctx);
    return await ctx.db
      .query('tickets')
      .withIndex('by_repo_created', (q) => q.eq('repoId', repoId))
      .order('desc')
      .collect();
  },
});

export const get = query({
  args: { ticketId: v.id('tickets') },
  handler: async (ctx, { ticketId }) => {
    await verifyIdentity(ctx);
    return await ctx.db.get(ticketId);
  },
});

export const create = mutation({
  args: {
    repoId: v.id('repos'),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyIdentity(ctx);
    const now = Date.now();
    const ticketId = await ctx.db.insert('tickets', {
      repoId: args.repoId,
      createdBy: identity.subject,
      title: args.title,
      body: args.body,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('threads', {
      ticketId,
      createdAt: now,
    });
    return ticketId;
  },
});

export const update = mutation({
  args: {
    ticketId: v.id('tickets'),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    status: v.optional(v.union(v.literal('open'), v.literal('in_progress'), v.literal('done'))),
  },
  handler: async (ctx, { ticketId, ...patch }) => {
    const identity = await verifyIdentity(ctx);
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.createdBy !== identity.subject) {
      throw new Error('Forbidden');
    }
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.title !== undefined) updates.title = patch.title;
    if (patch.body !== undefined) updates.body = patch.body;
    if (patch.status !== undefined) updates.status = patch.status;
    await ctx.db.patch(ticketId, updates);
  },
});

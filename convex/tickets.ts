import { v } from 'convex/values';

import { mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    return ctx.db
      .query('tickets')
      .withIndex('by_user_updatedAt', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .collect();
  },
});

export const get = query({
  args: { id: v.id('tickets') },
  handler: async (ctx, { id }) => {
    const identity = await verifyIdentity(ctx);
    const ticket = await ctx.db.get(id);
    if (ticket?.userId !== identity.subject) return null;

    const runs = await ctx.db
      .query('runs')
      .withIndex('by_ticket_createdAt', (q) => q.eq('ticketId', id))
      .order('desc')
      .collect();

    return { ticket, runs };
  },
});

export const create = mutation({
  args: {
    repoId: v.id('repos'),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { repoId, title, body }) => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.db.get(repoId);
    if (repo?.userId !== identity.subject) throw new Error('Repository not found');
    if (!title.trim() || !body.trim()) throw new Error('Title and task are required');

    const now = Date.now();
    const ticketId = await ctx.db.insert('tickets', {
      userId: identity.subject,
      repoId,
      title: title.trim(),
      body: body.trim(),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    return ticketId;
  },
});

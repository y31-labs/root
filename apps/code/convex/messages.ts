import { v } from 'convex/values';
import { mutation, query } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

export const listForTicket = query({
  args: { ticketId: v.id('tickets') },
  handler: async (ctx, { ticketId }) => {
    await verifyIdentity(ctx);
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_ticket', (q) => q.eq('ticketId', ticketId))
      .first();
    if (!thread) return [];
    return await ctx.db
      .query('messages')
      .withIndex('by_thread_created', (q) => q.eq('threadId', thread._id))
      .order('asc')
      .collect();
  },
});

export const appendUser = mutation({
  args: {
    ticketId: v.id('tickets'),
    content: v.string(),
  },
  handler: async (ctx, { ticketId, content }) => {
    const identity = await verifyIdentity(ctx);
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.createdBy !== identity.subject) {
      throw new Error('Forbidden');
    }
    const thread = await ctx.db
      .query('threads')
      .withIndex('by_ticket', (q) => q.eq('ticketId', ticketId))
      .first();
    if (!thread) throw new Error('Thread not found');
    await ctx.db.insert('messages', {
      threadId: thread._id,
      role: 'user',
      content,
      createdAt: Date.now(),
    });
  },
});

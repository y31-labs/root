import { v } from 'convex/values';
import { internalMutation, mutation, query } from '#convex/_generated/server';
import { DEDUPE_MS, verifyIdentity } from '#convex/utils';

function isTerminal(
  s: 'queued' | 'running' | 'succeeded' | 'failed' | 'needs_input' | 'cancelled',
): boolean {
  return s === 'succeeded' || s === 'failed' || s === 'needs_input' || s === 'cancelled';
}

export const listByTicket = query({
  args: { ticketId: v.id('tickets') },
  handler: async (ctx, { ticketId }) => {
    await verifyIdentity(ctx);
    return await ctx.db
      .query('runs')
      .withIndex('by_ticket_created', (q) => q.eq('ticketId', ticketId))
      .order('desc')
      .collect();
  },
});

export const listEvents = query({
  args: { runId: v.id('runs') },
  handler: async (ctx, { runId }) => {
    await verifyIdentity(ctx);
    return await ctx.db
      .query('runEvents')
      .withIndex('by_run_created', (q) => q.eq('runId', runId))
      .order('asc')
      .collect();
  },
});

export const enqueue = mutation({
  args: {
    ticketId: v.id('tickets'),
    trigger: v.optional(v.union(v.literal('user'), v.literal('retry'), v.literal('webhook'))),
    clientRunKey: v.optional(v.string()),
  },
  handler: async (ctx, { ticketId, trigger, clientRunKey }) => {
    const identity = await verifyIdentity(ctx);
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.createdBy !== identity.subject) {
      throw new Error('Forbidden');
    }
    const repo = await ctx.db.get(ticket.repoId);
    if (!repo) throw new Error('Repo not found');

    const now = Date.now();
    if (clientRunKey) {
      const existing = await ctx.db
        .query('runs')
        .withIndex('by_ticket', (q) => q.eq('ticketId', ticketId))
        .collect();
      const dup = existing.find(
        (r) =>
          r.clientRunKey === clientRunKey && now - r.createdAt < DEDUPE_MS && !isTerminal(r.status),
      );
      if (dup) return dup._id;
    }

    return await ctx.db.insert('runs', {
      ticketId,
      status: 'queued',
      trigger: trigger ?? 'user',
      clientRunKey,
      createdAt: now,
    });
  },
});

export const requestCancel = mutation({
  args: { runId: v.id('runs') },
  handler: async (ctx, { runId }) => {
    const identity = await verifyIdentity(ctx);
    const run = await ctx.db.get(runId);
    if (!run) throw new Error('Run not found');
    const ticket = await ctx.db.get(run.ticketId);
    if (!ticket || ticket.createdBy !== identity.subject) {
      throw new Error('Forbidden');
    }
    if (isTerminal(run.status)) {
      return;
    }
    await ctx.db.patch(runId, { cancelRequestedAt: Date.now() });
  },
});

export const executeStubWork = internalMutation({
  args: { runId: v.id('runs') },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error('Run not found');

    if (isTerminal(run.status)) {
      return;
    }

    const now = Date.now();

    if (run.status === 'queued') {
      await ctx.db.patch(runId, {
        status: 'running',
        startedAt: now,
      });
      await ctx.db.insert('runEvents', {
        runId,
        type: 'stub',
        payload: JSON.stringify({ step: 'claimed' }),
        createdAt: now,
      });
    }

    const latest = await ctx.db.get(runId);
    if (!latest || latest.status !== 'running') return;

    const endStatus = latest.cancelRequestedAt ? 'cancelled' : 'succeeded';
    await ctx.db.patch(runId, {
      status: endStatus,
      finishedAt: Date.now(),
      error: endStatus === 'cancelled' ? 'Cancelled by user request' : undefined,
    });

    await ctx.db.insert('runEvents', {
      runId,
      type: 'stub',
      payload: JSON.stringify({
        step: 'finished',
        result: endStatus,
      }),
      createdAt: Date.now(),
    });
  },
});

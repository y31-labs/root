import {
  parseVerificationManifest,
  verificationGateKinds,
} from '@workspace/code-agent-contracts/manifest';
import {
  canTransitionRun,
  isVerifiedResult,
  summarizeVerification,
  type RunStatus,
} from '@workspace/code-agent-contracts/runs';
import { v } from 'convex/values';

import type { Id } from '#convex/_generated/dataModel';
import { mutation, query, type MutationCtx } from '#convex/_generated/server';
import { verifyIdentity } from '#convex/utils';

const DEFAULT_MAX_ATTEMPTS = 5;
const activeStatus = v.union(
  v.literal('preparing'),
  v.literal('implementing'),
  v.literal('verifying'),
  v.literal('repairing'),
);
const terminalStatus = v.union(
  v.literal('verified'),
  v.literal('failed'),
  v.literal('cancelled'),
  v.literal('needs_input'),
);
const gateKind = v.union(...verificationGateKinds.map((kind) => v.literal(kind)));

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyIdentity(ctx);
    return ctx.db
      .query('runs')
      .withIndex('by_user_createdAt', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .collect();
  },
});

export const get = query({
  args: { id: v.id('runs') },
  handler: async (ctx, { id }) => {
    const identity = await verifyIdentity(ctx);
    const run = await ctx.db.get(id);
    if (run?.userId !== identity.subject) return null;
    const gateResults = await ctx.db
      .query('gateResults')
      .withIndex('by_run_kind_attempt', (q) => q.eq('runId', id))
      .collect();
    return { run, gateResults };
  },
});

export const start = mutation({
  args: {
    ticketId: v.id('tickets'),
    baseCommitSha: v.string(),
    desktopInstallationId: v.string(),
    codexVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyIdentity(ctx);
    const ticket = await ctx.db.get(args.ticketId);
    if (ticket?.userId !== identity.subject) throw new Error('Ticket not found');
    const repo = await ctx.db.get(ticket.repoId);
    if (repo?.userId !== identity.subject) throw new Error('Repository not found');
    if (!repo.manifest || repo.manifestBaseSha !== args.baseCommitSha) {
      throw new Error('Approve a verification manifest for this commit before running');
    }
    const registration = await ctx.db
      .query('desktopRegistrations')
      .withIndex('by_user_installationId', (q) =>
        q.eq('userId', identity.subject).eq('installationId', args.desktopInstallationId),
      )
      .first();
    if (!registration) throw new Error('Desktop installation is not registered');

    const now = Date.now();
    const runId = await ctx.db.insert('runs', {
      userId: identity.subject,
      ticketId: ticket._id,
      repoId: repo._id,
      desktopInstallationId: args.desktopInstallationId,
      engine: 'codex-local',
      codexVersion: args.codexVersion,
      status: 'queued',
      baseCommitSha: args.baseCommitSha,
      manifestSnapshot: parseVerificationManifest(repo.manifest),
      attempt: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      verificationSummary: { required: 0, passed: 0, failed: 0, missing: 0 },
      changedFileCount: 0,
      createdAt: now,
    });
    await ctx.db.patch(ticket._id, { status: 'in_progress', updatedAt: now });
    return runId;
  },
});

export const transition = mutation({
  args: { id: v.id('runs'), status: activeStatus, attempt: v.optional(v.number()) },
  handler: async (ctx, { id, status, attempt }) => {
    const run = await ownedRun(ctx, id);
    if (!canTransitionRun(run.status as RunStatus, status)) {
      throw new Error(`Invalid run transition: ${run.status} -> ${status}`);
    }
    await ctx.db.patch(id, {
      status,
      attempt: attempt ?? run.attempt,
      startedAt: run.startedAt ?? Date.now(),
    });
  },
});

export const recordGate = mutation({
  args: {
    runId: v.id('runs'),
    kind: gateKind,
    status: v.union(v.literal('passed'), v.literal('failed'), v.literal('skipped')),
    required: v.boolean(),
    attempt: v.number(),
    durationMs: v.number(),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ownedRun(ctx, args.runId);
    return ctx.db.insert('gateResults', args);
  },
});

export const complete = mutation({
  args: {
    id: v.id('runs'),
    status: terminalStatus,
    changedFileCount: v.number(),
    hasLocalPatch: v.boolean(),
    terminalReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ownedRun(ctx, args.id);
    if (!canTransitionRun(run.status as RunStatus, args.status)) {
      throw new Error(`Invalid run transition: ${run.status} -> ${args.status}`);
    }
    const manifest = parseVerificationManifest(run.manifestSnapshot);
    const requiredKinds = verificationGateKinds.filter((kind) => manifest.gates[kind]?.required);
    const results = await ctx.db
      .query('gateResults')
      .withIndex('by_run_kind_attempt', (q) => q.eq('runId', args.id))
      .collect();
    const summary = summarizeVerification(requiredKinds, results);
    if (args.status === 'verified' && !isVerifiedResult(summary, args.hasLocalPatch)) {
      throw new Error(
        'Run cannot be verified without a local patch and all required gates passing',
      );
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      changedFileCount: args.changedFileCount,
      verificationSummary: summary,
      terminalReason: args.terminalReason,
      finishedAt: now,
    });
    await ctx.db.patch(run.ticketId, {
      status: args.status === 'verified' ? 'done' : 'open',
      updatedAt: now,
    });
  },
});

export const markInterrupted = mutation({
  args: { desktopInstallationId: v.string() },
  handler: async (ctx, { desktopInstallationId }) => {
    const identity = await verifyIdentity(ctx);
    const runs = await ctx.db
      .query('runs')
      .withIndex('by_user_createdAt', (q) => q.eq('userId', identity.subject))
      .collect();
    const active = runs.filter(
      (run) =>
        run.desktopInstallationId === desktopInstallationId &&
        ['preparing', 'implementing', 'verifying', 'repairing'].includes(run.status),
    );
    await Promise.all(
      active.map((run) =>
        ctx.db.patch(run._id, {
          status: 'needs_input',
          terminalReason: 'Desktop process stopped before the run completed',
          finishedAt: Date.now(),
        }),
      ),
    );
    return active.length;
  },
});

async function ownedRun(ctx: MutationCtx, id: Id<'runs'>) {
  const identity = await verifyIdentity(ctx);
  const run = await ctx.db.get(id);
  if (run?.userId !== identity.subject) throw new Error('Run not found');
  return run;
}

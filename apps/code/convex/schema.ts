import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  repos: defineTable({
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    installationId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index('by_owner_name', ['owner', 'name']),

  tickets: defineTable({
    repoId: v.id('repos'),
    createdBy: v.string(),
    title: v.string(),
    body: v.string(),
    status: v.union(v.literal('open'), v.literal('in_progress'), v.literal('done')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_repo', ['repoId'])
    .index('by_repo_created', ['repoId', 'createdAt']),

  threads: defineTable({
    ticketId: v.id('tickets'),
    createdAt: v.number(),
  }).index('by_ticket', ['ticketId']),

  messages: defineTable({
    threadId: v.id('threads'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    content: v.string(),
    createdAt: v.number(),
  })
    .index('by_thread', ['threadId'])
    .index('by_thread_created', ['threadId', 'createdAt']),

  runs: defineTable({
    ticketId: v.id('tickets'),
    status: v.union(
      v.literal('queued'),
      v.literal('running'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('needs_input'),
      v.literal('cancelled'),
    ),
    trigger: v.union(v.literal('user'), v.literal('retry'), v.literal('webhook')),
    baseBranch: v.optional(v.string()),
    headBranch: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    cancelRequestedAt: v.optional(v.number()),
    clientRunKey: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index('by_ticket', ['ticketId'])
    .index('by_status', ['status'])
    .index('by_ticket_created', ['ticketId', 'createdAt'])
    .index('by_ticket_client_key', ['ticketId', 'clientRunKey']),

  runEvents: defineTable({
    runId: v.id('runs'),
    type: v.string(),
    payload: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_run', ['runId'])
    .index('by_run_created', ['runId', 'createdAt']),
});

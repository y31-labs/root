import { verificationGateKinds } from '@workspace/code-agent-contracts/manifest';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import {
  conversationScope,
  deliveryStatus,
  mediaGroupItem,
  messagePart,
  messageStatus,
  sourceImage,
} from '#convex/chat/validators';

const runStatus = v.union(
  v.literal('queued'),
  v.literal('preparing'),
  v.literal('implementing'),
  v.literal('verifying'),
  v.literal('repairing'),
  v.literal('verified'),
  v.literal('failed'),
  v.literal('cancelled'),
  v.literal('needs_input'),
);

const flowNodeKind = v.union(v.literal('start'), v.literal('action'));

const gateKind = v.union(...verificationGateKinds.map((kind) => v.literal(kind)));

export default defineSchema({
  users: defineTable({}),

  identities: defineTable({
    userId: v.id('users'),
    provider: v.string(),
    externalAccountId: v.string(),
  }).index('by_provider_account', ['provider', 'externalAccountId']),

  chats: defineTable({
    userId: v.optional(v.id('users')),
    scope: conversationScope,
    activeMessageId: v.optional(v.id('messages')),
  }).index('by_user_scope', ['userId', 'scope']),

  chatChannels: defineTable({
    chatId: v.id('chats'),
    identityId: v.optional(v.id('identities')),
    provider: v.string(),
    integrationAccountId: v.string(),
    externalConversationId: v.string(),
  }).index('by_route', ['provider', 'integrationAccountId', 'externalConversationId']),

  messages: defineTable({
    chatId: v.id('chats'),
    channelId: v.id('chatChannels'),
    identityId: v.optional(v.id('identities')),
    role: v.union(v.literal('user'), v.literal('assistant')),
    parts: v.array(messagePart),
    externalEventId: v.optional(v.string()),
    externalMessageId: v.optional(v.string()),
    externalMediaGroupId: v.optional(v.string()),
    mediaGroupItems: v.optional(v.array(mediaGroupItem)),
    mediaGroupReadyAt: v.optional(v.number()),
    externalReplyIds: v.optional(v.array(v.string())),
    sourceImage: v.optional(sourceImage),
    unsupported: v.optional(v.boolean()),
    status: messageStatus,
    deliveryStatus: v.optional(deliveryStatus),
    replyTo: v.optional(v.id('messages')),
    error: v.optional(v.string()),
    recoveryJobId: v.optional(v.id('_scheduled_functions')),
  })
    .index('by_chat_status', ['chatId', 'status'])
    .index('by_chat_role_status', ['chatId', 'role', 'status', 'unsupported'])
    .index('by_channel_event', ['channelId', 'externalEventId'])
    .index('by_channel_media_group', ['channelId', 'externalMediaGroupId'])
    .index('by_reply', ['replyTo']),

  userProfiles: defineTable({
    userId: v.string(),
    firstName: v.union(v.string(), v.null()),
    lastName: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    profilePictureUrl: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),

  userSettings: defineTable({
    userId: v.string(),
    defaultEngine: v.literal('codex-local'),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),

  desktopRegistrations: defineTable({
    userId: v.string(),
    installationId: v.string(),
    name: v.string(),
    platform: v.literal('macos'),
    appVersion: v.string(),
    lastSeenAt: v.number(),
  })
    .index('by_user_lastSeenAt', ['userId', 'lastSeenAt'])
    .index('by_user_installationId', ['userId', 'installationId']),

  githubInstallations: defineTable({
    userId: v.string(),
    installationId: v.number(),
    accountLogin: v.optional(v.string()),
    accountType: v.optional(v.union(v.literal('User'), v.literal('Organization'))),
  })
    .index('by_user_installationId', ['userId', 'installationId'])
    .index('by_installationId', ['installationId']),

  repos: defineTable({
    userId: v.string(),
    publicId: v.string(),
    visibility: v.union(
      v.object({ type: v.literal('public') }),
      v.object({
        type: v.literal('private'),
        githubInstallationId: v.id('githubInstallations'),
      }),
    ),
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    selected: v.boolean(),
    manifest: v.optional(v.any()),
    manifestBaseSha: v.optional(v.string()),
    manifestApprovedAt: v.optional(v.number()),
  })
    .index('by_user_owner_name', ['userId', 'owner', 'name'])
    .index('by_publicId', ['publicId']),

  tickets: defineTable({
    userId: v.string(),
    repoId: v.id('repos'),
    title: v.string(),
    body: v.string(),
    status: v.union(v.literal('open'), v.literal('in_progress'), v.literal('done')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_updatedAt', ['userId', 'updatedAt'])
    .index('by_repoId', ['repoId']),

  runs: defineTable({
    userId: v.string(),
    ticketId: v.id('tickets'),
    repoId: v.id('repos'),
    desktopInstallationId: v.string(),
    engine: v.literal('codex-local'),
    codexVersion: v.string(),
    status: runStatus,
    baseCommitSha: v.string(),
    manifestSnapshot: v.any(),
    attempt: v.number(),
    maxAttempts: v.number(),
    verificationSummary: v.object({
      required: v.number(),
      passed: v.number(),
      failed: v.number(),
      missing: v.number(),
    }),
    changedFileCount: v.number(),
    terminalReason: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index('by_user_createdAt', ['userId', 'createdAt'])
    .index('by_ticket_createdAt', ['ticketId', 'createdAt'])
    .index('by_status_createdAt', ['status', 'createdAt']),

  gateResults: defineTable({
    runId: v.id('runs'),
    kind: gateKind,
    status: v.union(v.literal('passed'), v.literal('failed'), v.literal('skipped')),
    required: v.boolean(),
    attempt: v.number(),
    durationMs: v.number(),
    exitCode: v.optional(v.number()),
  }).index('by_run_kind_attempt', ['runId', 'kind', 'attempt']),

  flowNode: defineTable({
    externalId: v.string(),
    repositoryId: v.id('repos'),
    kind: flowNodeKind,
    title: v.string(),
    description: v.string(),
    order: v.number(),
  }).index('by_repository', ['repositoryId']),

  flowEdge: defineTable({
    externalId: v.string(),
    repositoryId: v.id('repos'),
    sourceNodeId: v.id('flowNode'),
    targetNodeId: v.id('flowNode'),
  }).index('by_repository', ['repositoryId']),
});

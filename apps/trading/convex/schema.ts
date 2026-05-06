import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  watchlists: defineTable({
    userId: v.string(),
    symbol: v.string(),
    label: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_user_symbol', ['userId', 'symbol']),
});

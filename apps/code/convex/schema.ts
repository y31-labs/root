import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  repos: defineTable({
    userId: v.string(),
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    selected: v.boolean(),
  }).index("by_user_owner_name", ["userId", "owner", "name"]),
});
